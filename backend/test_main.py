"""
test_stripe_extended.py
=======================
Extended tests for stripe_payments.py — targets the coverage gaps not covered
by test_main.py:

  • recalculate_wallet_balance  (all credit/debit branches)
  • credit_wallet_topup         (new credit + idempotency)
  • persist_wallet_balance
  • update_analytics            (existing doc, missing doc, partial payment)
  • /create-topup-session       (happy path, min-amount guard, stripe error)
  • /verify-topup-session       (paid, unpaid, already credited, no userId,
                                 Firestore error)
  • /webhook — wallet_topup     (new credit, already credited, no userId,
                                 Firestore error)
  • safe_meta                   (None, long string, normal value)
"""

import json
import pytest
from unittest.mock import MagicMock, patch, call
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


# =============================================================================
# HELPERS  (mirrors test_main.py style so they can be merged easily)
# =============================================================================

def make_mock_fs(tx_exists=True, tx_data=None, analytics_exists=True, analytics_data=None):
    if tx_data is None:
        tx_data = {"paymentStatus": "pending", "status": "accepted", "paymentType": "full_online"}
    if analytics_data is None:
        analytics_data = {"totalRevenue": 100.0, "onlineRevenue": 80.0}

    tx_snap = MagicMock()
    tx_snap.exists = tx_exists
    tx_snap.to_dict.return_value = tx_data

    tx_doc = MagicMock()
    tx_doc.get.return_value = tx_snap

    tx_collection = MagicMock()
    tx_collection.document.return_value = tx_doc

    analytics_snap = MagicMock()
    analytics_snap.exists = analytics_exists
    analytics_snap.to_dict.return_value = analytics_data

    analytics_doc = MagicMock()
    analytics_doc.get.return_value = analytics_snap

    analytics_collection = MagicMock()
    analytics_collection.document.return_value = analytics_doc

    def collection_router(name):
        if name == "analytics":
            return analytics_collection
        return tx_collection

    mock_fs = MagicMock()
    mock_fs.collection.side_effect = collection_router
    return mock_fs, tx_doc, analytics_doc


def make_fake_stripe_session(payment_status="paid", amount_total=10000, metadata=None):
    s = MagicMock()
    s.payment_status = payment_status
    s.amount_total = amount_total
    s.id = "cs_test_123"
    s.metadata = metadata if metadata is not None else {"transactionId": "tx123"}
    s.client_reference_id = "tx123"
    return s


def _stream_docs(rows):
    """Turn a list of dicts into a list of mock Firestore doc snapshots."""
    docs = []
    for i, data in enumerate(rows):
        d = MagicMock()
        d.id = f"doc_{i}"
        d.to_dict.return_value = data
        docs.append(d)
    return docs


def _make_rich_fs(
    seller_txs=None,
    cancelled_buyer_txs=None,
    ads=None,
    manual_txs=None,
    wallet_topup_existing=None,   # list returned by idempotency query
):
    """
    Build a mock Firestore wired for recalculate_wallet_balance and
    credit_wallet_topup.  Each argument is a list of dicts.
    """
    seller_txs          = seller_txs          or []
    cancelled_buyer_txs = cancelled_buyer_txs or []
    ads                 = ads                 or []
    manual_txs          = manual_txs          or []
    wallet_topup_existing = wallet_topup_existing or []

    mock_fs = MagicMock()

    def collection_side_effect(name):
        col = MagicMock()

        if name == "transactions":
            def where_chain_tx(*args, **kwargs):
                inner = MagicMock()
                # second .where() — distinguish seller vs buyer by first arg
                def where2(*a2, **k2):
                    inner2 = MagicMock()
                    inner2.stream.return_value = iter(
                        _stream_docs(seller_txs) if "sellerId" in args
                        else _stream_docs(cancelled_buyer_txs)
                    )
                    # support a third .where() for "in" filter
                    inner2.where.return_value = inner2
                    return inner2
                inner.where.side_effect = where2
                inner.stream.return_value = iter(
                    _stream_docs(seller_txs) if "sellerId" in args
                    else _stream_docs(cancelled_buyer_txs)
                )
                return inner
            col.where.side_effect = where_chain_tx

        elif name == "ads":
            def where_chain_ads(*args, **kwargs):
                inner = MagicMock()
                inner.stream.return_value = iter(_stream_docs(ads))
                return inner
            col.where.side_effect = where_chain_ads

        elif name == "walletTransactions":
            def where_chain_wt(*a, **k):
                inner = MagicMock()
                def where2(*a2, **k2):
                    inner2 = MagicMock()
                    def limit(*a3, **k3):
                        lim = MagicMock()
                        lim.stream.return_value = iter(
                            _stream_docs(wallet_topup_existing)
                        )
                        return lim
                    inner2.limit.side_effect = limit
                    inner2.stream.return_value = iter(_stream_docs(manual_txs))
                    inner2.where.return_value = inner2
                    return inner2
                inner.where.side_effect = where2
                inner.stream.return_value = iter(_stream_docs(manual_txs))
                return inner
            col.where.side_effect = where_chain_wt
            col.add = MagicMock()

        elif name == "users":
            user_doc = MagicMock()
            col.document.return_value = user_doc

        return col

    mock_fs.collection.side_effect = collection_side_effect
    return mock_fs


