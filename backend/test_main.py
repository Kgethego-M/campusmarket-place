import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from main import app

client = TestClient(app)


# =============================================================================
# HELPERS
# =============================================================================

def make_mock_db(fetchall_return=None):
    mock_cursor = MagicMock()
    mock_cursor.fetchall.return_value = fetchall_return or []
    mock_cursor.lastrowid = 1
    mock_db = MagicMock()
    mock_db.cursor.return_value = mock_cursor
    return mock_db, mock_cursor


# =============================================================================
# ROOT / HEALTH
# =============================================================================

def test_read_root():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Campus Marketplace API"
    assert data["status"] == "running"

def test_app_exists():
    assert app is not None

def test_404_on_nonexistent_route():
    response = client.get("/this-path-does-not-exist")
    assert response.status_code == 404

def test_root_response_structure():
    response = client.get("/")
    assert "message" in response.json()

def test_root_content_type():
    response = client.get("/")
    assert response.headers["content-type"] == "application/json"

def test_method_not_allowed_on_root():
    response = client.post("/")
    assert response.status_code == 405

def test_app_has_routes():
    assert len(app.routes) > 0

def test_app_title():
    assert app.title is not None

def test_multiple_requests_to_root():
    for _ in range(3):
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Campus Marketplace API"
        assert data["status"] == "running"

def test_404_response_structure():
    response = client.get("/nonexistent")
    assert "detail" in response.json()


# =============================================================================
# STRIPE CHECKOUT
# =============================================================================

@pytest.mark.skip(reason="Requires network connection - Stripe library makes network calls")
def test_stripe_checkout_requires_secret_key():
    payload = {
        "transactionId": "tx123",
        "buyerEmail": "student@example.com",
        "amount": 30000,
        "amountRand": 300,
        "cashAmount": 0,
        "totalAmount": 300,
        "currency": "zar",
        "stripeRef": "CM-TX123-123",
        "paymentType": "online",
        "listingTitle": "Calculator",
        "successUrl": "http://localhost:5173/payment-success?tx=tx123",
        "cancelUrl": "http://localhost:5173/payment-cancelled?tx=tx123",
        "metadata": {"transactionId": "tx123"},
    }
    with patch.dict("os.environ", {}, clear=True):
        response = client.post("/api/stripe/create-checkout-session", json=payload)
    assert response.status_code == 500


def test_stripe_checkout_creates_session():
    payload = {
        "transactionId": "tx123",
        "buyerEmail": "student@example.com",
        "amount": 30000,
        "amountRand": 300,
        "cashAmount": 0,
        "totalAmount": 300,
        "currency": "zar",
        "stripeRef": "CM-TX123-123",
        "paymentType": "online",
        "listingId": "listing123",
        "listingTitle": "Calculator",
        "successUrl": "http://localhost:5173/payment-success?tx=tx123",
        "cancelUrl": "http://localhost:5173/payment-cancelled?tx=tx123",
        "metadata": {"buyerId": "buyer123", "sellerId": "seller123"},
    }
    fake_session = MagicMock()
    fake_session.id  = "cs_test_123"
    fake_session.url = "https://checkout.stripe.com/c/pay/cs_test_123"
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.create.return_value = fake_session

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
        response = client.post("/api/stripe/create-checkout-session", json=payload)

    assert response.status_code == 200
    assert response.json() == {
        "id": "cs_test_123",
        "url": "https://checkout.stripe.com/c/pay/cs_test_123",
    }
    create_args = fake_stripe.checkout.Session.create.call_args.kwargs
    assert create_args["mode"] == "payment"
    assert create_args["line_items"][0]["price_data"]["unit_amount"] == 30000
    assert create_args["metadata"]["transactionId"] == "tx123"


# =============================================================================
# STRIPE VERIFY SESSION
# =============================================================================

@pytest.mark.skip(reason="Requires network connection - Stripe library makes network calls")
def test_verify_session_requires_secret_key():
    payload = {
        "sessionId": "cs_test_123",
        "transactionId": "tx123",
    }
    with patch.dict("os.environ", {}, clear=True):
        response = client.post("/api/stripe/verify-session", json=payload)
    assert response.status_code == 500


