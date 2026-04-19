import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_read_root():
    """
    Verify the home route works.
    This route only returns a string and doesn't use the database.
    """
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Campus Marketplace API"}


def test_app_exists():
    """
    A simple check to ensure the FastAPI app initialized correctly.
    """
    assert app is not None


def test_404_on_nonexistent_route():
    """
    Verify the server is running and correctly handling unknown routes.
    """
    response = client.get("/this-path-does-not-exist")
    assert response.status_code == 404


def test_root_response_structure():
    """
    Verify the root response has the expected keys.
    """
    response = client.get("/")
    data = response.json()
    assert "message" in data


def test_root_content_type():
    """
    Verify the root route returns JSON.
    """
    response = client.get("/")
    assert response.headers["content-type"] == "application/json"


def test_method_not_allowed_on_root():
    """
    POST to the root should return 405 Method Not Allowed.
    """
    response = client.post("/")
    assert response.status_code == 405


def test_app_has_routes():
    """
    Verify the app has routes registered.
    """
    assert len(app.routes) > 0


def test_app_title():
    """
    Verify the app has a title set.
    """
    assert app.title is not None


def test_multiple_requests_to_root():
    """
    Verify the root route handles multiple requests consistently.
    """
    for _ in range(3):
        response = client.get("/")
        assert response.status_code == 200
        assert response.json() == {"message": "Campus Marketplace API"}


def test_404_response_structure():
    """
    Verify 404 responses have a detail field.
    """
    response = client.get("/nonexistent")
    assert "detail" in response.json()