# =============================================================================
# safe_meta
# =============================================================================

def test_safe_meta_none_returns_empty_string():
    from routes.stripe_payments import safe_meta
    assert safe_meta(None) == ""


def test_safe_meta_normal_value():
    from routes.stripe_payments import safe_meta
    assert safe_meta("hello") == "hello"


def test_safe_meta_truncates_long_string():
    from routes.stripe_payments import safe_meta
    long_str = "x" * 600
    result = safe_meta(long_str)
    assert len(result) == 500


def test_safe_meta_converts_non_string():
    from routes.stripe_payments import safe_meta
    assert safe_meta(42) == "42"


# =============================================================================
# update_analytics
# =============================================================================

def test_update_analytics_existing_doc_adds_revenue():
    from routes.stripe_payments import update_analytics
    mock_fs, _, analytics_doc = make_mock_fs(
        analytics_exists=True,
        analytics_data={"totalRevenue": 200.0, "onlineRevenue": 150.0},
    )
    update_analytics(mock_fs, 50.0, "full_online", {})
    analytics_doc.update.assert_called_once()
    args = analytics_doc.update.call_args[0][0]
    assert args["totalRevenue"] == 250.0
    assert args["onlineRevenue"] == 200.0


def test_update_analytics_missing_doc_calls_set():
    from routes.stripe_payments import update_analytics
    mock_fs, _, analytics_doc = make_mock_fs(analytics_exists=False)
    update_analytics(mock_fs, 75.0, "full_online", {})
    analytics_doc.set.assert_called_once()
    doc_data = analytics_doc.set.call_args[0][0]
    assert doc_data["totalRevenue"] == 75.0
    assert doc_data["onlineRevenue"] == 75.0
    assert doc_data["pendingCashRevenue"] == 0
    assert doc_data["totalRefunds"] == 0


def test_update_analytics_partial_uses_online_amount():
    from routes.stripe_payments import update_analytics
    mock_fs, _, analytics_doc = make_mock_fs(
        analytics_exists=True,
        analytics_data={"totalRevenue": 100.0, "onlineRevenue": 100.0},
    )
    tx_data = {"paymentType": "partial", "onlineAmount": 30.0}
    # amount arg is 50 but onlineAmount in tx_data is 30 — must use 30
    update_analytics(mock_fs, 50.0, "partial", tx_data)
    args = analytics_doc.update.call_args[0][0]
    assert args["totalRevenue"] == 130.0   # 100 + 30
    assert args["onlineRevenue"] == 130.0


def test_update_analytics_partial_no_online_amount_falls_back_to_amount():
    from routes.stripe_payments import update_analytics
    mock_fs, _, analytics_doc = make_mock_fs(
        analytics_exists=True,
        analytics_data={"totalRevenue": 0.0, "onlineRevenue": 0.0},
    )
    tx_data = {"paymentType": "partial"}  # no onlineAmount key
    update_analytics(mock_fs, 40.0, "partial", tx_data)
    args = analytics_doc.update.call_args[0][0]
    assert args["totalRevenue"] == 40.0


