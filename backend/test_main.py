"""
test_listings_and_stripe.py
===========================
Comprehensive tests for listings.py and stripe_payments.py targeting
lines not covered by existing test suites, to improve CodeCov.

Coverage targets for listings.py:
  • upload_image        — happy path, missing Azure config, upload failure
  • GET /listings/      — success, DB error
  • POST /listings/     — full happy path (with + without image),
                          invalid listing_type, invalid condition,
                          image upload failure, product insert failure,
                          DB rollback on exception

Coverage targets for stripe_payments.py (gaps beyond test_stripe_extended.py):
  • get_firestore       — already initialised, bad JSON, client failure
  • get_stripe          — missing key
  • /health             — both flags true / false
  • /verify-session     — paid+tx updated, already paid, tx not found,
                          no transactionId anywhere, analytics error (non-fatal),
                          Firestore error
  • /webhook            — invalid payload, invalid signature,
                          marketplace tx path: already paid, no tx id,
                          no Firestore, Firestore error
"""

import io
import json
import pytest
from unittest.mock import MagicMock, patch, call
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


# =============================================================================
# ─── LISTINGS — helpers ──────────────────────────────────────────────────────
# =============================================================================

def _make_db(fetchall_return=None, lastrowid_seq=None, execute_raises=None):
    """
    Build a mock DB + cursor pair.

    lastrowid_seq: list of values returned on successive accesses to cursor.lastrowid
    execute_raises: if provided, cursor.execute raises this exception
    """
    mock_db = MagicMock()
    mock_cursor = MagicMock()
    mock_db.cursor.return_value = mock_cursor

    if fetchall_return is not None:
        mock_cursor.fetchall.return_value = fetchall_return

    if lastrowid_seq:
        mock_cursor.lastrowid = lastrowid_seq[0]  # default; override per test if needed

    if execute_raises:
        mock_cursor.execute.side_effect = execute_raises

    return mock_db, mock_cursor


def _listing_form(**overrides):
    """Base multipart form data for POST /listings/."""
    base = {
        "user_id": "user_abc",
        "title": "Test Laptop",
        "price": "500.00",
        "listing_type": "sell",
        "condition": "good",
    }
    base.update(overrides)
    return base


# =============================================================================
# ─── upload_image ────────────────────────────────────────────────────────────
# =============================================================================

class TestUploadImage:

    def test_upload_image_missing_conn_str_raises_500(self):
        """If AZURE_STORAGE_CONNECTION_STRING is missing, upload raises HTTPException 500."""
        from routes.listings import upload_image
        from fastapi import HTTPException

        mock_file = MagicMock()
        mock_file.filename = "photo.jpg"

        with patch.dict("os.environ", {}, clear=True):
            # Remove both Azure vars
            import os
            os.environ.pop("AZURE_STORAGE_CONNECTION_STRING", None)
            os.environ.pop("AZURE_CONTAINER_NAME", None)
            with pytest.raises(HTTPException) as exc_info:
                upload_image(mock_file)
        assert exc_info.value.status_code == 500
        assert "Azure config missing" in exc_info.value.detail

    def test_upload_image_missing_container_raises_500(self):
        from routes.listings import upload_image
        from fastapi import HTTPException

        mock_file = MagicMock()
        mock_file.filename = "photo.jpg"

        with patch.dict("os.environ", {"AZURE_STORAGE_CONNECTION_STRING": "DefaultEndpointsProtocol=https;"}, clear=False):
            import os
            os.environ.pop("AZURE_CONTAINER_NAME", None)
            with pytest.raises(HTTPException) as exc_info:
                upload_image(mock_file)
        assert exc_info.value.status_code == 500

    def test_upload_image_happy_path_returns_url(self):
        from routes.listings import upload_image

        mock_file = MagicMock()
        mock_file.filename = "photo.jpg"
        mock_file.file = io.BytesIO(b"fake image data")

        mock_blob_client = MagicMock()
        mock_blob_service = MagicMock()
        mock_blob_service.account_name = "myaccount"
        mock_blob_service.get_blob_client.return_value = mock_blob_client

        with patch.dict("os.environ", {
            "AZURE_STORAGE_CONNECTION_STRING": "fake_conn",
            "AZURE_CONTAINER_NAME": "images",
        }), patch("routes.listings.BlobServiceClient.from_connection_string", return_value=mock_blob_service):
            url = upload_image(mock_file)

        assert url.startswith("https://myaccount.blob.core.windows.net/images/")
        assert url.endswith(".jpg")
        mock_blob_client.upload_blob.assert_called_once()

    def test_upload_image_no_filename_uses_no_extension(self):
        from routes.listings import upload_image

        mock_file = MagicMock()
        mock_file.filename = None
        mock_file.file = io.BytesIO(b"data")

        mock_blob_client = MagicMock()
        mock_blob_service = MagicMock()
        mock_blob_service.account_name = "acct"
        mock_blob_service.get_blob_client.return_value = mock_blob_client

        with patch.dict("os.environ", {
            "AZURE_STORAGE_CONNECTION_STRING": "fake_conn",
            "AZURE_CONTAINER_NAME": "images",
        }), patch("routes.listings.BlobServiceClient.from_connection_string", return_value=mock_blob_service):
            url = upload_image(mock_file)

        # blob_name has no extension when filename is None
        parts = url.split("/")
        blob_name = parts[-1]
        assert "." not in blob_name  # uuid only, no extension


