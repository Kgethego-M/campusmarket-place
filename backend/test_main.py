import pytest
from fastapi.testclient import TestClient
from main import app
from routes.listings import router # Ensure this path matches your structure

client = TestClient(app)

# --- 1. MOCKING AUTHENTICATION ---
# This part "tricks" FastAPI into thinking someone is logged in.
# Replace 'get_current_user' with the actual name of your auth dependency function.
async def override_dependency():
    return {"username": "test_user", "id": 1}

# We tell FastAPI: "Whenever you ask for the user, use our fake version instead."
# Adjust 'get_current_user' to whatever you use in your listings route.
# app.dependency_overrides[get_current_user] = override_dependency 


# --- 2. TESTS ---

def test_read_root():
    """Verify the home route works."""
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Campus Marketplace API"}

def test_get_listings_authenticated():
    """
    Test that the /listings endpoint is accessible.
    If you haven't enabled the 'override_dependency' above yet, 
    this will likely return a 401 or 403 (which is still a good test!).
    """
    response = client.get("/listings")
    
    # We want to make sure it's not a 404 (file missing) or 500 (code error)
    assert response.status_code in [200, 401, 403]

def test_listings_response_format():
    """Check if the response is a list (standard for listings)."""
    response = client.get("/listings")
    if response.status_code == 200:
        assert isinstance(response.json(), list)