# =============================================================================
# recalculate_wallet_balance
# =============================================================================

def test_recalculate_wallet_balance_empty_returns_zero():
    from routes.stripe_payments import recalculate_wallet_balance
    mock_fs = _make_rich_fs()
    result = recalculate_wallet_balance(mock_fs, "user1")
    assert result == 0.0


def test_recalculate_wallet_balance_completed_sale_credits():
    from routes.stripe_payments import recalculate_wallet_balance
    mock_fs = _make_rich_fs(
        seller_txs=[{"type": "sale", "agreedPrice": 150.0, "buyerId": "buyer99"}]
    )
    result = recalculate_wallet_balance(mock_fs, "user1")
    assert result == 150.0


def test_recalculate_wallet_balance_skips_trade_type():
    from routes.stripe_payments import recalculate_wallet_balance
    mock_fs = _make_rich_fs(
        seller_txs=[{"type": "trade", "agreedPrice": 200.0, "buyerId": "buyer99"}]
    )
    result = recalculate_wallet_balance(mock_fs, "user1")
    assert result == 0.0


def test_recalculate_wallet_balance_skips_self_purchase_as_seller():
    from routes.stripe_payments import recalculate_wallet_balance
    # buyerId == user_id  → should be skipped
    mock_fs = _make_rich_fs(
        seller_txs=[{"type": "sale", "agreedPrice": 100.0, "buyerId": "user1"}]
    )
    result = recalculate_wallet_balance(mock_fs, "user1")
    assert result == 0.0


def test_recalculate_wallet_balance_skips_zero_price():
    from routes.stripe_payments import recalculate_wallet_balance
    mock_fs = _make_rich_fs(
        seller_txs=[{"type": "sale", "agreedPrice": 0.0, "buyerId": "other"}]
    )
    result = recalculate_wallet_balance(mock_fs, "user1")
    assert result == 0.0


def test_recalculate_wallet_balance_cancelled_online_refunds_buyer():
    from routes.stripe_payments import recalculate_wallet_balance
    mock_fs = _make_rich_fs(
        cancelled_buyer_txs=[{
            "paymentType": "full_online",
            "paymentProvider": "stripe",
            "agreedPrice": 80.0,
            "sellerId": "seller99",
        }]
    )
    result = recalculate_wallet_balance(mock_fs, "user1")
    assert result == 80.0


def test_recalculate_wallet_balance_cancelled_cash_no_refund():
    from routes.stripe_payments import recalculate_wallet_balance
    mock_fs = _make_rich_fs(
        cancelled_buyer_txs=[{
            "paymentType": "cash",
            "agreedPrice": 100.0,
            "sellerId": "seller99",
        }]
    )
    result = recalculate_wallet_balance(mock_fs, "user1")
    assert result == 0.0


def test_recalculate_wallet_balance_cancelled_cod_no_refund():
    from routes.stripe_payments import recalculate_wallet_balance
    mock_fs = _make_rich_fs(
        cancelled_buyer_txs=[{
            "paymentType": "cod",
            "agreedPrice": 100.0,
            "sellerId": "seller99",
        }]
    )
    result = recalculate_wallet_balance(mock_fs, "user1")
    assert result == 0.0


def test_recalculate_wallet_balance_cancelled_trade_no_refund():
    from routes.stripe_payments import recalculate_wallet_balance
    mock_fs = _make_rich_fs(
        cancelled_buyer_txs=[{
            "paymentType": "trade",
            "agreedPrice": 100.0,
            "sellerId": "seller99",
        }]
    )
    result = recalculate_wallet_balance(mock_fs, "user1")
    assert result == 0.0


