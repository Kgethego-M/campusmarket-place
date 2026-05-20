"""
test_stripe_payments_full.py
============================
Full test suite for stripe_payments.py — maximises CodeCov by hitting
every branch, edge case, and error path.
"""

import json
import pytest
from unittest.mock import MagicMock, patch, call
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


# =============================================================================
# HELPERS
# =============================================================================

def make_fake_session(
    payment_status="paid",
    amount_total=10000,
    metadata=None,
    client_reference_id="tx123",
    session_id="cs_test_123",
):
    s = MagicMock()
    s.payment_status = payment_status
    s.amount_total = amount_total
    s.id = session_id
    s.metadata = metadata if metadata is not None else {"transactionId": "tx123"}
    s.client_reference_id = client_reference_id
    return s


def stream_docs(rows):
    """Turn list of dicts into mock Firestore doc snapshots."""
    docs = []
    for i, data in enumerate(rows):
        d = MagicMock()
        d.id = f"doc_{i}"
        d.to_dict.return_value = data
        docs.append(d)
    return docs


def make_rich_fs(
    seller_txs=None,
    cancelled_buyer_txs=None,
    ads=None,
    manual_txs=None,
    wallet_topup_existing=None,
):
    """
    Full mock Firestore for recalculate_wallet_balance and credit_wallet_topup.
    """
    seller_txs            = seller_txs            or []
    cancelled_buyer_txs   = cancelled_buyer_txs   or []
    ads                   = ads                   or []
    manual_txs            = manual_txs            or []
    wallet_topup_existing = wallet_topup_existing or []

    mock_fs = MagicMock()

    def collection_side(name):
        col = MagicMock()

        if name == "transactions":
            def where_tx(*args, **kwargs):
                inner = MagicMock()
                def where2(*a2, **k2):
                    inner2 = MagicMock()
                    inner2.where.return_value = inner2
                    inner2.stream.return_value = iter(
                        stream_docs(seller_txs) if "sellerId" in args
                        else stream_docs(cancelled_buyer_txs)
                    )
                    return inner2
                inner.where.side_effect = where2
                inner.stream.return_value = iter(
                    stream_docs(seller_txs) if "sellerId" in args
                    else stream_docs(cancelled_buyer_txs)
                )
                return inner
            col.where.side_effect = where_tx

        elif name == "ads":
            def where_ads(*args, **kwargs):
                inner = MagicMock()
                inner.stream.return_value = iter(stream_docs(ads))
                return inner
            col.where.side_effect = where_ads

        elif name == "walletTransactions":
            def where_wt(*a, **k):
                inner = MagicMock()
                def where2(*a2, **k2):
                    inner2 = MagicMock()
                    def limit_fn(*a3, **k3):
                        lim = MagicMock()
                        lim.stream.return_value = iter(stream_docs(wallet_topup_existing))
                        return lim
                    inner2.limit.side_effect = limit_fn
                    inner2.stream.return_value = iter(stream_docs(manual_txs))
                    inner2.where.return_value = inner2
                    return inner2
                inner.where.side_effect = where2
                inner.stream.return_value = iter(stream_docs(manual_txs))
                return inner
            col.where.side_effect = where_wt
            col.add = MagicMock()

        elif name == "users":
            user_doc = MagicMock()
            col.document.return_value = user_doc

        elif name == "analytics":
            analytics_snap = MagicMock()
            analytics_snap.exists = False
            analytics_doc = MagicMock()
            analytics_doc.get.return_value = analytics_snap
            col.document.return_value = analytics_doc

        return col

    mock_fs.collection.side_effect = collection_side
    return mock_fs


def make_tx_fs(tx_exists=True, payment_status="pending", extra_tx=None):
    """Minimal Firestore mock for verify-session / webhook transaction tests."""
    tx_data = {"paymentStatus": payment_status, "paymentType": "full_online"}
    if extra_tx:
        tx_data.update(extra_tx)

    tx_snap = MagicMock()
    tx_snap.exists = tx_exists
    tx_snap.to_dict.return_value = tx_data

    tx_doc = MagicMock()
    tx_doc.get.return_value = tx_snap

    tx_col = MagicMock()
    tx_col.document.return_value = tx_doc

    analytics_snap = MagicMock()
    analytics_snap.exists = False
    analytics_doc = MagicMock()
    analytics_doc.get.return_value = analytics_snap
    analytics_col = MagicMock()
    analytics_col.document.return_value = analytics_doc

    mock_fs = MagicMock()

    def col_router(name):
        if name == "analytics":
            return analytics_col
        return tx_col

    mock_fs.collection.side_effect = col_router
    return mock_fs, tx_doc


# =============================================================================
# safe_meta
# =============================================================================

class TestSafeMeta:

    def test_none_returns_empty_string(self):
        from routes.stripe_payments import safe_meta
        assert safe_meta(None) == ""

    def test_normal_string_returned_unchanged(self):
        from routes.stripe_payments import safe_meta
        assert safe_meta("hello") == "hello"

    def test_long_string_truncated_to_500(self):
        from routes.stripe_payments import safe_meta
        assert len(safe_meta("x" * 600)) == 500

    def test_exactly_500_chars_not_truncated(self):
        from routes.stripe_payments import safe_meta
        assert len(safe_meta("x" * 500)) == 500

    def test_integer_converted_to_string(self):
        from routes.stripe_payments import safe_meta
        assert safe_meta(42) == "42"

    def test_float_converted_to_string(self):
        from routes.stripe_payments import safe_meta
        assert safe_meta(3.14) == "3.14"

    def test_zero_converted_to_string(self):
        from routes.stripe_payments import safe_meta
        assert safe_meta(0) == "0"


# =============================================================================
# get_firestore
# =============================================================================

class TestGetFirestore:

    def _clear_firebase(self):
        import firebase_admin
        if firebase_admin._apps:
            firebase_admin.delete_app(firebase_admin.get_app())

    def test_no_credentials_returns_none(self):
        from routes.stripe_payments import get_firestore
        self._clear_firebase()
        import os
        os.environ.pop("FIREBASE_SERVICE_ACCOUNT_JSON", None)
        result = get_firestore()
        assert result is None

    def test_bad_json_returns_none(self):
        from routes.stripe_payments import get_firestore
        self._clear_firebase()
        with patch.dict("os.environ", {"FIREBASE_SERVICE_ACCOUNT_JSON": "not-valid-json"}):
            result = get_firestore()
        assert result is None

    def test_certificate_exception_returns_none(self):
        from routes.stripe_payments import get_firestore
        self._clear_firebase()
        with patch.dict("os.environ", {"FIREBASE_SERVICE_ACCOUNT_JSON": '{"type":"service_account"}'}), \
             patch("routes.stripe_payments.credentials.Certificate", side_effect=Exception("bad cert")):
            result = get_firestore()
        assert result is None

    def test_already_initialised_returns_client(self):
        from routes.stripe_payments import get_firestore
        mock_client = MagicMock()
        with patch("routes.stripe_payments.firestore.client", return_value=mock_client), \
             patch("firebase_admin._apps", {"[DEFAULT]": MagicMock()}):
            result = get_firestore()
        assert result == mock_client

    def test_firestore_client_exception_returns_none(self):
        from routes.stripe_payments import get_firestore
        with patch("routes.stripe_payments.firestore.client", side_effect=Exception("client fail")), \
             patch("firebase_admin._apps", {"[DEFAULT]": MagicMock()}):
            result = get_firestore()
        assert result is None