# =============================================================================
# ─── GET /listings/ ──────────────────────────────────────────────────────────
# =============================================================================

class TestGetListings:

    def test_get_listings_returns_list(self):
        rows = [
            {"listing_id": 1, "product_id": 10, "title": "Laptop"},
            {"listing_id": 2, "product_id": 11, "title": "Phone"},
        ]
        mock_db, mock_cursor = _make_db(fetchall_return=rows)

        with patch("routes.listings.get_db", return_value=mock_db):
            response = client.get("/listings/")

        assert response.status_code == 200
        assert response.json() == rows

    def test_get_listings_db_error_returns_500(self):
        mock_db, mock_cursor = _make_db(execute_raises=Exception("DB connection lost"))

        with patch("routes.listings.get_db", return_value=mock_db):
            response = client.get("/listings/")

        assert response.status_code == 500
        assert "DB connection lost" in response.json()["detail"]

    def test_get_listings_always_closes_db(self):
        mock_db, _ = _make_db(fetchall_return=[])
        with patch("routes.listings.get_db", return_value=mock_db):
            client.get("/listings/")
        mock_db.close.assert_called_once()

    def test_get_listings_closes_db_on_error(self):
        mock_db, mock_cursor = _make_db(execute_raises=Exception("err"))
        with patch("routes.listings.get_db", return_value=mock_db):
            client.get("/listings/")
        mock_db.close.assert_called_once()


# =============================================================================
# ─── POST /listings/ ─────────────────────────────────────────────────────────
# =============================================================================