def test_recalculate_wallet_balance_cancelled_partial_uses_online_amount():
    from routes.stripe_payments import recalculate_wallet_balance
    mock_fs = _make_rich_fs(
        cancelled_buyer_txs=[{
            "paymentType": "partial",
            "agreedPrice": 200.0,
            "onlineAmount": 60.0,
            "sellerId": "seller99",
        }]
    )
    result = recalculate_wallet_balance(mock_fs, "user1")
    assert result == 60.0


def test_recalculate_wallet_balance_cancelled_partial_zero_online_amount_skipped():
    from routes.stripe_payments import recalculate_wallet_balance
    mock_fs = _make_rich_fs(
        cancelled_buyer_txs=[{
            "paymentType": "partial",
            "agreedPrice": 200.0,
            "onlineAmount": 0.0,
            "sellerId": "seller99",
        }]
    )
    result = recalculate_wallet_balance(mock_fs, "user1")
    assert result == 0.0


def test_recalculate_wallet_balance_cancelled_skips_self_purchase_as_buyer():
    from routes.stripe_payments import recalculate_wallet_balance
    # sellerId == user_id → skip
    mock_fs = _make_rich_fs(
        cancelled_buyer_txs=[{
            "paymentType": "full_online",
            "agreedPrice": 90.0,
            "sellerId": "user1",
        }]
    )
    result = recalculate_wallet_balance(mock_fs, "user1")
    assert result == 0.0


def test_recalculate_wallet_balance_ad_deducted():
    from routes.stripe_payments import recalculate_wallet_balance
    mock_fs = _make_rich_fs(
        ads=[{"type": "banner", "sellerId": "user1"}]
    )
    result = recalculate_wallet_balance(mock_fs, "user1")
    assert result == -50.0   # banner = R50


def test_recalculate_wallet_balance_premium_popup_deducted():
    from routes.stripe_payments import recalculate_wallet_balance
    mock_fs = _make_rich_fs(
        ads=[{"type": "premium-popup", "sellerId": "user1"}]
    )
    result = recalculate_wallet_balance(mock_fs, "user1")
    assert result == -150.0  # premium-popup = R150


def test_recalculate_wallet_balance_unknown_ad_type_skipped():
    from routes.stripe_payments import recalculate_wallet_balance
    mock_fs = _make_rich_fs(
        ads=[{"type": "unknown-type", "sellerId": "user1"}]
    )
    result = recalculate_wallet_balance(mock_fs, "user1")
    assert result == 0.0


def test_recalculate_wallet_balance_manual_topup_credits():
    from routes.stripe_payments import recalculate_wallet_balance
    mock_fs = _make_rich_fs(
        manual_txs=[{
            "type": "topup", "direction": "credit",
            "amount": 200.0, "userId": "user1",
        }]
    )
    result = recalculate_wallet_balance(mock_fs, "user1")
    assert result == 200.0


def test_recalculate_wallet_balance_manual_withdrawal_debits():
    from routes.stripe_payments import recalculate_wallet_balance
    mock_fs = _make_rich_fs(
        manual_txs=[{
            "type": "withdrawal", "direction": "debit",
            "amount": 50.0, "userId": "user1",
        }]
    )
    result = recalculate_wallet_balance(mock_fs, "user1")
    assert result == -50.0


def test_recalculate_wallet_balance_ignores_legacy_ad_debit_entries():
    from routes.stripe_payments import recalculate_wallet_balance
    mock_fs = _make_rich_fs(
        manual_txs=[{
            "type": "ad_debit", "direction": "debit",
            "amount": 50.0, "userId": "user1",
        }]
    )
    result = recalculate_wallet_balance(mock_fs, "user1")
    assert result == 0.0   # ad_debit is not "topup" or "withdrawal" → ignored


def test_recalculate_wallet_balance_combined_scenario():
    from routes.stripe_payments import recalculate_wallet_balance
    mock_fs = _make_rich_fs(
        seller_txs=[{"type": "sale", "agreedPrice": 300.0, "buyerId": "b1"}],
        ads=[{"type": "banner"}],
        manual_txs=[{"type": "topup", "direction": "credit", "amount": 100.0, "userId": "u1"}],
    )
    # 300 (sale) - 50 (banner) + 100 (topup) = 350
    result = recalculate_wallet_balance(mock_fs, "u1")
    assert result == 350.0