def test_verify_session_payment_not_paid():
    payload = {
        "sessionId": "cs_test_123",
        "transactionId": "tx123",
    }
    fake_session = MagicMock()
    fake_session.payment_status = "unpaid"
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.retrieve.return_value = fake_session

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
        response = client.post("/api/stripe/verify-session", json=payload)

    assert response.status_code == 200
    assert response.json() == {"paid": False, "status": "unpaid"}


def test_verify_session_payment_paid_no_firestore():
    payload = {
        "sessionId": "cs_test_123",
        "transactionId": "tx123",
    }
    fake_session = MagicMock()
    fake_session.payment_status = "paid"
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.retrieve.return_value = fake_session

    # Mock get_firestore to return None (Firestore not configured)
    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
         patch("routes.stripe_payments.get_firestore", return_value=None):
        response = client.post("/api/stripe/verify-session", json=payload)

    assert response.status_code == 200
    assert response.json()["paid"] == True
    assert response.json()["status"] == "paid"


def test_verify_session_payment_paid_transaction_not_found():
    payload = {
        "sessionId": "cs_test_123",
        "transactionId": "tx123",
    }
    fake_session = MagicMock()
    fake_session.payment_status = "paid"
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.retrieve.return_value = fake_session

    mock_fs = MagicMock()
    mock_collection = MagicMock()
    mock_doc = MagicMock()
    mock_snapshot = MagicMock()
    mock_snapshot.exists = False
    mock_doc.get.return_value = mock_snapshot
    mock_collection.document.return_value = mock_doc
    mock_fs.collection.return_value = mock_collection

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
         patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
        response = client.post("/api/stripe/verify-session", json=payload)

    assert response.status_code == 200
    assert response.json()["paid"] == True
    assert "warning" in response.json()


def test_verify_session_payment_paid_updates_transaction():
    payload = {
        "sessionId": "cs_test_123",
        "transactionId": "tx123",
    }
    fake_session = MagicMock()
    fake_session.payment_status = "paid"
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.retrieve.return_value = fake_session

    mock_fs = MagicMock()
    mock_collection = MagicMock()
    mock_doc = MagicMock()
    mock_snapshot = MagicMock()
    mock_snapshot.exists = True
    mock_snapshot.to_dict.return_value = {
        "paymentStatus": "pending",
        "status": "accepted",
    }
    mock_doc.get.return_value = mock_snapshot
    mock_collection.document.return_value = mock_doc
    mock_fs.collection.return_value = mock_collection

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
         patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
        response = client.post("/api/stripe/verify-session", json=payload)

    assert response.status_code == 200
    assert response.json()["paid"] == True
    mock_doc.update.assert_called_once()
    update_data = mock_doc.update.call_args[0][0]
    assert update_data["status"] == "waiting"
    assert update_data["paymentStatus"] == "paid"
    assert update_data["paymentProvider"] == "stripe"


def test_verify_session_already_updated_does_nothing():
    payload = {
        "sessionId": "cs_test_123",
        "transactionId": "tx123",
    }
    fake_session = MagicMock()
    fake_session.payment_status = "paid"
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.retrieve.return_value = fake_session

    mock_fs = MagicMock()
    mock_collection = MagicMock()
    mock_doc = MagicMock()
    mock_snapshot = MagicMock()
    mock_snapshot.exists = True
    mock_snapshot.to_dict.return_value = {
        "paymentStatus": "paid",
        "status": "waiting",
    }
    mock_doc.get.return_value = mock_snapshot
    mock_collection.document.return_value = mock_doc
    mock_fs.collection.return_value = mock_collection

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe), \
         patch("routes.stripe_payments.get_firestore", return_value=mock_fs):
        response = client.post("/api/stripe/verify-session", json=payload)

    assert response.status_code == 200
    assert response.json()["paid"] == True
    mock_doc.update.assert_not_called()