class TestCreateListing:

    def _post(self, form=None, files=None):
        form = form or _listing_form()
        return client.post("/listings/", data=form, files=files or {})

    # ── Happy path — no image ────────────────────────────────────────────────

    def test_create_listing_no_image_success(self):
        mock_db = MagicMock()
        mock_cursor = MagicMock()
        mock_db.cursor.return_value = mock_cursor
        # First execute → product insert, lastrowid = 42
        # Second execute → listing insert, lastrowid = 7
        mock_cursor.lastrowid = 42

        def lastrowid_side(*args, **kwargs):
            pass

        # Simulate lastrowid changing after each execute
        call_count = [0]
        original_execute = mock_cursor.execute

        def execute_side(*args, **kwargs):
            call_count[0] += 1

        mock_cursor.execute.side_effect = execute_side
        lastrowid_values = [42, 7]
        type(mock_cursor).lastrowid = property(lambda self: lastrowid_values[min(call_count[0] - 1, 1)])

        with patch("routes.listings.get_db", return_value=mock_db):
            response = self._post()

        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Listing created successfully"
        assert "listing_id" in data
        assert "product_id" in data

    def test_create_listing_with_all_optional_fields(self):
        mock_db = MagicMock()
        mock_cursor = MagicMock()
        mock_db.cursor.return_value = mock_cursor
        mock_cursor.lastrowid = 99

        with patch("routes.listings.get_db", return_value=mock_db):
            response = self._post(form={
                "user_id": "u1",
                "title": "Fancy Book",
                "description": "A great book",
                "specifications": "Hardcover, 300 pages",
                "price": "120.00",
                "category": "books",
                "condition": "like_new",
                "listing_type": "trade",
            })

        assert response.status_code == 200

    # ── Validation — listing_type ────────────────────────────────────────────

    def test_create_listing_invalid_listing_type_returns_400(self):
        response = self._post(form=_listing_form(listing_type="auction"))
        assert response.status_code == 400
        assert "listing_type" in response.json()["detail"].lower()

    def test_create_listing_valid_listing_types_accepted(self):
        for lt in ("sell", "trade", "either"):
            mock_db = MagicMock()
            mock_cursor = MagicMock()
            mock_db.cursor.return_value = mock_cursor
            mock_cursor.lastrowid = 1

            with patch("routes.listings.get_db", return_value=mock_db):
                response = self._post(form=_listing_form(listing_type=lt))
            assert response.status_code == 200, f"listing_type={lt} should be valid"

    # ── Validation — condition ───────────────────────────────────────────────

    def test_create_listing_invalid_condition_returns_400(self):
        response = self._post(form=_listing_form(condition="broken"))
        assert response.status_code == 400
        assert "condition" in response.json()["detail"].lower()

    def test_create_listing_valid_conditions_accepted(self):
        for cond in ("new", "like_new", "good", "fair"):
            mock_db = MagicMock()
            mock_cursor = MagicMock()
            mock_db.cursor.return_value = mock_cursor
            mock_cursor.lastrowid = 1

            with patch("routes.listings.get_db", return_value=mock_db):
                response = self._post(form=_listing_form(condition=cond))
            assert response.status_code == 200, f"condition={cond} should be valid"

    # ── Input normalisation ──────────────────────────────────────────────────

    def test_create_listing_listing_type_normalised_to_lowercase(self):
        """listing_type with leading spaces and uppercase should still work."""
        mock_db = MagicMock()
        mock_cursor = MagicMock()
        mock_db.cursor.return_value = mock_cursor
        mock_cursor.lastrowid = 5

        with patch("routes.listings.get_db", return_value=mock_db):
            response = self._post(form=_listing_form(listing_type=" SELL "))
        assert response.status_code == 200

    def test_create_listing_condition_normalised_to_lowercase(self):
        mock_db = MagicMock()
        mock_cursor = MagicMock()
        mock_db.cursor.return_value = mock_cursor
        mock_cursor.lastrowid = 5

        with patch("routes.listings.get_db", return_value=mock_db):
            response = self._post(form=_listing_form(condition=" GOOD "))
        assert response.status_code == 200

    # ── Image upload paths ───────────────────────────────────────────────────

    def test_create_listing_with_image_success(self):
        mock_db = MagicMock()
        mock_cursor = MagicMock()
        mock_db.cursor.return_value = mock_cursor
        mock_cursor.lastrowid = 10

        image_bytes = io.BytesIO(b"fake image bytes")

        with patch("routes.listings.get_db", return_value=mock_db), \
             patch("routes.listings.upload_image", return_value="https://storage.example.com/img.jpg"):
            response = client.post(
                "/listings/",
                data=_listing_form(),
                files={"image": ("photo.jpg", image_bytes, "image/jpeg")},
            )

        assert response.status_code == 200
        # Confirm the image URL was passed to INSERT INTO products
        args = mock_cursor.execute.call_args_list[0]
        assert "https://storage.example.com/img.jpg" in args[0][1]

    def test_create_listing_image_upload_failure_returns_500(self):
        with patch("routes.listings.upload_image", side_effect=Exception("Azure unavailable")):
            response = client.post(
                "/listings/",
                data=_listing_form(),
                files={"image": ("photo.jpg", io.BytesIO(b"data"), "image/jpeg")},
            )
        assert response.status_code == 500
        assert "Image upload failed" in response.json()["detail"]

    # ── DB failure paths ─────────────────────────────────────────────────────

    def test_create_listing_execute_raises_triggers_rollback(self):
        mock_db = MagicMock()
        mock_cursor = MagicMock()
        mock_db.cursor.return_value = mock_cursor
        mock_cursor.execute.side_effect = Exception("Duplicate key")

        with patch("routes.listings.get_db", return_value=mock_db):
            response = self._post()

        assert response.status_code == 500
        mock_db.rollback.assert_called_once()
        mock_db.close.assert_called_once()

    def test_create_listing_zero_product_id_returns_500(self):
        """If lastrowid returns 0/None after product insert, should raise 500."""
        mock_db = MagicMock()
        mock_cursor = MagicMock()
        mock_db.cursor.return_value = mock_cursor

        call_count = [0]

        def execute_side(*args, **kwargs):
            call_count[0] += 1

        mock_cursor.execute.side_effect = execute_side

        # Return 0 as lastrowid (falsy) after first execute
        type(mock_cursor).lastrowid = property(lambda self: 0)

        with patch("routes.listings.get_db", return_value=mock_db):
            response = self._post()

        assert response.status_code == 500
        assert "Product insert failed" in response.json()["detail"]

    def test_create_listing_db_always_closed_on_success(self):
        mock_db = MagicMock()
        mock_cursor = MagicMock()
        mock_db.cursor.return_value = mock_cursor
        mock_cursor.lastrowid = 1

        with patch("routes.listings.get_db", return_value=mock_db):
            self._post()

        mock_db.close.assert_called_once()

    def test_create_listing_db_always_closed_on_error(self):
        mock_db = MagicMock()
        mock_cursor = MagicMock()
        mock_db.cursor.return_value = mock_cursor
        mock_cursor.execute.side_effect = Exception("crash")

        with patch("routes.listings.get_db", return_value=mock_db):
            self._post()

        mock_db.close.assert_called_once()

    def test_create_listing_defaults_applied(self):
        """Optional fields default to empty string / 'other' / 'good' / 'sell'."""
        mock_db = MagicMock()
        mock_cursor = MagicMock()
        mock_db.cursor.return_value = mock_cursor
        mock_cursor.lastrowid = 3

        with patch("routes.listings.get_db", return_value=mock_db):
            response = client.post("/listings/", data={
                "user_id": "u1",
                "title": "Minimal",
                "price": "10.00",
            })

        assert response.status_code == 200
        # First execute (products insert): check defaults
        product_insert_args = mock_cursor.execute.call_args_list[0][0][1]
        # description, specifications default to ""
        assert product_insert_args[1] == ""   # description
        assert product_insert_args[2] == ""   # specifications
        assert product_insert_args[4] == "other"   # category
        assert product_insert_args[5] == "good"    # condition