def test_recalculate_wallet_balance_uses_listing_price_fallback():
    """agreedPrice missing — should fall back to listingPrice then price."""
    from routes.stripe_payments import recalculate_wallet_balance
    mock_fs = _make_rich_fs(
        seller_txs=[{"type": "sale", "listingPrice": 120.0, "buyerId": "b1"}]
    )
    result = recalculate_wallet_balance(mock_fs, "u1")
    assert result == 120.0


# =============================================================================
# persist_wallet_balance
# =============================================================================

def test_persist_wallet_balance_calls_update():
    from routes.stripe_payments import persist_wallet_balance
    mock_fs = MagicMock()
    user_doc = MagicMock()
    mock_fs.collection.return_value.document.return_value = user_doc

    persist_wallet_balance(mock_fs, "user1", 123.45)

    mock_fs.collection.assert_called_with("users")
    mock_fs.collection.return_value.document.assert_called_with("user1")
    user_doc.update.assert_called_once()
    update_data = user_doc.update.call_args[0][0]
    assert update_data["walletBalance"] == 123.45


# =============================================================================
# credit_wallet_topup
# =============================================================================

def test_credit_wallet_topup_writes_entry_and_returns_balance():
    from routes.stripe_payments import credit_wallet_topup
    mock_fs = _make_rich_fs(
        wallet_topup_existing=[],   # not yet credited
        seller_txs=[],
        manual_txs=[],
    )
    result = credit_wallet_topup(mock_fs, "user1", 100.0, "sess_abc")
    # Should return a numeric balance (0.0 with no other data)
    assert isinstance(result, float)


def test_credit_wallet_topup_idempotent_returns_none():
    from routes.stripe_payments import credit_wallet_topup
    # Simulate existing record for this session_id
    mock_fs = _make_rich_fs(
        wallet_topup_existing=[{"refId": "sess_already", "userId": "user1"}],
    )
    result = credit_wallet_topup(mock_fs, "user1", 50.0, "sess_already")
    assert result is None


# =============================================================================
# POST /api/stripe/create-topup-session
# =============================================================================

def _topup_payload(**overrides):
    base = {
        "userId":      "user1",
        "userEmail":   "user@test.com",
        "amount":      100.0,
        "description": "Top up my wallet",
        "currency":    "zar",
        "successUrl":  "http://localhost:5173/wallet?success=1",
        "cancelUrl":   "http://localhost:5173/wallet?cancel=1",
        "metadata":    {},
    }
    base.update(overrides)
    return base


def test_create_topup_session_success():
    fake_session = MagicMock()
    fake_session.id  = "cs_topup_1"
    fake_session.url = "https://checkout.stripe.com/pay/cs_topup_1"
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.create.return_value = fake_session

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
        response = client.post("/api/stripe/create-topup-session", json=_topup_payload())

    assert response.status_code == 200
    assert response.json() == {"id": "cs_topup_1", "url": "https://checkout.stripe.com/pay/cs_topup_1"}


def test_create_topup_session_minimum_amount_enforced():
    """amount < R10 (i.e. < 1000 cents) should return 400."""
    with patch("routes.stripe_payments.get_stripe", return_value=MagicMock()):
        response = client.post("/api/stripe/create-topup-session", json=_topup_payload(amount=5.0))
    assert response.status_code == 400
    assert "R10" in response.json()["detail"]


def test_create_topup_session_exactly_10_rand_passes():
    fake_session = MagicMock()
    fake_session.id  = "cs_min"
    fake_session.url = "https://checkout.stripe.com/pay/cs_min"
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.create.return_value = fake_session

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
        response = client.post("/api/stripe/create-topup-session", json=_topup_payload(amount=10.0))
    assert response.status_code == 200


def test_create_topup_session_amount_converted_to_cents():
    """R100 → 10000 cents in Stripe line item."""
    fake_session = MagicMock()
    fake_session.id  = "cs_t"
    fake_session.url = "https://checkout.stripe.com/pay/cs_t"
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.create.return_value = fake_session

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
        client.post("/api/stripe/create-topup-session", json=_topup_payload(amount=100.0))

    create_args = fake_stripe.checkout.Session.create.call_args.kwargs
    assert create_args["line_items"][0]["price_data"]["unit_amount"] == 10000