def test_verify_session_stripe_error():
    payload = {
        "sessionId": "cs_test_123",
        "transactionId": "tx123",
    }
    fake_stripe = MagicMock()
    fake_stripe.checkout.Session.retrieve.side_effect = Exception("Stripe API error")

    with patch("routes.stripe_payments.get_stripe", return_value=fake_stripe):
        response = client.post("/api/stripe/verify-session", json=payload)

    assert response.status_code == 500
    assert "Stripe API error" in response.json()["detail"]


# =============================================================================
# GET /listings/
# =============================================================================

class TestGetListings:

    def test_get_listings_returns_200(self):
        mock_db, mock_cursor = make_mock_db(fetchall_return=[])
        with patch("routes.listings.get_db", return_value=mock_db):
            response = client.get("/listings/")
        assert response.status_code == 200

    def test_get_listings_returns_list(self):
        mock_db, mock_cursor = make_mock_db(fetchall_return=[])
        with patch("routes.listings.get_db", return_value=mock_db):
            response = client.get("/listings/")
        assert isinstance(response.json(), list)

    def test_get_listings_returns_data(self):
        fake_listings = [
            {"listing_id": 1, "title": "Calculus Book", "price": 150.0},
            {"listing_id": 2, "title": "Physics Notes", "price": 80.0},
        ]
        mock_db, mock_cursor = make_mock_db(fetchall_return=fake_listings)
        with patch("routes.listings.get_db", return_value=mock_db):
            response = client.get("/listings/")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["title"] == "Calculus Book"

    def test_get_listings_closes_db(self):
        mock_db, _ = make_mock_db()
        with patch("routes.listings.get_db", return_value=mock_db):
            client.get("/listings/")
        mock_db.close.assert_called_once()

    def test_get_listings_calls_join_query(self):
        mock_db, mock_cursor = make_mock_db()
        with patch("routes.listings.get_db", return_value=mock_db):
            client.get("/listings/")
        mock_cursor.execute.assert_called_once()
        sql = mock_cursor.execute.call_args[0][0]
        assert "listings" in sql.lower()
        assert "products" in sql.lower()

    def test_get_listings_db_error_returns_500(self):
        mock_db = MagicMock()
        mock_db.cursor.return_value.execute.side_effect = Exception("DB connection failed")
        with patch("routes.listings.get_db", return_value=mock_db):
            response = client.get("/listings/")
        assert response.status_code == 500


# =============================================================================
# POST /listings/  — validation
# =============================================================================