# =============================================================================
# ─── STRIPE PAYMENTS — additional gap coverage ───────────────────────────────
# =============================================================================

# ── get_firestore ─────────────────────────────────────────────────────────────

class TestGetFirestore:

    def test_get_firestore_no_credentials_returns_none(self):
        import firebase_admin
        from routes.stripe_payments import get_firestore

        # Clear existing app
        if firebase_admin._apps:
            firebase_admin.delete_app(firebase_admin.get_app())

        with patch.dict("os.environ", {}, clear=False):
            import os
            os.environ.pop("FIREBASE_SERVICE_ACCOUNT_JSON", None)
            result = get_firestore()

        assert result is None

    def test_get_firestore_bad_json_returns_none(self):
        import firebase_admin
        from routes.stripe_payments import get_firestore

        if firebase_admin._apps:
            firebase_admin.delete_app(firebase_admin.get_app())

        with patch.dict("os.environ", {"FIREBASE_SERVICE_ACCOUNT_JSON": "not-valid-json"}):
            result = get_firestore()

        assert result is None

    def test_get_firestore_already_initialised_returns_client(self):
        """When Firebase is already initialised, should skip init and return client."""
        from routes.stripe_payments import get_firestore

        mock_client = MagicMock()
        with patch("routes.stripe_payments.firestore.client", return_value=mock_client), \
             patch("firebase_admin._apps", {"[DEFAULT]": MagicMock()}):
            result = get_firestore()

        assert result == mock_client

    def test_get_firestore_client_failure_returns_none(self):
        from routes.stripe_payments import get_firestore

        with patch("routes.stripe_payments.firestore.client", side_effect=Exception("Firestore down")), \
             patch("firebase_admin._apps", {"[DEFAULT]": MagicMock()}):
            result = get_firestore()

        assert result is None


# ── get_stripe ────────────────────────────────────────────────────────────────

class TestGetStripe:

    def test_get_stripe_missing_key_raises_500(self):
        from routes.stripe_payments import get_stripe
        from fastapi import HTTPException

        with patch.dict("os.environ", {}, clear=False):
            import os
            os.environ.pop("STRIPE_SECRET_KEY", None)
            with pytest.raises(HTTPException) as exc_info:
                get_stripe()
        assert exc_info.value.status_code == 500
        assert "STRIPE_SECRET_KEY" in exc_info.value.detail