def test_create_topup_session_success_url_appended_with_ampersand():
    fake_session = MagicMock()
    fake_session.id  = "cs_t"
    fake_session.url = "https://checkout.stripe.com/pay/cs_t"
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.create.return_value = fake_session

    # successUrl already has ?  → must use &
    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
        client.post(
            "/api/stripe/create-topup-session",
            json=_topup_payload(successUrl="http://localhost:5173/wallet?success=1"),
        )

    create_args = fake_stripe.checkout.Session.create.call_args.kwargs
    assert "&session_id=" in create_args["success_url"]


def test_create_topup_session_success_url_appended_with_question_mark():
    fake_session = MagicMock()
    fake_session.id  = "cs_t"
    fake_session.url = "https://checkout.stripe.com/pay/cs_t"
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.create.return_value = fake_session

    # successUrl has no ? → must use ?
    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
        client.post(
            "/api/stripe/create-topup-session",
            json=_topup_payload(successUrl="http://localhost:5173/wallet-success"),
        )

    create_args = fake_stripe.checkout.Session.create.call_args.kwargs
    assert "?session_id=" in create_args["success_url"]


def test_create_topup_session_uses_description_as_product_name():
    fake_session = MagicMock()
    fake_session.id  = "cs_t"
    fake_session.url = "https://checkout.stripe.com/pay/cs_t"
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.create.return_value = fake_session

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
        client.post(
            "/api/stripe/create-topup-session",
            json=_topup_payload(description="My custom description"),
        )

    create_args = fake_stripe.checkout.Session.create.call_args.kwargs
    product_name = create_args["line_items"][0]["price_data"]["product_data"]["name"]
    assert product_name == "My custom description"


def test_create_topup_session_default_product_name_when_no_description():
    fake_session = MagicMock()
    fake_session.id  = "cs_t"
    fake_session.url = "https://checkout.stripe.com/pay/cs_t"
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.create.return_value = fake_session

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
        client.post(
            "/api/stripe/create-topup-session",
            json=_topup_payload(description=""),
        )

    create_args = fake_stripe.checkout.Session.create.call_args.kwargs
    product_name = create_args["line_items"][0]["price_data"]["product_data"]["name"]
    assert "Campus Marketplace" in product_name
    assert "Top-up" in product_name


def test_create_topup_session_metadata_passed_through():
    fake_session = MagicMock()
    fake_session.id  = "cs_t"
    fake_session.url = "https://checkout.stripe.com/pay/cs_t"
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.create.return_value = fake_session

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
        client.post(
            "/api/stripe/create-topup-session",
            json=_topup_payload(metadata={"source": "mobile"}),
        )

    create_args = fake_stripe.checkout.Session.create.call_args.kwargs
    assert create_args["metadata"]["source"] == "mobile"
    assert create_args["metadata"]["type"] == "wallet_topup"
    assert create_args["metadata"]["userId"] == "user1"


def test_create_topup_session_stripe_error_returns_500():
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.create.side_effect = Exception("Top-up card error")

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
        response = client.post("/api/stripe/create-topup-session", json=_topup_payload())

    assert response.status_code == 500
    assert "Top-up card error" in response.json()["detail"]


# =============================================================================
# POST /api/stripe/verify-topup-session
# =============================================================================

def _verify_topup_payload(**overrides):
    base = {"sessionId": "cs_topup_1", "userId": "user1", "amount": 100.0}
    base.update(overrides)
    return base


def test_verify_topup_session_not_paid_returns_false():
    fake_session = make_fake_stripe_session(payment_status="unpaid")
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.retrieve.return_value = fake_session

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
        response = client.post("/api/stripe/verify-topup-session", json=_verify_topup_payload())

    assert response.status_code == 200
    assert response.json()["paid"] == False
    assert response.json()["status"] == "unpaid"


