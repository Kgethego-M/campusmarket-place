import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

# --- TESTS ---

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