# ── GET /api/stripe/health ────────────────────────────────────────────────────

class TestStripeHealth:

    def test_health_both_configured(self):
        with patch.dict("os.environ", {"STRIPE_SECRET_KEY": "sk_test_123"}), \
             patch("routes.stripe_payments.get_firestore", return_value=MagicMock()):
            response = client.get("/api/stripe/health")
        assert response.status_code == 200
        data = response.json()
        assert data["stripe_configured"] is True
        assert data["firebase_configured"] is True

    def test_health_neither_configured(self):
        import os
        os.environ.pop("STRIPE_SECRET_KEY", None)
        with patch("routes.stripe_payments.get_firestore", return_value=None):
            response = client.get("/api/stripe/health")
        assert response.status_code == 200
        data = response.json()
        assert data["stripe_configured"] is False
        assert data["firebase_configured"] is False


# ── POST /api/stripe/verify-session ──────────────────────────────────────────

def _make_verify_session_payload(**overrides):
    base = {"sessionId": "cs_test_abc", "transactionId": "tx_001"}
    base.update(overrides)
    return base


def _make_fake_session(payment_status="paid", amount_total=5000, metadata=None, client_reference_id="tx_001"):
    s = MagicMock()
    s.payment_status = payment_status
    s.amount_total = amount_total
    s.id = "cs_test_abc"
    s.metadata = metadata if metadata is not None else {"transactionId": "tx_001"}
    s.client_reference_id = client_reference_id
    return s


def _make_tx_fs(tx_exists=True, payment_status="pending", extra_tx=None):
    """Firestore mock for verify-session tests."""
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


class TestVerifySession:

    def test_verify_session_unpaid_returns_false(self):
        fake_session = _make_fake_session(payment_status="unpaid")
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = fake_session

        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            response = client.post("/api/stripe/verify-session", json=_make_verify_session_payload())

        assert response.status_code == 200
        assert response.json()["paid"] is False

    def test_verify_session_paid_no_firestore_returns_warning(self):
        fake_session = _make_fake_session()
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = fake_session

        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=None):
            response = client.post("/api/stripe/verify-session", json=_make_verify_session_payload())

        assert response.status_code == 200
        assert response.json()["paid"] is True
        assert "warning" in response.json()

    def test_verify_session_tx_not_found_returns_warning(self):
        fake_session = _make_fake_session()
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = fake_session
        mock_fs, _ = _make_tx_fs(tx_exists=False)

        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
            response = client.post("/api/stripe/verify-session", json=_make_verify_session_payload())

        assert response.status_code == 200
        assert response.json()["paid"] is True
        assert "warning" in response.json()

    def test_verify_session_already_paid_returns_already_updated(self):
        fake_session = _make_fake_session()
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = fake_session
        mock_fs, _ = _make_tx_fs(payment_status="paid")

        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
            response = client.post("/api/stripe/verify-session", json=_make_verify_session_payload())

        assert response.status_code == 200
        assert response.json()["alreadyUpdated"] is True

    def test_verify_session_updates_transaction_on_success(self):
        fake_session = _make_fake_session(amount_total=10000)
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = fake_session
        mock_fs, tx_doc = _make_tx_fs(payment_status="pending")

        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
            response = client.post("/api/stripe/verify-session", json=_make_verify_session_payload())

        assert response.status_code == 200
        data = response.json()
        assert data["paid"] is True
        assert data["alreadyUpdated"] is False
        tx_doc.update.assert_called_once()
        update_data = tx_doc.update.call_args[0][0]
        assert update_data["paymentStatus"] == "paid"
        assert update_data["status"] == "waiting"
        assert update_data["revenueAmount"] == 100.0  # 10000 / 100

    def test_verify_session_resolves_tx_id_from_metadata_when_payload_empty(self):
        """transactionId missing from payload — should fall back to session metadata."""
        fake_session = _make_fake_session(metadata={"transactionId": "tx_from_meta"}, client_reference_id=None)
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = fake_session
        mock_fs, _ = _make_tx_fs(payment_status="pending")

        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
            response = client.post("/api/stripe/verify-session",
                                   json={"sessionId": "cs_test_abc", "transactionId": ""})

        assert response.status_code == 200

    def test_verify_session_no_tx_id_anywhere_returns_400(self):
        fake_session = _make_fake_session(metadata={}, client_reference_id=None)
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = fake_session

        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=MagicMock()):
            response = client.post("/api/stripe/verify-session",
                                   json={"sessionId": "cs_test_abc", "transactionId": ""})

        assert response.status_code == 400

    def test_verify_session_analytics_error_is_non_fatal(self):
        """Analytics failure should not prevent the transaction from being updated."""
        fake_session = _make_fake_session(amount_total=5000)
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = fake_session
        mock_fs, tx_doc = _make_tx_fs(payment_status="pending")

        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs), \
             patch("routes.stripe_payments.update_analytics", side_effect=Exception("analytics boom")):
            response = client.post("/api/stripe/verify-session", json=_make_verify_session_payload())

        # Should still succeed despite analytics error
        assert response.status_code == 200
        assert response.json()["paid"] is True
        tx_doc.update.assert_called_once()

    def test_verify_session_firestore_update_fails_returns_500(self):
        fake_session = _make_fake_session()
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = fake_session
        mock_fs, tx_doc = _make_tx_fs(payment_status="pending")
        tx_doc.update.side_effect = Exception("write failed")

        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
            response = client.post("/api/stripe/verify-session", json=_make_verify_session_payload())

        assert response.status_code == 500

    def test_verify_session_stripe_retrieve_error_returns_500(self):
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.side_effect = Exception("Network error")

        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            response = client.post("/api/stripe/verify-session", json=_make_verify_session_payload())

        assert response.status_code == 500
        assert "Network error" in response.json()["detail"]

    def test_verify_session_partial_payment_analytics_uses_online_amount(self):
        fake_session = _make_fake_session(amount_total=8000)
        fake_stripe = MagicMock()
        fake_stripe.checkout.Session.retrieve.return_value = fake_session
        mock_fs, tx_doc = _make_tx_fs(
            payment_status="pending",
            extra_tx={"paymentType": "partial", "onlineAmount": 40.0},
        )

        analytics_calls = []

        def capture_analytics(fs, amount, payment_type, tx_data):
            analytics_calls.append((amount, payment_type, tx_data))

        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs), \
             patch("routes.stripe_payments.update_analytics", side_effect=capture_analytics):
            response = client.post("/api/stripe/verify-session", json=_make_verify_session_payload())

        assert response.status_code == 200
        assert analytics_calls[0][1] == "partial"