# =============================================================================
# get_stripe
# =============================================================================

class TestGetStripe:

    def test_missing_key_raises_500(self):
        from routes.stripe_payments import get_stripe
        from fastapi import HTTPException
        import os
        os.environ.pop("STRIPE_SECRET_KEY", None)
        with pytest.raises(HTTPException) as exc:
            get_stripe()
        assert exc.value.status_code == 500
        assert "STRIPE_SECRET_KEY" in exc.value.detail

    def test_key_present_returns_stripe(self):
        from routes.stripe_payments import get_stripe
        import stripe
        with patch.dict("os.environ", {"STRIPE_SECRET_KEY": "sk_test_abc"}):
            result = get_stripe()
        assert result is stripe
        assert stripe.api_key == "sk_test_abc"


# =============================================================================
# GET /api/stripe/health
# =============================================================================

class TestHealth:

    def test_both_configured(self):
        with patch.dict("os.environ", {"STRIPE_SECRET_KEY": "sk_test"}), \
             patch("routes.stripe_payments.get_firestore", return_value=MagicMock()):
            response = client.get("/api/stripe/health")
        assert response.status_code == 200
        assert response.json()["stripe_configured"] is True
        assert response.json()["firebase_configured"] is True

    def test_neither_configured(self):
        import os
        os.environ.pop("STRIPE_SECRET_KEY", None)
        with patch("routes.stripe_payments.get_firestore", return_value=None):
            response = client.get("/api/stripe/health")
        assert response.status_code == 200
        assert response.json()["stripe_configured"] is False
        assert response.json()["firebase_configured"] is False

    def test_stripe_only_configured(self):
        with patch.dict("os.environ", {"STRIPE_SECRET_KEY": "sk_test"}), \
             patch("routes.stripe_payments.get_firestore", return_value=None):
            response = client.get("/api/stripe/health")
        assert response.json()["stripe_configured"] is True
        assert response.json()["firebase_configured"] is False

    def test_firebase_only_configured(self):
        import os
        os.environ.pop("STRIPE_SECRET_KEY", None)
        with patch("routes.stripe_payments.get_firestore", return_value=MagicMock()):
            response = client.get("/api/stripe/health")
        assert response.json()["stripe_configured"] is False
        assert response.json()["firebase_configured"] is True


# =============================================================================
# update_analytics
# =============================================================================

class TestUpdateAnalytics:

    def _make_analytics_fs(self, exists=True, data=None):
        data = data or {"totalRevenue": 100.0, "onlineRevenue": 80.0}
        snap = MagicMock()
        snap.exists = exists
        snap.to_dict.return_value = data
        doc = MagicMock()
        doc.get.return_value = snap
        col = MagicMock()
        col.document.return_value = doc
        fs = MagicMock()
        fs.collection.return_value = col
        return fs, doc

    def test_existing_doc_increments_revenue(self):
        from routes.stripe_payments import update_analytics
        fs, doc = self._make_analytics_fs(data={"totalRevenue": 200.0, "onlineRevenue": 150.0})
        update_analytics(fs, 50.0, "full_online", {})
        args = doc.update.call_args[0][0]
        assert args["totalRevenue"] == 250.0
        assert args["onlineRevenue"] == 200.0

    def test_missing_doc_calls_set(self):
        from routes.stripe_payments import update_analytics
        fs, doc = self._make_analytics_fs(exists=False)
        update_analytics(fs, 75.0, "full_online", {})
        doc.set.assert_called_once()
        data = doc.set.call_args[0][0]
        assert data["totalRevenue"] == 75.0
        assert data["onlineRevenue"] == 75.0
        assert data["pendingCashRevenue"] == 0
        assert data["totalRefunds"] == 0
        assert data["totalPayouts"] == 0
        assert data["availableBalance"] == 0

    def test_partial_uses_online_amount(self):
        from routes.stripe_payments import update_analytics
        fs, doc = self._make_analytics_fs(data={"totalRevenue": 100.0, "onlineRevenue": 100.0})
        update_analytics(fs, 50.0, "partial", {"paymentType": "partial", "onlineAmount": 30.0})
        args = doc.update.call_args[0][0]
        assert args["totalRevenue"] == 130.0
        assert args["onlineRevenue"] == 130.0

    def test_partial_no_online_amount_falls_back_to_amount(self):
        from routes.stripe_payments import update_analytics
        fs, doc = self._make_analytics_fs(data={"totalRevenue": 0.0, "onlineRevenue": 0.0})
        update_analytics(fs, 40.0, "partial", {"paymentType": "partial"})
        args = doc.update.call_args[0][0]
        assert args["totalRevenue"] == 40.0

    def test_existing_doc_missing_revenue_keys_treated_as_zero(self):
        from routes.stripe_payments import update_analytics
        fs, doc = self._make_analytics_fs(data={})
        update_analytics(fs, 25.0, "full_online", {})
        args = doc.update.call_args[0][0]
        assert args["totalRevenue"] == 25.0
        assert args["onlineRevenue"] == 25.0


# =============================================================================
# recalculate_wallet_balance
# =============================================================================

