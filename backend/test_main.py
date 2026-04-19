import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from backend.main import app

client = TestClient(app)


# =============================================================================
# HELPERS
# =============================================================================

def make_mock_db(fetchall_return=None):
    """Return a mock DB connection whose cursor behaves realistically."""
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
    assert response.json() == {"message": "Campus Marketplace API"}

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
        assert response.json() == {"message": "Campus Marketplace API"}

def test_404_response_structure():
    response = client.get("/nonexistent")
    assert "detail" in response.json()


# =============================================================================
# GET /listings/
# =============================================================================

class TestGetListings:

    def test_get_listings_returns_200(self):
        mock_db, mock_cursor = make_mock_db(fetchall_return=[])
        with patch("backend.routes.listings.get_db", return_value=mock_db):
            response = client.get("/listings/")
        assert response.status_code == 200

    def test_get_listings_returns_list(self):
        mock_db, mock_cursor = make_mock_db(fetchall_return=[])
        with patch("backend.routes.listings.get_db", return_value=mock_db):
            response = client.get("/listings/")
        assert isinstance(response.json(), list)

    def test_get_listings_returns_data(self):
        fake_listings = [
            {"listing_id": 1, "title": "Calculus Book", "price": 150.0},
            {"listing_id": 2, "title": "Physics Notes", "price": 80.0},
        ]
        mock_db, mock_cursor = make_mock_db(fetchall_return=fake_listings)
        with patch("backend.routes.listings.get_db", return_value=mock_db):
            response = client.get("/listings/")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["title"] == "Calculus Book"

    def test_get_listings_closes_db(self):
        mock_db, _ = make_mock_db()
        with patch("backend.routes.listings.get_db", return_value=mock_db):
            client.get("/listings/")
        mock_db.close.assert_called_once()

    def test_get_listings_calls_join_query(self):
        mock_db, mock_cursor = make_mock_db()
        with patch("backend.routes.listings.get_db", return_value=mock_db):
            client.get("/listings/")
        # Verify execute was called (i.e. the SELECT ran)
        mock_cursor.execute.assert_called_once()
        sql = mock_cursor.execute.call_args[0][0]
        assert "listings" in sql.lower()
        assert "products" in sql.lower()

    def test_get_listings_db_error_returns_500(self):
        mock_db = MagicMock()
        mock_db.cursor.return_value.execute.side_effect = Exception("DB connection failed")
        with patch("backend.routes.listings.get_db", return_value=mock_db):
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
        with patch("backend.routes.listings.get_db", return_value=mock_db):
            response = self._post({"listing_type": "donate"})
        assert response.status_code == 400
        assert "listing_type" in response.json()["detail"]

    def test_invalid_condition_returns_400(self):
        mock_db, _ = make_mock_db()
        with patch("backend.routes.listings.get_db", return_value=mock_db):
            response = self._post({"condition": "broken"})
        assert response.status_code == 400
        assert "condition" in response.json()["detail"]

    def test_valid_listing_type_sell(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 1
        with patch("backend.routes.listings.get_db", return_value=mock_db):
            response = self._post({"listing_type": "sell"})
        assert response.status_code == 200

    def test_valid_listing_type_trade(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 2
        with patch("backend.routes.listings.get_db", return_value=mock_db):
            response = self._post({"listing_type": "trade"})
        assert response.status_code == 200

    def test_valid_listing_type_either(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 3
        with patch("backend.routes.listings.get_db", return_value=mock_db):
            response = self._post({"listing_type": "either"})
        assert response.status_code == 200

    def test_valid_condition_new(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 1
        with patch("backend.routes.listings.get_db", return_value=mock_db):
            response = self._post({"condition": "new"})
        assert response.status_code == 200

    def test_valid_condition_like_new(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 1
        with patch("backend.routes.listings.get_db", return_value=mock_db):
            response = self._post({"condition": "like_new"})
        assert response.status_code == 200

    def test_valid_condition_fair(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 1
        with patch("backend.routes.listings.get_db", return_value=mock_db):
            response = self._post({"condition": "fair"})
        assert response.status_code == 200

    def test_listing_type_normalised_to_lowercase(self):
        """Input 'SELL' should be normalised and accepted."""
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 1
        with patch("backend.routes.listings.get_db", return_value=mock_db):
            response = self._post({"listing_type": "SELL"})
        assert response.status_code == 200

    def test_condition_normalised_to_lowercase(self):
        """Input 'GOOD' should be normalised and accepted."""
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 1
        with patch("backend.routes.listings.get_db", return_value=mock_db):
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
        with patch("backend.routes.listings.get_db", return_value=mock_db):
            response = client.post("/listings/", data=self.BASE_FORM)
        assert response.status_code == 200

    def test_create_listing_response_has_listing_id(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 5
        with patch("backend.routes.listings.get_db", return_value=mock_db):
            response = client.post("/listings/", data=self.BASE_FORM)
        assert "listing_id" in response.json()

    def test_create_listing_response_has_product_id(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 5
        with patch("backend.routes.listings.get_db", return_value=mock_db):
            response = client.post("/listings/", data=self.BASE_FORM)
        assert "product_id" in response.json()

    def test_create_listing_response_has_message(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 5
        with patch("backend.routes.listings.get_db", return_value=mock_db):
            response = client.post("/listings/", data=self.BASE_FORM)
        assert response.json()["message"] == "Listing created successfully"

    def test_create_listing_commits_db(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 5
        with patch("backend.routes.listings.get_db", return_value=mock_db):
            client.post("/listings/", data=self.BASE_FORM)
        mock_db.commit.assert_called_once()

    def test_create_listing_closes_db(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 5
        with patch("backend.routes.listings.get_db", return_value=mock_db):
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
        with patch("backend.routes.listings.get_db", return_value=mock_db):
            response = client.post("/listings/", data=data)
        assert response.status_code == 200

    def test_create_listing_inserts_product_then_listing(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 5
        with patch("backend.routes.listings.get_db", return_value=mock_db):
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
        with patch("backend.routes.listings.get_db", return_value=mock_db):
            response = client.post("/listings/", data=self.BASE_FORM)
        assert response.status_code == 500

    def test_db_exception_rolls_back(self):
        mock_db = MagicMock()
        mock_db.cursor.return_value.execute.side_effect = Exception("DB error")
        with patch("backend.routes.listings.get_db", return_value=mock_db):
            client.post("/listings/", data=self.BASE_FORM)
        mock_db.rollback.assert_called_once()

    def test_db_exception_still_closes_db(self):
        mock_db = MagicMock()
        mock_db.cursor.return_value.execute.side_effect = Exception("DB error")
        with patch("backend.routes.listings.get_db", return_value=mock_db):
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
        with patch("backend.routes.listings.get_db", return_value=mock_db):
            response = client.post("/listings/", data=self.BASE_FORM)
        assert response.status_code == 200

    def test_create_listing_with_image_calls_upload(self):
        mock_db, mock_cursor = make_mock_db()
        mock_cursor.lastrowid = 1
        fake_url = "https://fake.blob.core.windows.net/container/image.jpg"

        with patch("backend.routes.listings.get_db", return_value=mock_db), \
             patch("backend.routes.listings.upload_image", return_value=fake_url) as mock_upload:
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

        with patch("backend.routes.listings.get_db", return_value=mock_db), \
             patch("backend.routes.listings.upload_image", side_effect=Exception("Azure down")):
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
        from backend.routes.listings import upload_image

        mock_file = MagicMock()
        mock_file.filename = "photo.jpg"

        with patch.dict("os.environ", {}, clear=True):
            # Remove Azure env vars so they are absent
            import os
            os.environ.pop("AZURE_STORAGE_CONNECTION_STRING", None)
            os.environ.pop("AZURE_CONTAINER_NAME", None)

            with pytest.raises(HTTPException) as exc_info:
                upload_image(mock_file)
            assert exc_info.value.status_code == 500
            assert "Azure config missing" in exc_info.value.detail

    def test_upload_image_returns_url(self):
        from backend.routes.listings import upload_image

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
        }), patch("backend.routes.listings.BlobServiceClient.from_connection_string",
                  return_value=mock_blob_service):
            url = upload_image(mock_file)

        assert url.startswith("https://myaccount.blob.core.windows.net/fake-container/")
        assert url.endswith(".jpg")

    def test_upload_image_no_extension(self):
        from backend.routes.listings import upload_image

        mock_file = MagicMock()
        mock_file.filename = ""  # no extension
        mock_file.file = MagicMock()

        mock_blob_client = MagicMock()
        mock_blob_service = MagicMock()
        mock_blob_service.account_name = "myaccount"
        mock_blob_service.get_blob_client.return_value = mock_blob_client

        with patch.dict("os.environ", {
            "AZURE_STORAGE_CONNECTION_STRING": "fake_conn_str",
            "AZURE_CONTAINER_NAME": "fake-container",
        }), patch("backend.routes.listings.BlobServiceClient.from_connection_string",
                  return_value=mock_blob_service):
            url = upload_image(mock_file)

        assert "myaccount" in url