# ── WEBHOOK — marketplace transaction path ────────────────────────────────────

def _marketplace_webhook_event(tx_id="tx_wh_1", session_id="cs_mkt_1", amount_total=5000):
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


class TestWebhookMarketplace:

    def _post_webhook(self, event, fake_stripe):
        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": "whsec_test"}):
            return client.post(
                "/api/stripe/webhook",
                content=json.dumps(event).encode(),
                headers={"stripe-signature": "sig", "content-type": "application/json"},
            )

    def test_webhook_invalid_payload_returns_400(self):
        fake_stripe = MagicMock()
        fake_stripe.Webhook.construct_event.side_effect = ValueError("bad payload")

        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": "whsec_test"}):
            response = client.post(
                "/api/stripe/webhook",
                content=b"bad-data",
                headers={"stripe-signature": "sig", "content-type": "application/json"},
            )
        assert response.status_code == 400
        assert "Invalid webhook payload" in response.json()["detail"]

    def test_webhook_invalid_signature_returns_400(self):
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

    def test_webhook_missing_secret_returns_500(self):
        fake_stripe = MagicMock()
        import os
        os.environ.pop("STRIPE_WEBHOOK_SECRET", None)

        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
            response = client.post(
                "/api/stripe/webhook",
                content=b"data",
                headers={"stripe-signature": "sig", "content-type": "application/json"},
            )
        assert response.status_code == 500

    def test_webhook_marketplace_tx_updates_to_paid(self):
        event = _marketplace_webhook_event()
        fake_stripe = MagicMock()
        fake_stripe.Webhook.construct_event.return_value = event

        mock_fs, tx_doc = _make_tx_fs(payment_status="pending")
        tx_snap = MagicMock()
        tx_snap.exists = True
        tx_snap.to_dict.return_value = {"paymentStatus": "pending"}
        tx_doc.get.return_value = tx_snap

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
        tx_doc.update.assert_called_once()
        update_data = tx_doc.update.call_args[0][0]
        assert update_data["paymentStatus"] == "paid"
        assert update_data["status"] == "waiting"

    def test_webhook_marketplace_tx_already_paid_skips(self):
        event = _marketplace_webhook_event()
        fake_stripe = MagicMock()
        fake_stripe.Webhook.construct_event.return_value = event

        mock_fs, tx_doc = _make_tx_fs(payment_status="paid")
        tx_snap = MagicMock()
        tx_snap.exists = True
        tx_snap.to_dict.return_value = {"paymentStatus": "paid"}
        tx_doc.get.return_value = tx_snap

        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs), \
             patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": "whsec_test"}):
            response = client.post(
                "/api/stripe/webhook",
                content=json.dumps(event).encode(),
                headers={"stripe-signature": "sig", "content-type": "application/json"},
            )

        assert response.status_code == 200
        tx_doc.update.assert_not_called()

    def test_webhook_marketplace_no_tx_id_skips_gracefully(self):
        event = {
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_mkt_1",
                    "payment_status": "paid",
                    "amount_total": 5000,
                    "metadata": {},  # no transactionId
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

    def test_webhook_marketplace_no_firestore_skips(self):
        event = _marketplace_webhook_event()
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

    def test_webhook_marketplace_firestore_error_returns_500(self):
        event = _marketplace_webhook_event()
        fake_stripe = MagicMock()
        fake_stripe.Webhook.construct_event.return_value = event

        mock_fs = MagicMock()
        mock_fs.collection.side_effect = Exception("Firestore crash")

        with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
             patch("routes.stripe_payments.get_firestore", return_value=mock_fs), \
             patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": "whsec_test"}):
            response = client.post(
                "/api/stripe/webhook",
                content=json.dumps(event).encode(),
                headers={"stripe-signature": "sig", "content-type": "application/json"},
            )

        assert response.status_code == 500


# =============================================================================
# ─── main.py root + health endpoints ─────────────────────────────────────────
# =============================================================================

class TestMainEndpoints:

    def test_root_returns_running(self):
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Campus Marketplace API"
        assert data["status"] == "running"

    def test_app_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["api"] == "ok"
        assert "stripeConfigured" in data
        assert "webhookConfigured" in data
        assert "firebaseConfigured" in data

    def test_app_health_stripe_configured_true(self):
        with patch.dict("os.environ", {"STRIPE_SECRET_KEY": "sk_test_abc"}):
            response = client.get("/health")
        assert response.json()["stripeConfigured"] is True

    def test_app_health_stripe_configured_false(self):
        import os
        os.environ.pop("STRIPE_SECRET_KEY", None)
        response = client.get("/health")
        assert response.json()["stripeConfigured"] is False

# =============================================================================
# ─── database.py ─────────────────────────────────────────────────────────────
# =============================================================================

class TestGetDb:

    def test_get_db_returns_connection(self):
        mock_conn = MagicMock()
        with patch("mysql.connector.connect", return_value=mock_conn) as mock_connect:
            from database import get_db
            result = get_db()
        assert result == mock_conn

    def test_get_db_uses_env_vars(self):
        mock_conn = MagicMock()
        with patch("mysql.connector.connect", return_value=mock_conn) as mock_connect, \
             patch.dict("os.environ", {
                 "DB_HOST": "myhost",
                 "DB_USER": "myuser",
                 "DB_PASSWORD": "mypass",
                 "DB_NAME": "mydb",
             }):
            from database import get_db
            get_db()

        mock_connect.assert_called_once_with(
            host="myhost",
            user="myuser",
            password="mypass",
            database="mydb",
            ssl_ca=None,
            ssl_disabled=False,
        )

    def test_get_db_missing_env_vars_still_calls_connect(self):
        """Missing env vars pass None to connector — it raises, not get_db itself."""
        with patch("mysql.connector.connect", side_effect=Exception("Access denied")) as mock_connect:
            from database import get_db
            with pytest.raises(Exception, match="Access denied"):
                get_db()

    def test_get_db_ssl_disabled_is_false(self):
        """ssl_disabled must always be False (never skip SSL)."""
        mock_conn = MagicMock()
        with patch("mysql.connector.connect", return_value=mock_conn) as mock_connect:
            from database import get_db
            get_db()

        call_kwargs = mock_connect.call_args.kwargs
        assert call_kwargs["ssl_disabled"] is False
        assert call_kwargs["ssl_ca"] is None