class TestCreateListingValidation:

    BASE_FORM = {
        "user_id": "user-abc",
        "title": "Test Book",
        "price": "100",
        "listing_type": "sell",
        "condition": "good",
    }

    def _post(self, overrides=None):
        data = {**self.BASE_FORM, **(overrides or {})}
        return client.post("/listings/", data=data)

    def test_invalid_listing_type_returns_400(self):
        mock_db, _ = make_mock_db()
        with patch("routes.listings.get_db", return_value=mock_db):
            response = self._post({"listing_type": "donate"})
        assert response.status_code == 400
        assert "listing_type" in response.json()["detail"]

    def test_invalid_condition_returns_400(self):
        mock_db, _ = make_mock_db()
        with patch("routes.listings.get_db", return_value=mock_db):
            response = self._post({"condition": "broken"})
        assert response.status_code == 400
        assert "condition" in response.json()["detail"]

    def test_valid_listing_type_sell(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 1
        with patch("routes.listings.get_db", return_value=mock_db):
            response = self._post({"listing_type": "sell"})
        assert response.status_code == 200

    def test_valid_listing_type_trade(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 2
        with patch("routes.listings.get_db", return_value=mock_db):
            response = self._post({"listing_type": "trade"})
        assert response.status_code == 200

    def test_valid_listing_type_either(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 3
        with patch("routes.listings.get_db", return_value=mock_db):
            response = self._post({"listing_type": "either"})
        assert response.status_code == 200

    def test_valid_condition_new(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 1
        with patch("routes.listings.get_db", return_value=mock_db):
            response = self._post({"condition": "new"})
        assert response.status_code == 200

    def test_valid_condition_like_new(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 1
        with patch("routes.listings.get_db", return_value=mock_db):
            response = self._post({"condition": "like_new"})
        assert response.status_code == 200

    def test_valid_condition_fair(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 1
        with patch("routes.listings.get_db", return_value=mock_db):
            response = self._post({"condition": "fair"})
        assert response.status_code == 200

    def test_listing_type_normalised_to_lowercase(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 1
        with patch("routes.listings.get_db", return_value=mock_db):
            response = self._post({"listing_type": "SELL"})
        assert response.status_code == 200

    def test_condition_normalised_to_lowercase(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 1
        with patch("routes.listings.get_db", return_value=mock_db):
            response = self._post({"condition": "GOOD"})
        assert response.status_code == 200


# =============================================================================
# POST /listings/  — successful creation
# =============================================================================

class TestCreateListingSuccess:

    BASE_FORM = {
        "user_id": "user-abc",
        "title": "Calculus Textbook",
        "price": "150",
        "listing_type": "sell",
        "condition": "good",
    }

    def test_create_listing_returns_200(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 5
        with patch("routes.listings.get_db", return_value=mock_db):
            response = client.post("/listings/", data=self.BASE_FORM)
        assert response.status_code == 200

    def test_create_listing_response_has_listing_id(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 5
        with patch("routes.listings.get_db", return_value=mock_db):
            response = client.post("/listings/", data=self.BASE_FORM)
        assert "listing_id" in response.json()

    def test_create_listing_response_has_product_id(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 5
        with patch("routes.listings.get_db", return_value=mock_db):
            response = client.post("/listings/", data=self.BASE_FORM)
        assert "product_id" in response.json()

    def test_create_listing_response_has_message(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 5
        with patch("routes.listings.get_db", return_value=mock_db):
            response = client.post("/listings/", data=self.BASE_FORM)
        assert response.json()["message"] == "Listing created successfully"

    def test_create_listing_commits_db(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 5
        with patch("routes.listings.get_db", return_value=mock_db):
            client.post("/listings/", data=self.BASE_FORM)
        mock_db.commit.assert_called_once()

    def test_create_listing_closes_db(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 5
        with patch("routes.listings.get_db", return_value=mock_db):
            client.post("/listings/", data=self.BASE_FORM)
        mock_db.close.assert_called_once()

    def test_create_listing_with_optional_fields(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 7
        data = {
            **self.BASE_FORM,
            "description": "A great book",
            "specifications": "3rd Edition",
            "category": "textbooks",
        }
        with patch("routes.listings.get_db", return_value=mock_db):
            response = client.post("/listings/", data=data)
        assert response.status_code == 200

    def test_create_listing_inserts_product_then_listing(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 5
        with patch("routes.listings.get_db", return_value=mock_db):
            client.post("/listings/", data=self.BASE_FORM)
        assert mock_cursor.execute.call_count == 2
        first_sql = mock_cursor.execute.call_args_list[0][0][0]
        second_sql = mock_cursor.execute.call_args_list[1][0][0]
        assert "products" in first_sql.lower()
        assert "listings" in second_sql.lower()


# =============================================================================
# POST /listings/  — DB error handling
# =============================================================================

class TestCreateListingErrors:

    BASE_FORM = {
        "user_id": "user-abc",
        "title": "Test Book",
        "price": "100",
        "listing_type": "sell",
        "condition": "good",
    }

    def test_db_exception_returns_500(self):
        mock_db = MagicMock()
        mock_db.cursor.return_value.execute.side_effect = Exception("DB error")
        with patch("routes.listings.get_db", return_value=mock_db):
            response = client.post("/listings/", data=self.BASE_FORM)
        assert response.status_code == 500

    def test_db_exception_rolls_back(self):
        mock_db = MagicMock()
        mock_db.cursor.return_value.execute.side_effect = Exception("DB error")
        with patch("routes.listings.get_db", return_value=mock_db):
            client.post("/listings/", data=self.BASE_FORM)
        mock_db.rollback.assert_called_once()

    def test_db_exception_still_closes_db(self):
        mock_db = MagicMock()
        mock_db.cursor.return_value.execute.side_effect = Exception("DB error")
        with patch("routes.listings.get_db", return_value=mock_db):
            client.post("/listings/", data=self.BASE_FORM)
        mock_db.close.assert_called_once()


# =============================================================================
# POST /listings/  — image upload
# =============================================================================

class TestCreateListingImageUpload:

    BASE_FORM = {
        "user_id": "user-abc",
        "title": "Test Book",
        "price": "100",
        "listing_type": "sell",
        "condition": "good",
    }

    def test_create_listing_without_image_succeeds(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 1
        with patch("routes.listings.get_db", return_value=mock_db):
            response = client.post("/listings/", data=self.BASE_FORM)
        assert response.status_code == 200

    def test_create_listing_with_image_calls_upload(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 1
        fake_url = "https://fake.blob.core.windows.net/container/image.jpg"
        with patch("routes.listings.get_db", return_value=mock_db), \
             patch("routes.listings.upload_image", return_value=fake_url) as mock_upload:
            response = client.post(
                "/listings/",
                data=self.BASE_FORM,
                files={"image": ("test.jpg", b"fakeimagebytes", "image/jpeg")},
            )
        assert response.status_code == 200
        mock_upload.assert_called_once()

    def test_image_upload_failure_returns_500(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 1
        with patch("routes.listings.get_db", return_value=mock_db), \
             patch("routes.listings.upload_image", side_effect=Exception("Azure down")):
            response = client.post(
                "/listings/",
                data=self.BASE_FORM,
                files={"image": ("test.jpg", b"fakeimagebytes", "image/jpeg")},
            )
        assert response.status_code == 500
        assert "Image upload failed" in response.json()["detail"]


# =============================================================================
# upload_image() unit tests
# =============================================================================

class TestUploadImageHelper:

    def test_upload_image_raises_500_when_env_vars_missing(self):
        from fastapi import HTTPException
        from routes.listings import upload_image

        mock_file = MagicMock()
        mock_file.filename = "photo.jpg"

        with patch.dict("os.environ", {}, clear=True):
            import os
            os.environ.pop("AZURE_STORAGE_CONNECTION_STRING", None)
            os.environ.pop("AZURE_CONTAINER_NAME", None)
            with pytest.raises(HTTPException) as exc_info:
                upload_image(mock_file)
            assert exc_info.value.status_code == 500
            assert "Azure config missing" in exc_info.value.detail

    def test_upload_image_returns_url(self):
        from routes.listings import upload_image

        mock_file = MagicMock()
        mock_file.filename = "photo.jpg"
        mock_file.file = MagicMock()

        mock_blob_client = MagicMock()
        mock_blob_service = MagicMock()
        mock_blob_service.account_name = "myaccount"
        mock_blob_service.get_blob_client.return_value = mock_blob_client

        with patch.dict("os.environ", {
            "AZURE_STORAGE_CONNECTION_STRING": "fake_conn_str",
            "AZURE_CONTAINER_NAME": "fake-container",
        }), patch("routes.listings.BlobServiceClient.from_connection_string",
                  return_value=mock_blob_service):
            url = upload_image(mock_file)

        assert url.startswith("https://myaccount.blob.core.windows.net/fake-container/")
        assert url.endswith(".jpg")

    def test_upload_image_no_extension(self):
        from routes.listings import upload_image

        mock_file = MagicMock()
        mock_file.filename = ""
        mock_file.file = MagicMock()

        mock_blob_client = MagicMock()
        mock_blob_service = MagicMock()
        mock_blob_service.account_name = "myaccount"
        mock_blob_service.get_blob_client.return_value = mock_blob_client

        with patch.dict("os.environ", {
            "AZURE_STORAGE_CONNECTION_STRING": "fake_conn_str",
            "AZURE_CONTAINER_NAME": "fake-container",
        }), patch("routes.listings.BlobServiceClient.from_connection_string",
                  return_value=mock_blob_service):
            url = upload_image(mock_file)

        assert "myaccount" in url