class TestRecalculateWalletBalance:

    def test_empty_returns_zero(self):
        from routes.stripe_payments import recalculate_wallet_balance
        result = recalculate_wallet_balance(make_rich_fs(), "user1")
        assert result == 0.0

    def test_completed_sale_credits_agreed_price(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(seller_txs=[{"type": "sale", "agreedPrice": 150.0, "buyerId": "b1"}])
        assert recalculate_wallet_balance(fs, "user1") == 150.0

    def test_uses_listing_price_fallback(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(seller_txs=[{"type": "sale", "listingPrice": 120.0, "buyerId": "b1"}])
        assert recalculate_wallet_balance(fs, "user1") == 120.0

    def test_uses_price_fallback(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(seller_txs=[{"type": "sale", "price": 90.0, "buyerId": "b1"}])
        assert recalculate_wallet_balance(fs, "user1") == 90.0

    def test_skips_trade_type(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(seller_txs=[{"type": "trade", "agreedPrice": 200.0, "buyerId": "b1"}])
        assert recalculate_wallet_balance(fs, "user1") == 0.0

    def test_skips_self_purchase_as_seller(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(seller_txs=[{"type": "sale", "agreedPrice": 100.0, "buyerId": "user1"}])
        assert recalculate_wallet_balance(fs, "user1") == 0.0

    def test_skips_zero_price(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(seller_txs=[{"type": "sale", "agreedPrice": 0.0, "buyerId": "b1"}])
        assert recalculate_wallet_balance(fs, "user1") == 0.0

    def test_skips_negative_price(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(seller_txs=[{"type": "sale", "agreedPrice": -10.0, "buyerId": "b1"}])
        assert recalculate_wallet_balance(fs, "user1") == 0.0

    def test_multiple_sales_summed(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(seller_txs=[
            {"type": "sale", "agreedPrice": 100.0, "buyerId": "b1"},
            {"type": "sale", "agreedPrice": 200.0, "buyerId": "b2"},
        ])
        assert recalculate_wallet_balance(fs, "user1") == 300.0

    def test_cancelled_online_full_refunds_buyer(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(cancelled_buyer_txs=[{
            "paymentType": "full_online", "paymentProvider": "stripe",
            "agreedPrice": 80.0, "sellerId": "s1",
        }])
        assert recalculate_wallet_balance(fs, "user1") == 80.0

    def test_cancelled_cash_type_no_refund(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(cancelled_buyer_txs=[{
            "paymentType": "cash", "agreedPrice": 100.0, "sellerId": "s1",
        }])
        assert recalculate_wallet_balance(fs, "user1") == 0.0

    def test_cancelled_cod_type_no_refund(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(cancelled_buyer_txs=[{
            "paymentType": "cod", "agreedPrice": 100.0, "sellerId": "s1",
        }])
        assert recalculate_wallet_balance(fs, "user1") == 0.0

    def test_cancelled_trade_type_no_refund(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(cancelled_buyer_txs=[{
            "paymentType": "trade", "agreedPrice": 100.0, "sellerId": "s1",
        }])
        assert recalculate_wallet_balance(fs, "user1") == 0.0

    def test_cancelled_cash_provider_no_refund(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(cancelled_buyer_txs=[{
            "paymentType": "full_online", "paymentProvider": "cash",
            "agreedPrice": 100.0, "sellerId": "s1",
        }])
        assert recalculate_wallet_balance(fs, "user1") == 0.0

    def test_cancelled_cod_provider_no_refund(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(cancelled_buyer_txs=[{
            "paymentType": "full_online", "paymentProvider": "cod",
            "agreedPrice": 80.0, "sellerId": "s1",
        }])
        assert recalculate_wallet_balance(fs, "user1") == 0.0

    def test_cancelled_partial_uses_online_amount(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(cancelled_buyer_txs=[{
            "paymentType": "partial", "agreedPrice": 200.0,
            "onlineAmount": 60.0, "sellerId": "s1",
        }])
        assert recalculate_wallet_balance(fs, "user1") == 60.0

    def test_cancelled_partial_zero_online_amount_skipped(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(cancelled_buyer_txs=[{
            "paymentType": "partial", "agreedPrice": 200.0,
            "onlineAmount": 0.0, "sellerId": "s1",
        }])
        assert recalculate_wallet_balance(fs, "user1") == 0.0

    def test_cancelled_skips_self_purchase_as_buyer(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(cancelled_buyer_txs=[{
            "paymentType": "full_online", "agreedPrice": 90.0, "sellerId": "user1",
        }])
        assert recalculate_wallet_balance(fs, "user1") == 0.0

    def test_overdue_cancelled_status_triggers_refund(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(cancelled_buyer_txs=[{
            "paymentType": "full_online", "agreedPrice": 70.0, "sellerId": "s1",
        }])
        assert recalculate_wallet_balance(fs, "user1") == 70.0

    def test_banner_ad_deducted(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(ads=[{"type": "banner", "sellerId": "user1"}])
        assert recalculate_wallet_balance(fs, "user1") == -50.0

    def test_premium_popup_ad_deducted(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(ads=[{"type": "premium-popup", "sellerId": "user1"}])
        assert recalculate_wallet_balance(fs, "user1") == -150.0

    def test_unknown_ad_type_skipped(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(ads=[{"type": "unknown-type", "sellerId": "user1"}])
        assert recalculate_wallet_balance(fs, "user1") == 0.0

    def test_duplicate_ad_ids_only_counted_once(self):
        """Deduplication: same doc id should only deduct once."""
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(ads=[
            {"type": "banner", "sellerId": "user1"},
            {"type": "banner", "sellerId": "user1"},
        ])
        # Both get doc_0 and doc_1 as IDs (different), so both deducted
        result = recalculate_wallet_balance(fs, "user1")
        assert result == -100.0

    def test_manual_topup_credits(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(manual_txs=[{
            "type": "topup", "direction": "credit", "amount": 200.0,
        }])
        assert recalculate_wallet_balance(fs, "user1") == 200.0

    def test_manual_withdrawal_debits(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(manual_txs=[{
            "type": "withdrawal", "direction": "debit", "amount": 50.0,
        }])
        assert recalculate_wallet_balance(fs, "user1") == -50.0

    def test_manual_legacy_ad_debit_ignored(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(manual_txs=[{
            "type": "ad_debit", "direction": "debit", "amount": 50.0,
        }])
        assert recalculate_wallet_balance(fs, "user1") == 0.0

    def test_manual_unknown_type_ignored(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(manual_txs=[{
            "type": "bonus", "direction": "credit", "amount": 100.0,
        }])
        assert recalculate_wallet_balance(fs, "user1") == 0.0

    def test_combined_scenario(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(
            seller_txs=[{"type": "sale", "agreedPrice": 300.0, "buyerId": "b1"}],
            ads=[{"type": "banner"}],
            manual_txs=[{"type": "topup", "direction": "credit", "amount": 100.0}],
        )
        # 300 - 50 + 100 = 350
        assert recalculate_wallet_balance(fs, "user1") == 350.0

    def test_sale_and_refund(self):
        from routes.stripe_payments import recalculate_wallet_balance
        fs = make_rich_fs(
            seller_txs=[{"type": "sale", "agreedPrice": 200.0, "buyerId": "b1"}],
            cancelled_buyer_txs=[{
                "paymentType": "full_online", "agreedPrice": 50.0, "sellerId": "s1",
            }],
        )
        assert recalculate_wallet_balance(fs, "user1") == 250.0


# =============================================================================
# persist_wallet_balance
# =============================================================================

class TestPersistWalletBalance:

    def test_calls_update_with_correct_balance(self):
        from routes.stripe_payments import persist_wallet_balance
        mock_fs = MagicMock()
        user_doc = MagicMock()
        mock_fs.collection.return_value.document.return_value = user_doc

        persist_wallet_balance(mock_fs, "user1", 123.45)

        mock_fs.collection.assert_called_with("users")
        mock_fs.collection.return_value.document.assert_called_with("user1")
        user_doc.update.assert_called_once()
        assert user_doc.update.call_args[0][0]["walletBalance"] == 123.45

    def test_calls_update_with_zero_balance(self):
        from routes.stripe_payments import persist_wallet_balance
        mock_fs = MagicMock()
        user_doc = MagicMock()
        mock_fs.collection.return_value.document.return_value = user_doc
        persist_wallet_balance(mock_fs, "user1", 0.0)
        assert user_doc.update.call_args[0][0]["walletBalance"] == 0.0

    def test_calls_update_with_negative_balance(self):
        from routes.stripe_payments import persist_wallet_balance
        mock_fs = MagicMock()
        user_doc = MagicMock()
        mock_fs.collection.return_value.document.return_value = user_doc
        persist_wallet_balance(mock_fs, "user1", -25.0)
        assert user_doc.update.call_args[0][0]["walletBalance"] == -25.0


# =============================================================================
# credit_wallet_topup
# =============================================================================

class TestCreditWalletTopup:

    def test_new_credit_returns_float_balance(self):
        from routes.stripe_payments import credit_wallet_topup
        fs = make_rich_fs(wallet_topup_existing=[])
        result = credit_wallet_topup(fs, "user1", 100.0, "sess_new")
        assert isinstance(result, float)

    def test_idempotent_already_credited_returns_none(self):
        from routes.stripe_payments import credit_wallet_topup
        fs = make_rich_fs(wallet_topup_existing=[{"refId": "sess_old", "userId": "user1"}])
        result = credit_wallet_topup(fs, "user1", 50.0, "sess_old")
        assert result is None

    def test_custom_description_accepted(self):
        from routes.stripe_payments import credit_wallet_topup
        fs = make_rich_fs(wallet_topup_existing=[])
        result = credit_wallet_topup(fs, "user1", 50.0, "sess_x", description="Custom top-up")
        assert isinstance(result, float)

    def test_default_description_used_when_empty(self):
        from routes.stripe_payments import credit_wallet_topup
        fs = make_rich_fs(wallet_topup_existing=[])
        # Should not raise
        result = credit_wallet_topup(fs, "user1", 75.0, "sess_y", description="")
        assert isinstance(result, float)


# =============================================================================
# POST /api/stripe/create-checkout-session
# =============================================================================

def _checkout_payload(**overrides):
    base = {
        "transactionId": "tx123",
        "buyerEmail": "buyer@test.com",
        "amount": 5000,
        "amountRand": 50.0,
        "cashAmount": 0,
        "totalAmount": 50.0,
        "currency": "zar",
        "stripeRef": "CM-001",
        "paymentType": "full_online",
        "listingId": "lid1",
        "listingTitle": "Test Item",
        "successUrl": "http://localhost:5173/success",
        "cancelUrl": "http://localhost:5173/cancel",
        "metadata": {},
    }
    base.update(overrides)
    return base


def _fake_stripe_with_session(session_id="cs_1", url="https://checkout.stripe.com/cs_1"):
    fake_session = MagicMock()
    fake_session.id = session_id
    fake_session.url = url
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.create.return_value = fake_session
    return fake_stripe


class TestCreateCheckoutSession:

    def test_success_returns_id_and_url(self):
        fake_stripe = _fake_stripe_with_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            response = client.post("/api/stripe/create-checkout-session", json=_checkout_payload())
        assert response.status_code == 200
        assert response.json() == {"id": "cs_1", "url": "https://checkout.stripe.com/cs_1"}

    def test_ad_promotion_prepends_prefix(self):
        fake_stripe = _fake_stripe_with_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            client.post("/api/stripe/create-checkout-session",
                        json=_checkout_payload(paymentType="ad_promotion", listingTitle="My Listing"))
        name = fake_stripe.checkout.Session.create.call_args.kwargs["line_items"][0]["price_data"]["product_data"]["name"]
        assert name == "[AD PROMOTION] My Listing"

    def test_non_ad_promotion_uses_listing_title(self):
        fake_stripe = _fake_stripe_with_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            client.post("/api/stripe/create-checkout-session",
                        json=_checkout_payload(paymentType="full_online", listingTitle="My Textbook"))
        name = fake_stripe.checkout.Session.create.call_args.kwargs["line_items"][0]["price_data"]["product_data"]["name"]
        assert name == "My Textbook"
        assert "[AD PROMOTION]" not in name

    def test_empty_listing_title_falls_back_to_default(self):
        fake_stripe = _fake_stripe_with_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            client.post("/api/stripe/create-checkout-session",
                        json=_checkout_payload(listingTitle="", paymentType="full_online"))
        name = fake_stripe.checkout.Session.create.call_args.kwargs["line_items"][0]["price_data"]["product_data"]["name"]
        assert name == "Marketplace transaction"

    def test_success_url_no_query_uses_question_mark(self):
        fake_stripe = _fake_stripe_with_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            client.post("/api/stripe/create-checkout-session",
                        json=_checkout_payload(successUrl="http://localhost:5173/success"))
        success_url = fake_stripe.checkout.Session.create.call_args.kwargs["success_url"]
        assert "?session_id=" in success_url
        assert "&session_id=" not in success_url

    def test_success_url_with_query_uses_ampersand(self):
        fake_stripe = _fake_stripe_with_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            client.post("/api/stripe/create-checkout-session",
                        json=_checkout_payload(successUrl="http://localhost:5173/success?foo=bar"))
        success_url = fake_stripe.checkout.Session.create.call_args.kwargs["success_url"]
        assert "&session_id=" in success_url
        assert "?session_id=" not in success_url

    def test_ad_promotion_success_url_with_multiple_params_uses_ampersand(self):
        fake_stripe = _fake_stripe_with_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            client.post("/api/stripe/create-checkout-session",
                        json=_checkout_payload(
                            paymentType="ad_promotion",
                            successUrl="http://localhost:5173/promote-success?lid=listing123&type=banner&amount=50",
                        ))
        success_url = fake_stripe.checkout.Session.create.call_args.kwargs["success_url"]
        assert "&session_id=" in success_url
        assert "?session_id=" not in success_url

    def test_metadata_passed_through(self):
        fake_stripe = _fake_stripe_with_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            client.post("/api/stripe/create-checkout-session",
                        json=_checkout_payload(metadata={"source": "mobile"}))
        metadata = fake_stripe.checkout.Session.create.call_args.kwargs["metadata"]
        assert metadata["source"] == "mobile"

    def test_standard_metadata_fields_set(self):
        fake_stripe = _fake_stripe_with_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            client.post("/api/stripe/create-checkout-session", json=_checkout_payload())
        metadata = fake_stripe.checkout.Session.create.call_args.kwargs["metadata"]
        assert metadata["transactionId"] == "tx123"
        assert metadata["stripeRef"] == "CM-001"
        assert metadata["paymentType"] == "full_online"

    def test_currency_lowercased(self):
        fake_stripe = _fake_stripe_with_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            client.post("/api/stripe/create-checkout-session",
                        json=_checkout_payload(currency="ZAR"))
        currency = fake_stripe.checkout.Session.create.call_args.kwargs["line_items"][0]["price_data"]["currency"]
        assert currency == "zar"

    def test_amount_passed_as_unit_amount(self):
        fake_stripe = _fake_stripe_with_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            client.post("/api/stripe/create-checkout-session",
                        json=_checkout_payload(amount=7500))
        unit_amount = fake_stripe.checkout.Session.create.call_args.kwargs["line_items"][0]["price_data"]["unit_amount"]
        assert unit_amount == 7500

    def test_stripe_error_returns_500(self):
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.create.side_effect = Exception("Card declined")
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            response = client.post("/api/stripe/create-checkout-session", json=_checkout_payload())
        assert response.status_code == 500
        assert "Card declined" in response.json()["detail"]

    def test_payment_method_type_is_card(self):
        fake_stripe = _fake_stripe_with_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            client.post("/api/stripe/create-checkout-session", json=_checkout_payload())
        kwargs = fake_stripe.checkout.Session.create.call_args.kwargs
        assert kwargs["payment_method_types"] == ["card"]

    def test_mode_is_payment(self):
        fake_stripe = _fake_stripe_with_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            client.post("/api/stripe/create-checkout-session", json=_checkout_payload())
        kwargs = fake_stripe.checkout.Session.create.call_args.kwargs
        assert kwargs["mode"] == "payment"

    def test_customer_email_set(self):
        fake_stripe = _fake_stripe_with_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            client.post("/api/stripe/create-checkout-session",
                        json=_checkout_payload(buyerEmail="test@example.com"))
        kwargs = fake_stripe.checkout.Session.create.call_args.kwargs
        assert kwargs["customer_email"] == "test@example.com"


# =============================================================================
# POST /api/stripe/verify-session
# =============================================================================

def _verify_payload(**overrides):
    base = {"sessionId": "cs_test_abc", "transactionId": "tx_001"}
    base.update(overrides)
    return base


class TestVerifySession:

    def test_unpaid_returns_false(self):
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = make_fake_session(payment_status="unpaid")
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            response = client.post("/api/stripe/verify-session", json=_verify_payload())
        assert response.status_code == 200
        assert response.json()["paid"] is False
        assert response.json()["status"] == "unpaid"

    def test_paid_no_firestore_returns_warning(self):
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = make_fake_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=None):
            response = client.post("/api/stripe/verify-session", json=_verify_payload())
        assert response.status_code == 200
        assert response.json()["paid"] is True
        assert "warning" in response.json()

    def test_tx_not_found_returns_warning(self):
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = make_fake_session()
        mock_fs, _ = make_tx_fs(tx_exists=False)
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
            response = client.post("/api/stripe/verify-session", json=_verify_payload())
        assert response.status_code == 200
        assert response.json()["paid"] is True
        assert "warning" in response.json()

    def test_already_paid_returns_already_updated(self):
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = make_fake_session()
        mock_fs, _ = make_tx_fs(payment_status="paid")
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
            response = client.post("/api/stripe/verify-session", json=_verify_payload())
        assert response.status_code == 200
        assert response.json()["alreadyUpdated"] is True

    def test_success_updates_transaction(self):
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = make_fake_session(amount_total=10000)
        mock_fs, tx_doc = make_tx_fs(payment_status="pending")
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
            response = client.post("/api/stripe/verify-session", json=_verify_payload())
        assert response.status_code == 200
        assert response.json()["paid"] is True
        assert response.json()["alreadyUpdated"] is False
        update_data = tx_doc.update.call_args[0][0]
        assert update_data["paymentStatus"] == "paid"
        assert update_data["status"] == "waiting"
        assert update_data["revenueAmount"] == 100.0
        assert update_data["paymentProvider"] == "stripe"
        assert update_data["paymentSettled"] is True

    def test_resolves_tx_id_from_metadata_when_payload_empty(self):
        fake_session = make_fake_session(metadata={"transactionId": "tx_from_meta"}, client_reference_id=None)
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = fake_session
        mock_fs, _ = make_tx_fs()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
            response = client.post("/api/stripe/verify-session",
                                   json={"sessionId": "cs_test_abc", "transactionId": ""})
        assert response.status_code == 200

    def test_resolves_tx_id_from_client_reference_id(self):
        fake_session = make_fake_session(metadata={}, client_reference_id="tx_from_ref")
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = fake_session
        mock_fs, _ = make_tx_fs()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
            response = client.post("/api/stripe/verify-session",
                                   json={"sessionId": "cs_test_abc", "transactionId": ""})
        assert response.status_code == 200

    def test_no_tx_id_anywhere_returns_400(self):
        fake_session = make_fake_session(metadata={}, client_reference_id=None)
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = fake_session
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=MagicMock()):
            response = client.post("/api/stripe/verify-session",
                                   json={"sessionId": "cs_test_abc", "transactionId": ""})
        assert response.status_code == 400

    def test_analytics_error_is_non_fatal(self):
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = make_fake_session()
        mock_fs, tx_doc = make_tx_fs()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs), \
             patch("routes.stripe_payments.update_analytics", side_effect=Exception("analytics boom")):
            response = client.post("/api/stripe/verify-session", json=_verify_payload())
        assert response.status_code == 200
        assert response.json()["paid"] is True
        tx_doc.update.assert_called_once()

    def test_firestore_update_fails_returns_500(self):
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = make_fake_session()
        mock_fs, tx_doc = make_tx_fs()
        tx_doc.update.side_effect = Exception("write failed")
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
            response = client.post("/api/stripe/verify-session", json=_verify_payload())
        assert response.status_code == 500

    def test_stripe_retrieve_error_returns_500(self):
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.side_effect = Exception("Network error")
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            response = client.post("/api/stripe/verify-session", json=_verify_payload())
        assert response.status_code == 500
        assert "Network error" in response.json()["detail"]

    def test_partial_payment_analytics_called_correctly(self):
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = make_fake_session(amount_total=8000)
        mock_fs, _ = make_tx_fs(extra_tx={"paymentType": "partial", "onlineAmount": 40.0})
        analytics_calls = []
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs), \
             patch("routes.stripe_payments.update_analytics",
                   side_effect=lambda *a, **k: analytics_calls.append(a)):
            response = client.post("/api/stripe/verify-session", json=_verify_payload())
        assert response.status_code == 200
        assert analytics_calls[0][2] == "partial"

    def test_revenue_recorded_flag_set(self):
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = make_fake_session()
        mock_fs, tx_doc = make_tx_fs()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
            client.post("/api/stripe/verify-session", json=_verify_payload())
        update_data = tx_doc.update.call_args[0][0]
        assert update_data["revenueRecorded"] is True

    def test_stripe_session_id_stored_in_multiple_fields(self):
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = make_fake_session(session_id="cs_xyz")
        mock_fs, tx_doc = make_tx_fs()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
            client.post("/api/stripe/verify-session", json=_verify_payload())
        update_data = tx_doc.update.call_args[0][0]
        assert update_data["stripeRef"] == "cs_xyz"
        assert update_data["stripeCheckoutSessionId"] == "cs_xyz"
        assert update_data["stripeSessionId"] == "cs_xyz"


# =============================================================================
# POST /api/stripe/create-topup-session
# =============================================================================

def _topup_payload(**overrides):
    base = {
        "userId": "user1",
        "userEmail": "user@test.com",
        "amount": 100.0,
        "description": "Top up my wallet",
        "currency": "zar",
        "successUrl": "http://localhost:5173/wallet?success=1",
        "cancelUrl": "http://localhost:5173/wallet?cancel=1",
        "metadata": {},
    }
    base.update(overrides)
    return base


class TestCreateTopupSession:

    def test_success_returns_id_and_url(self):
        fake_stripe = _fake_stripe_with_session("cs_topup_1", "https://checkout.stripe.com/cs_topup_1")
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            response = client.post("/api/stripe/create-topup-session", json=_topup_payload())
        assert response.status_code == 200
        assert response.json() == {"id": "cs_topup_1", "url": "https://checkout.stripe.com/cs_topup_1"}

    def test_below_minimum_returns_400(self):
        with patch("routes.stripe_payments.get_stripe", return_value=MagicMock()):
            response = client.post("/api/stripe/create-topup-session", json=_topup_payload(amount=5.0))
        assert response.status_code == 400
        assert "R10" in response.json()["detail"]

    def test_exactly_minimum_passes(self):
        fake_stripe = _fake_stripe_with_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            response = client.post("/api/stripe/create-topup-session", json=_topup_payload(amount=10.0))
        assert response.status_code == 200

    def test_amount_converted_to_cents(self):
        fake_stripe = _fake_stripe_with_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            client.post("/api/stripe/create-topup-session", json=_topup_payload(amount=100.0))
        unit_amount = fake_stripe.checkout.Session.create.call_args.kwargs["line_items"][0]["price_data"]["unit_amount"]
        assert unit_amount == 10000

    def test_success_url_with_query_uses_ampersand(self):
        fake_stripe = _fake_stripe_with_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            client.post("/api/stripe/create-topup-session",
                        json=_topup_payload(successUrl="http://localhost:5173/wallet?success=1"))
        success_url = fake_stripe.checkout.Session.create.call_args.kwargs["success_url"]
        assert "&session_id=" in success_url

    def test_success_url_no_query_uses_question_mark(self):
        fake_stripe = _fake_stripe_with_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            client.post("/api/stripe/create-topup-session",
                        json=_topup_payload(successUrl="http://localhost:5173/wallet-success"))
        success_url = fake_stripe.checkout.Session.create.call_args.kwargs["success_url"]
        assert "?session_id=" in success_url

    def test_description_used_as_product_name(self):
        fake_stripe = _fake_stripe_with_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            client.post("/api/stripe/create-topup-session",
                        json=_topup_payload(description="My custom description"))
        name = fake_stripe.checkout.Session.create.call_args.kwargs["line_items"][0]["price_data"]["product_data"]["name"]
        assert name == "My custom description"

    def test_empty_description_falls_back_to_default(self):
        fake_stripe = _fake_stripe_with_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            client.post("/api/stripe/create-topup-session", json=_topup_payload(description=""))
        name = fake_stripe.checkout.Session.create.call_args.kwargs["line_items"][0]["price_data"]["product_data"]["name"]
        assert "Campus Marketplace" in name
        assert "Top-up" in name

    def test_metadata_type_wallet_topup_set(self):
        fake_stripe = _fake_stripe_with_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            client.post("/api/stripe/create-topup-session", json=_topup_payload())
        metadata = fake_stripe.checkout.Session.create.call_args.kwargs["metadata"]
        assert metadata["type"] == "wallet_topup"
        assert metadata["userId"] == "user1"

    def test_custom_metadata_passed_through(self):
        fake_stripe = _fake_stripe_with_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            client.post("/api/stripe/create-topup-session",
                        json=_topup_payload(metadata={"source": "mobile"}))
        metadata = fake_stripe.checkout.Session.create.call_args.kwargs["metadata"]
        assert metadata["source"] == "mobile"

    def test_client_reference_id_is_user_id(self):
        fake_stripe = _fake_stripe_with_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            client.post("/api/stripe/create-topup-session", json=_topup_payload(userId="u_abc"))
        kwargs = fake_stripe.checkout.Session.create.call_args.kwargs
        assert kwargs["client_reference_id"] == "u_abc"

    def test_stripe_error_returns_500(self):
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.create.side_effect = Exception("Top-up card error")
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            response = client.post("/api/stripe/create-topup-session", json=_topup_payload())
        assert response.status_code == 500
        assert "Top-up card error" in response.json()["detail"]

    def test_currency_lowercased(self):
        fake_stripe = _fake_stripe_with_session()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            client.post("/api/stripe/create-topup-session", json=_topup_payload(currency="ZAR"))
        currency = fake_stripe.checkout.Session.create.call_args.kwargs["line_items"][0]["price_data"]["currency"]
        assert currency == "zar"


# =============================================================================
# POST /api/stripe/verify-topup-session
# =============================================================================

def _verify_topup_payload(**overrides):
    base = {"sessionId": "cs_topup_1", "userId": "user1", "amount": 100.0}
    base.update(overrides)
    return base


class TestVerifyTopupSession:

    def test_unpaid_returns_false(self):
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = make_fake_session(payment_status="unpaid")
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            response = client.post("/api/stripe/verify-topup-session", json=_verify_topup_payload())
        assert response.status_code == 200
        assert response.json()["paid"] is False
        assert response.json()["status"] == "unpaid"

    def test_paid_no_firestore_returns_warning(self):
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = make_fake_session(amount_total=10000)
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=None):
            response = client.post("/api/stripe/verify-topup-session", json=_verify_topup_payload())
        assert response.status_code == 200
        assert response.json()["paid"] is True
        assert "warning" in response.json()

    def test_paid_new_credit(self):
        fake_session = make_fake_session(
            payment_status="paid", amount_total=10000,
            metadata={"type": "wallet_topup", "userId": "user1"},
        )
        fake_session.client_reference_id = "user1"
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = fake_session
        mock_fs = make_rich_fs(wallet_topup_existing=[])
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
            response = client.post("/api/stripe/verify-topup-session", json=_verify_topup_payload())
        assert response.status_code == 200
        data = response.json()
        assert data["paid"] is True
        assert data["alreadyCredited"] is False
        assert data["userId"] == "user1"
        assert data["amountRand"] == 100.0

    def test_already_credited_returns_none_balance(self):
        fake_session = make_fake_session(
            payment_status="paid", amount_total=10000,
            metadata={"type": "wallet_topup", "userId": "user1"},
        )
        fake_session.client_reference_id = "user1"
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = fake_session
        mock_fs = make_rich_fs(wallet_topup_existing=[{"refId": "cs_topup_1", "userId": "user1"}])
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
            response = client.post("/api/stripe/verify-topup-session", json=_verify_topup_payload())
        assert response.status_code == 200
        assert response.json()["alreadyCredited"] is True
        assert response.json()["newBalance"] is None

    def test_amount_rand_derived_from_session(self):
        fake_session = make_fake_session(
            payment_status="paid", amount_total=25000,
            metadata={"type": "wallet_topup", "userId": "user1"},
        )
        fake_session.client_reference_id = "user1"
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = fake_session
        mock_fs = make_rich_fs(wallet_topup_existing=[])
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
            response = client.post("/api/stripe/verify-topup-session",
                                   json={"sessionId": "cs_topup_1", "userId": "user1", "amount": 0})
        assert response.json()["amountRand"] == 250.0

    def test_resolves_user_id_from_metadata(self):
        fake_session = make_fake_session(
            payment_status="paid", amount_total=5000,
            metadata={"type": "wallet_topup", "userId": "meta_user"},
        )
        fake_session.client_reference_id = "meta_user"
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = fake_session
        mock_fs = make_rich_fs(wallet_topup_existing=[])
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
            response = client.post("/api/stripe/verify-topup-session",
                                   json={"sessionId": "cs_topup_1", "userId": "", "amount": 50.0})
        assert response.status_code == 200
        assert response.json()["userId"] == "meta_user"

    def test_resolves_user_id_from_client_reference_id(self):
        fake_session = make_fake_session(
            payment_status="paid", amount_total=5000,
            metadata={},
        )
        fake_session.client_reference_id = "ref_user"
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = fake_session
        mock_fs = make_rich_fs(wallet_topup_existing=[])
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
            response = client.post("/api/stripe/verify-topup-session",
                                   json={"sessionId": "cs_topup_1", "userId": "", "amount": 0})
        assert response.status_code == 200
        assert response.json()["userId"] == "ref_user"

    def test_no_user_id_anywhere_returns_400(self):
        fake_session = make_fake_session(payment_status="paid", metadata={})
        fake_session.client_reference_id = None
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = fake_session
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=MagicMock()):
            response = client.post("/api/stripe/verify-topup-session",
                                   json={"sessionId": "cs_topup_1", "userId": "", "amount": 0})
        assert response.status_code == 400

    def test_stripe_error_returns_500(self):
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.side_effect = Exception("Stripe timeout")
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            response = client.post("/api/stripe/verify-topup-session", json=_verify_topup_payload())
        assert response.status_code == 500
        assert "Stripe timeout" in response.json()["detail"]

    def test_firestore_error_returns_500(self):
        fake_session = make_fake_session(
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
# POST /api/stripe/webhook
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


def _marketplace_event(tx_id="tx_wh_1", session_id="cs_mkt_1", amount_total=5000):
    return {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": session_id,
                "payment_status": "paid",
                "amount_total": amount_total,
                "metadata": {"transactionId": tx_id, "stripeRef": "CM-001"},
                "client_reference_id": tx_id,
            }
        },
    }


def _post_webhook(event, fake_stripe, mock_fs=None):
    patches = [
        patch("routes.stripe_payments.get_stripe", return_value=fake_stripe),
        patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": "whsec_test"}),
    ]
    if mock_fs is not None:
        patches.append(patch("routes.stripe_payments.get_firestore", return_value=mock_fs))
    ctx_managers = [p.__enter__() for p in patches]
    try:
        return client.post(
            "/api/stripe/webhook",
            content=json.dumps(event).encode(),
            headers={"stripe-signature": "sig", "content-type": "application/json"},
        )
    finally:
        for p, _ in zip(reversed(patches), reversed(ctx_managers)):
            p.__exit__(None, None, None)


class TestWebhookMissingSecret:

    def test_missing_secret_returns_500(self):
        import os
        os.environ.pop("STRIPE_WEBHOOK_SECRET", None)
        fake_stripe = MagicMock()
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            response = client.post(
                "/api/stripe/webhook",
                content=b"data",
                headers={"stripe-signature": "sig", "content-type": "application/json"},
            )
        assert response.status_code == 500
        assert "STRIPE_WEBHOOK_SECRET" in response.json()["detail"]


class TestWebhookSignatureValidation:

    def test_invalid_payload_returns_400(self):
        fake_stripe = MagicMock()
        fake_stripe.Webhook.construct_event.side_effect = ValueError("bad payload")
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": "whsec_test"}):
            response = client.post(
                "/api/stripe/webhook",
                content=b"bad",
                headers={"stripe-signature": "sig", "content-type": "application/json"},
            )
        assert response.status_code == 400
        assert "Invalid webhook payload" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        fake_stripe = MagicMock()
        fake_stripe.Webhook.construct_event.side_effect = Exception("bad sig")
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": "whsec_test"}):
            response = client.post(
                "/api/stripe/webhook",
                content=b"data",
                headers={"stripe-signature": "badsig", "content-type": "application/json"},
            )
        assert response.status_code == 400
        assert "signature" in response.json()["detail"].lower()


class TestWebhookNonCheckoutEvent:

    def test_non_checkout_event_ignored(self):
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

    def test_payment_intent_succeeded_ignored(self):
        event = {"type": "payment_intent.succeeded", "data": {"object": {}}}
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


class TestWebhookWalletTopup:

    def _post(self, event, fake_stripe, mock_fs=None):
        patches = {
            "routes.stripe_payments.get_stripe": fake_stripe,
        }
        fs_patch = patch("routes.stripe_payments.get_firestore", return_value=mock_fs)
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             fs_patch, \
             patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": "whsec_test"}):
            return client.post(
                "/api/stripe/webhook",
                content=json.dumps(event).encode(),
                headers={"stripe-signature": "sig", "content-type": "application/json"},
            )

    def test_new_credit_returns_received(self):
        event = _wallet_topup_event()
        fake_stripe = MagicMock()
        fake_stripe.Webhook.construct_event.return_value = event
        mock_fs = make_rich_fs(wallet_topup_existing=[])
        response = self._post(event, fake_stripe, mock_fs)
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_already_credited_idempotent(self):
        event = _wallet_topup_event(session_id="cs_already")
        fake_stripe = MagicMock()
        fake_stripe.Webhook.construct_event.return_value = event
        mock_fs = make_rich_fs(wallet_topup_existing=[{"refId": "cs_already", "userId": "user1"}])
        response = self._post(event, fake_stripe, mock_fs)
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_no_user_id_skips_gracefully(self):
        event = {
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_wh_1",
                    "payment_status": "paid",
                    "amount_total": 5000,
                    "metadata": {"type": "wallet_topup"},  # no userId
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

    def test_no_firestore_returns_received(self):
        event = _wallet_topup_event()
        fake_stripe = MagicMock()
        fake_stripe.Webhook.construct_event.return_value = event
        response = self._post(event, fake_stripe, mock_fs=None)
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_firestore_error_returns_500(self):
        event = _wallet_topup_event()
        fake_stripe = MagicMock()
        fake_stripe.Webhook.construct_event.return_value = event
        mock_fs = MagicMock()
        mock_fs.collection.side_effect = Exception("Firestore exploded")
        response = self._post(event, fake_stripe, mock_fs)
        assert response.status_code == 500

    def test_user_id_resolved_from_client_reference_id(self):
        event = {
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_wh_ref",
                    "payment_status": "paid",
                    "amount_total": 5000,
                    "metadata": {"type": "wallet_topup"},  # no userId in metadata
                    "client_reference_id": "user_from_ref",
                }
            },
        }
        fake_stripe = MagicMock()
        fake_stripe.Webhook.construct_event.return_value = event
        mock_fs = make_rich_fs(wallet_topup_existing=[])
        response = self._post(event, fake_stripe, mock_fs)
        assert response.status_code == 200


class TestWebhookMarketplace:

    def _post(self, event, fake_stripe, mock_fs=None):
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs), \
             patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": "whsec_test"}):
            return client.post(
                "/api/stripe/webhook",
                content=json.dumps(event).encode(),
                headers={"stripe-signature": "sig", "content-type": "application/json"},
            )

    def test_updates_transaction_to_paid(self):
        event = _marketplace_event()
        fake_stripe = MagicMock()
        fake_stripe.Webhook.construct_event.return_value = event

        tx_snap = MagicMock()
        tx_snap.exists = True
        tx_snap.to_dict.return_value = {"paymentStatus": "pending"}
        tx_doc = MagicMock()
        tx_doc.get.return_value = tx_snap
        tx_col = MagicMock()
        tx_col.document.return_value = tx_doc
        mock_fs = MagicMock()
        mock_fs.collection.return_value = tx_col

        response = self._post(event, fake_stripe, mock_fs)
        assert response.status_code == 200
        assert response.json() == {"received": True}
        tx_doc.update.assert_called_once()
        update_data = tx_doc.update.call_args[0][0]
        assert update_data["paymentStatus"] == "paid"
        assert update_data["status"] == "waiting"

    def test_already_paid_skips_update(self):
        event = _marketplace_event()
        fake_stripe = MagicMock()
        fake_stripe.Webhook.construct_event.return_value = event

        tx_snap = MagicMock()
        tx_snap.exists = True
        tx_snap.to_dict.return_value = {"paymentStatus": "paid"}
        tx_doc = MagicMock()
        tx_doc.get.return_value = tx_snap
        tx_col = MagicMock()
        tx_col.document.return_value = tx_doc
        mock_fs = MagicMock()
        mock_fs.collection.return_value = tx_col

        response = self._post(event, fake_stripe, mock_fs)
        assert response.status_code == 200
        tx_doc.update.assert_not_called()

    def test_no_tx_id_skips_gracefully(self):
        event = {
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_mkt_1",
                    "payment_status": "paid",
                    "amount_total": 5000,
                    "metadata": {},
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

    def test_no_firestore_returns_received(self):
        event = _marketplace_event()
        fake_stripe = MagicMock()
        fake_stripe.Webhook.construct_event.return_value = event
        response = self._post(event, fake_stripe, mock_fs=None)
        assert response.status_code == 200

    def test_firestore_error_returns_500(self):
        event = _marketplace_event()
        fake_stripe = MagicMock()
        fake_stripe.Webhook.construct_event.return_value = event
        mock_fs = MagicMock()
        mock_fs.collection.side_effect = Exception("Firestore crash")
        response = self._post(event, fake_stripe, mock_fs)
        assert response.status_code == 500

    def test_tx_id_resolved_from_client_reference_id(self):
        event = {
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_mkt_ref",
                    "payment_status": "paid",
                    "amount_total": 5000,
                    "metadata": {},  # no transactionId in metadata
                    "client_reference_id": "tx_from_ref",
                }
            },
        }
        fake_stripe = MagicMock()
        fake_stripe.Webhook.construct_event.return_value = event

        tx_snap = MagicMock()
        tx_snap.exists = True
        tx_snap.to_dict.return_value = {"paymentStatus": "pending"}
        tx_doc = MagicMock()
        tx_doc.get.return_value = tx_snap
        tx_col = MagicMock()
        tx_col.document.return_value = tx_doc
        mock_fs = MagicMock()
        mock_fs.collection.return_value = tx_col

        response = self._post(event, fake_stripe, mock_fs)
        assert response.status_code == 200
        tx_col.document.assert_called_with("tx_from_ref")

    def test_stripe_ref_from_metadata_used_in_update(self):
        event = _marketplace_event(tx_id="tx_1", session_id="cs_mkt_1")
        fake_stripe = MagicMock()
        fake_stripe.Webhook.construct_event.return_value = event

        tx_snap = MagicMock()
        tx_snap.exists = True
        tx_snap.to_dict.return_value = {"paymentStatus": "pending"}
        tx_doc = MagicMock()
        tx_doc.get.return_value = tx_snap
        tx_col = MagicMock()
        tx_col.document.return_value = tx_doc
        mock_fs = MagicMock()
        mock_fs.collection.return_value = tx_col

        response = self._post(event, fake_stripe, mock_fs)
        assert response.status_code == 200
        update_data = tx_doc.update.call_args[0][0]
        assert update_data["stripeRef"] == "CM-001"
        assert update_data["stripeCheckoutSessionId"] == "cs_mkt_1"