def test_verify_topup_session_paid_no_firestore():
    fake_session = make_fake_stripe_session(payment_status="paid", amount_total=10000)
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.retrieve.return_value = fake_session

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
         patch("routes.stripe_payments.get_firestore", return_value=None):
        response = client.post("/api/stripe/verify-topup-session", json=_verify_topup_payload())

    assert response.status_code == 200
    assert response.json()["paid"] == True
    assert "warning" in response.json()


def test_verify_topup_session_paid_new_credit():
    fake_session = make_fake_stripe_session(
        payment_status="paid", amount_total=10000,
        metadata={"type": "wallet_topup", "userId": "user1"},
    )
    fake_session.client_reference_id = "user1"
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.retrieve.return_value = fake_session

    mock_fs = _make_rich_fs(wallet_topup_existing=[])  # not yet credited

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
         patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
        response = client.post("/api/stripe/verify-topup-session", json=_verify_topup_payload())

    assert response.status_code == 200
    data = response.json()
    assert data["paid"] == True
    assert data["alreadyCredited"] == False
    assert data["userId"] == "user1"
    assert data["amountRand"] == 100.0   # 10000 cents / 100


def test_verify_topup_session_already_credited():
    fake_session = make_fake_stripe_session(
        payment_status="paid", amount_total=10000,
        metadata={"type": "wallet_topup", "userId": "user1"},
    )
    fake_session.client_reference_id = "user1"
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.retrieve.return_value = fake_session

    mock_fs = _make_rich_fs(
        wallet_topup_existing=[{"refId": "cs_topup_1", "userId": "user1"}]
    )

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
         patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
        response = client.post("/api/stripe/verify-topup-session", json=_verify_topup_payload())

    assert response.status_code == 200
    assert response.json()["alreadyCredited"] == True
    assert response.json()["newBalance"] is None


def test_verify_topup_session_resolves_user_id_from_metadata():
    """userId missing from payload — should fall back to session metadata."""
    fake_session = make_fake_stripe_session(
        payment_status="paid", amount_total=5000,
        metadata={"type": "wallet_topup", "userId": "meta_user"},
    )
    fake_session.client_reference_id = "meta_user"
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.retrieve.return_value = fake_session

    mock_fs = _make_rich_fs(wallet_topup_existing=[])

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
         patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
        response = client.post(
            "/api/stripe/verify-topup-session",
            json={"sessionId": "cs_topup_1", "userId": "", "amount": 50.0},
        )

    assert response.status_code == 200
    assert response.json()["userId"] == "meta_user"


def test_verify_topup_session_no_user_id_returns_400():
    """If userId cannot be resolved anywhere, return 400."""
    fake_session = make_fake_stripe_session(
        payment_status="paid", amount_total=5000,
        metadata={},
    )
    fake_session.client_reference_id = None
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.retrieve.return_value = fake_session

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
         patch("routes.stripe_payments.get_firestore", return_value=MagicMock()):
        response = client.post(
            "/api/stripe/verify-topup-session",
            json={"sessionId": "cs_topup_1", "userId": "", "amount": 0},
        )

    assert response.status_code == 400


def test_verify_topup_session_stripe_error_returns_500():
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.retrieve.side_effect = Exception("Stripe timeout")

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
        response = client.post("/api/stripe/verify-topup-session", json=_verify_topup_payload())

    assert response.status_code == 500
    assert "Stripe timeout" in response.json()["detail"]


def test_verify_topup_session_firestore_error_returns_500():
    fake_session = make_fake_stripe_session(
        payment_status="paid", amount_total=10000,
        metadata={"userId": "user1"},
    )
    fake_session.client_reference_id = "user1"
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.retrieve.return_value = fake_session

    mock_fs = MagicMock()
    mock_fs.collection.side_effect = Exception("DB down")

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
         patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
        response = client.post("/api/stripe/verify-topup-session", json=_verify_topup_payload())

    assert response.status_code == 500
    assert "DB down" in response.json()["detail"]


# =============================================================================
# WEBHOOK — wallet_topup path
# =============================================================================

def _wallet_topup_event(session_id="cs_wh_1", user_id="user1", amount_total=10000):
    return {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": session_id,
                "payment_status": "paid",
                "amount_total": amount_total,
                "metadata": {"type": "wallet_topup", "userId": user_id},
                "client_reference_id": user_id,
            }
        },
    }


def test_webhook_wallet_topup_credits_new_entry():
    event = _wallet_topup_event()
    fake_stripe = MagicMock()
    fake_stripe.Webhook.construct_event.return_value = event

    mock_fs = _make_rich_fs(wallet_topup_existing=[])

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
         patch("routes.stripe_payments.get_firestore", return_value=mock_fs), \
         patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": "whsec_test"}):
        response = client.post(
            "/api/stripe/webhook",
            content=json.dumps(event).encode(),
            headers={"stripe-signature": "sig", "content-type": "application/json"},
        )

    assert response.status_code == 200
    assert response.json() == {"received": True}


def test_webhook_wallet_topup_already_credited_is_idempotent():
    event = _wallet_topup_event(session_id="cs_already")
    fake_stripe = MagicMock()
    fake_stripe.Webhook.construct_event.return_value = event

    mock_fs = _make_rich_fs(
        wallet_topup_existing=[{"refId": "cs_already", "userId": "user1"}]
    )

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
         patch("routes.stripe_payments.get_firestore", return_value=mock_fs), \
         patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": "whsec_test"}):
        response = client.post(
            "/api/stripe/webhook",
            content=json.dumps(event).encode(),
            headers={"stripe-signature": "sig", "content-type": "application/json"},
        )

    assert response.status_code == 200
    assert response.json() == {"received": True}


def test_webhook_wallet_topup_no_user_id_skips_gracefully():
    event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_wh_1",
                "payment_status": "paid",
                "amount_total": 5000,
                "metadata": {"type": "wallet_topup"},   # no userId
                "client_reference_id": None,
            }
        },
    }
    fake_stripe = MagicMock()
    fake_stripe.Webhook.construct_event.return_value = event

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
         patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": "whsec_test"}):
        response = client.post(
            "/api/stripe/webhook",
            content=json.dumps(event).encode(),
            headers={"stripe-signature": "sig", "content-type": "application/json"},
        )

    assert response.status_code == 200
    assert response.json() == {"received": True}


def test_webhook_wallet_topup_no_firestore_returns_received():
    event = _wallet_topup_event()
    fake_stripe = MagicMock()
    fake_stripe.Webhook.construct_event.return_value = event

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
         patch("routes.stripe_payments.get_firestore", return_value=None), \
         patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": "whsec_test"}):
        response = client.post(
            "/api/stripe/webhook",
            content=json.dumps(event).encode(),
            headers={"stripe-signature": "sig", "content-type": "application/json"},
        )

    assert response.status_code == 200
    assert response.json() == {"received": True}


def test_webhook_wallet_topup_firestore_error_returns_500():
    event = _wallet_topup_event()
    fake_stripe = MagicMock()
    fake_stripe.Webhook.construct_event.return_value = event

    mock_fs = MagicMock()
    mock_fs.collection.side_effect = Exception("Firestore exploded")

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
         patch("routes.stripe_payments.get_firestore", return_value=mock_fs), \
         patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": "whsec_test"}):
        response = client.post(
            "/api/stripe/webhook",
            content=json.dumps(event).encode(),
            headers={"stripe-signature": "sig", "content-type": "application/json"},
        )

    assert response.status_code == 500


def test_webhook_non_checkout_event_type_ignored():
    """Events other than checkout.session.completed should return received=True quietly."""
    event = {"type": "payment_intent.created", "data": {"object": {}}}
    fake_stripe = MagicMock()
    fake_stripe.Webhook.construct_event.return_value = event

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
         patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": "whsec_test"}):
        response = client.post(
            "/api/stripe/webhook",
            content=json.dumps(event).encode(),
            headers={"stripe-signature": "sig", "content-type": "application/json"},
        )

    assert response.status_code == 200
    assert response.json() == {"received": True}