# tests/test_stripe_payments.py
import json
import os
import pytest
from unittest.mock import Mock, patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient
from fastapi import FastAPI
from datetime import datetime

# Import the router after mocking
import stripe
import firebase_admin
from firebase_admin import firestore

# Create a test FastAPI app
app = FastAPI()
from stripe_payments import router, get_firestore_client, get_stripe, CheckoutSessionRequest, VerifySessionRequest
app.include_router(router)

client = TestClient(app)

# ─── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_env_vars():
    """Mock environment variables"""
    with patch.dict(os.environ, {
        "STRIPE_SECRET_KEY": "sk_test_mock_key_12345",
        "STRIPE_WEBHOOK_SECRET": "whsec_mock_secret_12345",
        "FIREBASE_SERVICE_ACCOUNT_JSON": '{"type": "service_account", "project_id": "test"}'
    }):
        yield

@pytest.fixture
def mock_firebase():
    """Mock Firebase Admin SDK"""
    with patch('firebase_admin.credentials.Certificate') as mock_cert, \
         patch('firebase_admin.initialize_app') as mock_init, \
         patch('firebase_admin.firestore.client') as mock_client:
        
        mock_db = MagicMock()
        mock_client.return_value = mock_db
        yield mock_db

@pytest.fixture
def mock_stripe():
    """Mock Stripe API"""
    with patch('stripe.checkout.Session') as mock_session:
        yield mock_session

@pytest.fixture
def valid_checkout_payload():
    """Valid checkout session request payload"""
    return {
        "transactionId": "tx_123456",
        "buyerEmail": "buyer@example.com",
        "amount": 15000,  # R150 in cents
        "amountRand": 150.00,
        "cashAmount": 0,
        "totalAmount": 150.00,
        "currency": "zar",
        "stripeRef": "stripe_ref_123",
        "paymentType": "full_online",
        "listingId": "listing_123",
        "listingTitle": "iPhone 12",
        "successUrl": "https://example.com/success",
        "cancelUrl": "https://example.com/cancel",
        "metadata": {"custom_field": "custom_value"}
    }

@pytest.fixture
def valid_verify_payload():
    """Valid verify session request payload"""
    return {
        "sessionId": "cs_test_abc123",
        "transactionId": "tx_123456"
    }

# ─── Health Check Tests ───────────────────────────────────────────────────────

class TestHealthCheck:
    """Tests for the /health endpoint"""
    
    def test_health_endpoint_without_stripe(self, mock_env_vars):
        """Test health endpoint when Stripe is not configured"""
        with patch.dict(os.environ, {"STRIPE_SECRET_KEY": "", "STRIPE_WEBHOOK_SECRET": ""}, clear=True):
            response = client.get("/api/stripe/health")
            assert response.status_code == 200
            data = response.json()
            assert data["message"] == "Stripe route is running"
            assert data["stripeConfigured"] is False
            assert data["webhookConfigured"] is False
    
    def test_health_endpoint_with_stripe(self, mock_env_vars):
        """Test health endpoint when Stripe is configured"""
        response = client.get("/api/stripe/health")
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Stripe route is running"
        assert data["stripeConfigured"] is True
        assert data["webhookConfigured"] is True

# ─── Create Checkout Session Tests ────────────────────────────────────────────

class TestCreateCheckoutSession:
    """Tests for the /create-checkout-session endpoint"""
    
    def test_create_checkout_session_success(self, mock_env_vars, mock_stripe, valid_checkout_payload):
        """Test successful creation of Stripe checkout session"""
        mock_session_instance = Mock()
        mock_session_instance.id = "cs_test_abc123"
        mock_session_instance.url = "https://checkout.stripe.com/session_abc123"
        mock_stripe.create.return_value = mock_session_instance
        
        response = client.post("/api/stripe/create-checkout-session", json=valid_checkout_payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "cs_test_abc123"
        assert data["url"] == "https://checkout.stripe.com/session_abc123"
        
        # Verify Stripe was called correctly
        mock_stripe.create.assert_called_once()
        call_args = mock_stripe.create.call_args[1]
        assert call_args["mode"] == "payment"
        assert call_args["customer_email"] == "buyer@example.com"
        assert call_args["client_reference_id"] == "tx_123456"
        assert call_args["payment_method_types"] == ["card"]
        assert call_args["metadata"]["transactionId"] == "tx_123456"
    
    def test_create_checkout_session_with_partial_payment(self, mock_env_vars, mock_stripe, valid_checkout_payload):
        """Test checkout session for partial payment"""
        valid_checkout_payload["paymentType"] = "partial"
        valid_checkout_payload["cashAmount"] = 50.00
        valid_checkout_payload["amount"] = 10000  # R100 online
        valid_checkout_payload["totalAmount"] = 150.00
        
        mock_session_instance = Mock()
        mock_session_instance.id = "cs_test_abc123"
        mock_session_instance.url = "https://checkout.stripe.com/session_abc123"
        mock_stripe.create.return_value = mock_session_instance
        
        response = client.post("/api/stripe/create-checkout-session", json=valid_checkout_payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "cs_test_abc123"
        
        # Verify metadata includes cash amount
        call_args = mock_stripe.create.call_args[1]
        assert call_args["metadata"]["cashAmount"] == "50.0"
    
    def test_create_checkout_session_missing_secret_key(self, valid_checkout_payload):
        """Test checkout session creation when STRIPE_SECRET_KEY is missing"""
        with patch.dict(os.environ, {}, clear=True):
            response = client.post("/api/stripe/create-checkout-session", json=valid_checkout_payload)
            assert response.status_code == 500
            assert "STRIPE_SECRET_KEY is missing" in response.json()["detail"]
    
    def test_create_checkout_session_stripe_error(self, mock_env_vars, mock_stripe, valid_checkout_payload):
        """Test when Stripe API returns an error"""
        mock_stripe.create.side_effect = Exception("Stripe API error: Invalid parameters")
        
        response = client.post("/api/stripe/create-checkout-session", json=valid_checkout_payload)
        
        assert response.status_code == 500
        assert "Failed to create Stripe Checkout session" in response.json()["detail"]
    
    def test_create_checkout_session_invalid_payload(self):
        """Test with invalid request payload"""
        invalid_payload = {
            "transactionId": "",  # Empty string - invalid
            "buyerEmail": "test@example.com",
            "amount": 10000
        }
        
        response = client.post("/api/stripe/create-checkout-session", json=invalid_payload)
        assert response.status_code == 422  # Validation error
    
    @pytest.mark.parametrize("payment_type", ["full_online", "partial", "cod"])
    def test_create_checkout_session_different_payment_types(self, mock_env_vars, mock_stripe, valid_checkout_payload, payment_type):
        """Test checkout session with different payment types"""
        valid_checkout_payload["paymentType"] = payment_type
        
        mock_session_instance = Mock()
        mock_session_instance.id = "cs_test_abc123"
        mock_session_instance.url = "https://checkout.stripe.com/session_abc123"
        mock_stripe.create.return_value = mock_session_instance
        
        response = client.post("/api/stripe/create-checkout-session", json=valid_checkout_payload)
        
        assert response.status_code == 200
        call_args = mock_stripe.create.call_args[1]
        assert call_args["metadata"]["paymentType"] == payment_type
    
    def test_create_checkout_session_with_custom_metadata(self, mock_env_vars, mock_stripe, valid_checkout_payload):
        """Test with custom metadata fields"""
        valid_checkout_payload["metadata"] = {
            "custom_field_1": "value1",
            "custom_field_2": "value2",
            "very_long_value": "a" * 600  # Should be truncated
        }
        
        mock_session_instance = Mock()
        mock_session_instance.id = "cs_test_abc123"
        mock_session_instance.url = "https://checkout.stripe.com/session_abc123"
        mock_stripe.create.return_value = mock_session_instance
        
        response = client.post("/api/stripe/create-checkout-session", json=valid_checkout_payload)
        
        assert response.status_code == 200
        call_args = mock_stripe.create.call_args[1]
        metadata = call_args["metadata"]
        assert metadata["custom_field_1"] == "value1"
        assert metadata["custom_field_2"] == "value2"
        assert len(metadata["very_long_value"]) <= 500  # Truncated

# ─── Verify Session Tests ─────────────────────────────────────────────────────

class TestVerifySession:
    """Tests for the /verify-session endpoint"""
    
    def test_verify_session_success_full_online(self, mock_env_vars, mock_firebase, mock_stripe, valid_verify_payload):
        """Test successful session verification for full online payment"""
        # Mock Stripe session retrieval
        mock_session = Mock()
        mock_session.payment_status = "paid"
        mock_session.amount_total = 15000  # R150
        mock_session.id = "cs_test_abc123"
        mock_session.get.return_value = {}
        mock_stripe.checkout.Session.retrieve.return_value = mock_session
        
        # Mock Firestore transaction
        mock_tx_ref = MagicMock()
        mock_tx_snap = MagicMock()
        mock_tx_snap.exists = True
        mock_tx_snap.to_dict.return_value = {
            "paymentStatus": "pending",
            "paymentType": "full_online",
            "status": "pending"
        }
        mock_tx_ref.get.return_value = mock_tx_snap
        mock_firebase.collection.return_value.document.return_value = mock_tx_ref
        
        # Mock analytics document
        mock_analytics_snap = MagicMock()
        mock_analytics_snap.exists = False
        mock_analytics_ref = MagicMock()
        mock_analytics_ref.get.return_value = mock_analytics_snap
        mock_firebase.collection.return_value.document.return_value = mock_analytics_ref
        
        response = client.post("/api/stripe/verify-session", json=valid_verify_payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["paid"] is True
        assert data["alreadyUpdated"] is False
        
        # Verify transaction was updated
        mock_tx_ref.update.assert_called_once()
        update_args = mock_tx_ref.update.call_args[0][0]
        assert update_args["status"] == "waiting"
        assert update_args["paymentStatus"] == "paid"
        assert update_args["paymentSettled"] is True
    
    def test_verify_session_already_paid(self, mock_env_vars, mock_firebase, mock_stripe, valid_verify_payload):
        """Test when transaction already has paymentStatus = paid"""
        mock_session = Mock()
        mock_session.payment_status = "paid"
        mock_session.amount_total = 15000
        mock_stripe.checkout.Session.retrieve.return_value = mock_session
        
        mock_tx_ref = MagicMock()
        mock_tx_snap = MagicMock()
        mock_tx_snap.exists = True
        mock_tx_snap.to_dict.return_value = {
            "paymentStatus": "paid",
            "paymentType": "full_online"
        }
        mock_tx_ref.get.return_value = mock_tx_snap
        mock_firebase.collection.return_value.document.return_value = mock_tx_ref
        
        response = client.post("/api/stripe/verify-session", json=valid_verify_payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["paid"] is True
        assert data["alreadyUpdated"] is True
        # Update should not be called again
        mock_tx_ref.update.assert_not_called()
    
    def test_verify_session_not_paid(self, mock_env_vars, mock_stripe, valid_verify_payload):
        """Test when Stripe session payment status is not paid"""
        mock_session = Mock()
        mock_session.payment_status = "unpaid"
        mock_stripe.checkout.Session.retrieve.return_value = mock_session
        
        response = client.post("/api/stripe/verify-session", json=valid_verify_payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["paid"] is False
        assert data["status"] == "unpaid"
    
    def test_verify_session_transaction_not_found(self, mock_env_vars, mock_firebase, mock_stripe, valid_verify_payload):
        """Test when transaction document doesn't exist"""
        mock_session = Mock()
        mock_session.payment_status = "paid"
        mock_session.amount_total = 15000
        mock_stripe.checkout.Session.retrieve.return_value = mock_session
        
        mock_tx_ref = MagicMock()
        mock_tx_snap = MagicMock()
        mock_tx_snap.exists = False
        mock_tx_ref.get.return_value = mock_tx_snap
        mock_firebase.collection.return_value.document.return_value = mock_tx_ref
        
        response = client.post("/api/stripe/verify-session", json=valid_verify_payload)
        
        assert response.status_code == 404
        assert "Transaction 'tx_123456' not found" in response.json()["detail"]
    
    def test_verify_session_without_transaction_id_recovered_from_metadata(self, mock_env_vars, mock_firebase, mock_stripe):
        """Test when transactionId is recovered from session metadata"""
        payload = {"sessionId": "cs_test_abc123", "transactionId": ""}
        
        mock_session = Mock()
        mock_session.payment_status = "paid"
        mock_session.amount_total = 15000
        mock_session.get.return_value = {}
        mock_session.metadata = {"transactionId": "tx_123456"}
        mock_session.client_reference_id = None
        mock_stripe.checkout.Session.retrieve.return_value = mock_session
        
        mock_tx_ref = MagicMock()
        mock_tx_snap = MagicMock()
        mock_tx_snap.exists = True
        mock_tx_snap.to_dict.return_value = {
            "paymentStatus": "pending",
            "paymentType": "full_online"
        }
        mock_tx_ref.get.return_value = mock_tx_snap
        mock_firebase.collection.return_value.document.return_value = mock_tx_ref
        
        mock_analytics_snap = MagicMock()
        mock_analytics_snap.exists = True
        mock_analytics_ref = MagicMock()
        mock_analytics_ref.get.return_value = mock_analytics_snap
        mock_firebase.collection.return_value.document.return_value = mock_analytics_ref
        
        response = client.post("/api/stripe/verify-session", json=payload)
        
        assert response.status_code == 200
        assert response.json()["paid"] is True
    
    def test_verify_session_partial_payment(self, mock_env_vars, mock_firebase, mock_stripe, valid_verify_payload):
        """Test verification for partial payment"""
        mock_session = Mock()
        mock_session.payment_status = "paid"
        mock_session.amount_total = 10000  # R100 online portion
        mock_stripe.checkout.Session.retrieve.return_value = mock_session
        
        mock_tx_ref = MagicMock()
        mock_tx_snap = MagicMock()
        mock_tx_snap.exists = True
        mock_tx_snap.to_dict.return_value = {
            "paymentStatus": "pending",
            "paymentType": "partial",
            "onlineAmount": 100.00
        }
        mock_tx_ref.get.return_value = mock_tx_snap
        mock_firebase.collection.return_value.document.return_value = mock_tx_ref
        
        mock_analytics_snap = MagicMock()
        mock_analytics_snap.exists = True
        mock_analytics_ref = MagicMock()
        mock_analytics_ref.get.return_value = mock_analytics_snap
        mock_firebase.collection.return_value.document.return_value = mock_analytics_ref
        
        response = client.post("/api/stripe/verify-session", json=valid_verify_payload)
        
        assert response.status_code == 200
        # Verify analytics update was called for partial payment
        mock_analytics_ref.update.assert_called()
    
    def test_verify_session_stripe_error(self, mock_env_vars, mock_stripe):
        """Test when Stripe API returns an error during session retrieval"""
        mock_stripe.checkout.Session.retrieve.side_effect = Exception("Stripe API error")
        
        response = client.post("/api/stripe/verify-session", json={"sessionId": "invalid", "transactionId": "tx_123"})
        
        assert response.status_code == 500
        assert "Could not retrieve Stripe session" in response.json()["detail"]
    
    def test_verify_session_firestore_error(self, mock_env_vars, mock_firebase, mock_stripe, valid_verify_payload):
        """Test when Firestore update fails"""
        mock_session = Mock()
        mock_session.payment_status = "paid"
        mock_session.amount_total = 15000
        mock_stripe.checkout.Session.retrieve.return_value = mock_session
        
        mock_tx_ref = MagicMock()
        mock_tx_snap = MagicMock()
        mock_tx_snap.exists = True
        mock_tx_snap.to_dict.return_value = {
            "paymentStatus": "pending",
            "paymentType": "full_online"
        }
        mock_tx_ref.get.return_value = mock_tx_snap
        mock_tx_ref.update.side_effect = Exception("Firestore write failed")
        mock_firebase.collection.return_value.document.return_value = mock_tx_ref
        
        response = client.post("/api/stripe/verify-session", json=valid_verify_payload)
        
        assert response.status_code == 500
        assert "Firestore update failed" in response.json()["detail"]

# ─── Webhook Tests ───────────────────────────────────────────────────────────

class TestWebhook:
    """Tests for the /webhook endpoint"""
    
    @pytest.fixture
    def valid_webhook_payload(self):
        """Valid webhook event payload"""
        return {
            "id": "evt_123456",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_test_abc123",
                    "metadata": {
                        "transactionId": "tx_123456",
                        "stripeRef": "stripe_ref_123"
                    },
                    "client_reference_id": "tx_123456"
                }
            }
        }
    
    def test_webhook_success(self, mock_env_vars, mock_firebase, mock_stripe, valid_webhook_payload):
        """Test successful webhook processing"""
        # Mock Stripe webhook verification
        mock_event = MagicMock()
        mock_event.type = "checkout.session.completed"
        mock_event.data.object = valid_webhook_payload["data"]["object"]
        mock_stripe.Webhook.construct_event.return_value = mock_event
        
        # Mock Firestore
        mock_tx_ref = MagicMock()
        mock_tx_snap = MagicMock()
        mock_tx_snap.exists = True
        mock_tx_snap.to_dict.return_value = {"paymentStatus": "pending"}
        mock_tx_ref.get.return_value = mock_tx_snap
        mock_firebase.collection.return_value.document.return_value = mock_tx_ref
        
        response = client.post(
            "/api/stripe/webhook",
            json=valid_webhook_payload,
            headers={"stripe-signature": "valid_signature"}
        )
        
        assert response.status_code == 200
        assert response.json() == {"received": True}
        
        # Verify transaction update
        mock_tx_ref.update.assert_called_once()
    
    def test_webhook_missing_secret(self, mock_env_vars):
        """Test webhook when STRIPE_WEBHOOK_SECRET is missing"""
        with patch.dict(os.environ, {"STRIPE_WEBHOOK_SECRET": ""}, clear=True):
            response = client.post("/api/stripe/webhook", json={})
            assert response.status_code == 500
            assert "STRIPE_WEBHOOK_SECRET is missing" in response.json()["detail"]
    
    def test_webhook_invalid_signature(self, mock_env_vars, mock_stripe):
        """Test webhook with invalid signature"""
        mock_stripe.Webhook.construct_event.side_effect = Exception("Invalid signature")
        
        response = client.post(
            "/api/stripe/webhook",
            json={},
            headers={"stripe-signature": "invalid"}
        )
        
        assert response.status_code == 400
        assert "Invalid webhook signature" in response.json()["detail"]
    
    def test_webhook_invalid_payload(self, mock_env_vars, mock_stripe):
        """Test webhook with invalid payload"""
        mock_stripe.Webhook.construct_event.side_effect = ValueError("Invalid payload")
        
        response = client.post(
            "/api/stripe/webhook",
            json={},
            headers={"stripe-signature": "some_signature"}
        )
        
        assert response.status_code == 400
        assert "Invalid webhook payload" in response.json()["detail"]
    
    def test_webhook_no_transaction_id(self, mock_env_vars, mock_firebase, mock_stripe):
        """Test webhook when no transactionId is provided"""
        payload = {
            "id": "evt_123456",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_test_abc123",
                    "metadata": {},
                    "client_reference_id": None
                }
            }
        }
        
        mock_event = MagicMock()
        mock_event.type = "checkout.session.completed"
        mock_event.data.object = payload["data"]["object"]
        mock_stripe.Webhook.construct_event.return_value = mock_event
        
        response = client.post(
            "/api/stripe/webhook",
            json=payload,
            headers={"stripe-signature": "valid_signature"}
        )
        
        assert response.status_code == 200
        assert response.json() == {"received": True}
        # No Firestore update should be attempted
        mock_firebase.collection.assert_not_called()
    
    def test_webhook_other_event_type(self, mock_env_vars, mock_firebase, mock_stripe):
        """Test webhook with non-checkout event type"""
        payload = {
            "id": "evt_123456",
            "type": "payment_intent.succeeded",
            "data": {"object": {}}
        }
        
        mock_event = MagicMock()
        mock_event.type = "payment_intent.succeeded"
        mock_stripe.Webhook.construct_event.return_value = mock_event
        
        response = client.post(
            "/api/stripe/webhook",
            json=payload,
            headers={"stripe-signature": "valid_signature"}
        )
        
        assert response.status_code == 200
        assert response.json() == {"received": True}
        # No Firestore update should be attempted
        mock_firebase.collection.assert_not_called()
    
    def test_webhook_transaction_already_updated(self, mock_env_vars, mock_firebase, mock_stripe, valid_webhook_payload):
        """Test webhook when transaction already has paymentStatus=paid"""
        mock_event = MagicMock()
        mock_event.type = "checkout.session.completed"
        mock_event.data.object = valid_webhook_payload["data"]["object"]
        mock_stripe.Webhook.construct_event.return_value = mock_event
        
        mock_tx_ref = MagicMock()
        mock_tx_snap = MagicMock()
        mock_tx_snap.exists = True
        mock_tx_snap.to_dict.return_value = {"paymentStatus": "paid"}
        mock_tx_ref.get.return_value = mock_tx_snap
        mock_firebase.collection.return_value.document.return_value = mock_tx_ref
        
        response = client.post(
            "/api/stripe/webhook",
            json=valid_webhook_payload,
            headers={"stripe-signature": "valid_signature"}
        )
        
        assert response.status_code == 200
        # Update should not be called again
        mock_tx_ref.update.assert_not_called()
    
    def test_webhook_firestore_error(self, mock_env_vars, mock_firebase, mock_stripe, valid_webhook_payload):
        """Test webhook when Firestore update fails"""
        mock_event = MagicMock()
        mock_event.type = "checkout.session.completed"
        mock_event.data.object = valid_webhook_payload["data"]["object"]
        mock_stripe.Webhook.construct_event.return_value = mock_event
        
        mock_tx_ref = MagicMock()
        mock_tx_snap = MagicMock()
        mock_tx_snap.exists = True
        mock_tx_snap.to_dict.return_value = {"paymentStatus": "pending"}
        mock_tx_ref.get.return_value = mock_tx_snap
        mock_tx_ref.update.side_effect = Exception("Firestore error")
        mock_firebase.collection.return_value.document.return_value = mock_tx_ref
        
        response = client.post(
            "/api/stripe/webhook",
            json=valid_webhook_payload,
            headers={"stripe-signature": "valid_signature"}
        )
        
        assert response.status_code == 500
        assert "Firestore update failed" in response.json()["detail"]

# ─── Helper Function Tests ───────────────────────────────────────────────────

class TestHelperFunctions:
    """Tests for helper functions"""
    
    def test_get_firestore_client_new_initialization(self, mock_env_vars):
        """Test Firestore client initialization when app not initialized"""
        with patch('firebase_admin._apps', {}), \
             patch('firebase_admin.credentials.Certificate') as mock_cert, \
             patch('firebase_admin.initialize_app') as mock_init, \
             patch('firebase_admin.firestore.client') as mock_client:
            
            mock_db = MagicMock()
            mock_client.return_value = mock_db
            
            db = get_firestore_client()
            
            assert db == mock_db
            mock_cert.assert_called_once()
            mock_init.assert_called_once()
    
    def test_get_firestore_client_already_initialized(self, mock_env_vars):
        """Test Firestore client when already initialized"""
        with patch('firebase_admin._apps', {'default': 'exists'}), \
             patch('firebase_admin.firestore.client') as mock_client:
            
            mock_db = MagicMock()
            mock_client.return_value = mock_db
            
            db = get_firestore_client()
            
            assert db == mock_db
            mock_client.assert_called_once()
    
    def test_get_firestore_client_missing_service_account(self):
        """Test Firestore client when service account JSON is missing"""
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(RuntimeError, match="FIREBASE_SERVICE_ACCOUNT_JSON env var is missing"):
                get_firestore_client()
    
    def test_get_stripe_success(self, mock_env_vars):
        """Test Stripe client retrieval"""
        with patch('stripe.api_key', None) as mock_key:
            stripe_client = get_stripe()
            assert stripe_client == stripe
    
    def test_get_stripe_missing_secret_key(self):
        """Test Stripe client when secret key is missing"""
        with patch.dict(os.environ, {"STRIPE_SECRET_KEY": ""}, clear=True):
            with pytest.raises(HTTPException) as exc_info:
                get_stripe()
            assert exc_info.value.status_code == 500
            assert "STRIPE_SECRET_KEY is missing" in exc_info.value.detail
    
    @pytest.mark.parametrize("input_value,expected", [
        (None, ""),
        ("normal text", "normal text"),
        ("a" * 600, "a" * 500),  # Truncated to 500 chars
        (12345, "12345"),
        ({"key": "value"}, "{'key': 'value'}"),
    ])
    def test_safe_metadata(self, input_value, expected):
        """Test safe_metadata function for various input types"""
        from stripe_payments import safe_metadata
        result = safe_metadata(input_value)
        assert result == expected
        if isinstance(input_value, str) and len(input_value) > 500:
            assert len(result) == 500

# ─── Integration Tests ────────────────────────────────────────────────────────

class TestIntegration:
    """Integration-style tests"""
    
    def test_full_payment_flow(self, mock_env_vars, mock_firebase, mock_stripe):
        """Test complete payment flow from checkout to verification"""
        # Step 1: Create checkout session
        checkout_payload = {
            "transactionId": "tx_integration_123",
            "buyerEmail": "buyer@example.com",
            "amount": 20000,
            "amountRand": 200.00,
            "cashAmount": 0,
            "totalAmount": 200.00,
            "currency": "zar",
            "stripeRef": "stripe_ref_456",
            "paymentType": "full_online",
            "listingId": "listing_456",
            "listingTitle": "Test Product",
            "successUrl": "https://example.com/success",
            "cancelUrl": "https://example.com/cancel",
            "metadata": {}
        }
        
        mock_session = Mock()
        mock_session.id = "cs_test_integration"
        mock_session.url = "https://checkout.stripe.com/test"
        mock_stripe.checkout.Session.create.return_value = mock_session
        
        create_response = client.post("/api/stripe/create-checkout-session", json=checkout_payload)
        assert create_response.status_code == 200
        assert create_response.json()["id"] == "cs_test_integration"
        
        # Step 2: Verify session (simulating successful payment)
        verify_payload = {
            "sessionId": "cs_test_integration",
            "transactionId": "tx_integration_123"
        }
        
        mock_verify_session = Mock()
        mock_verify_session.payment_status = "paid"
        mock_verify_session.amount_total = 20000
        mock_stripe.checkout.Session.retrieve.return_value = mock_verify_session
        
        mock_tx_ref = MagicMock()
        mock_tx_snap = MagicMock()
        mock_tx_snap.exists = True
        mock_tx_snap.to_dict.return_value = {
            "paymentStatus": "pending",
            "paymentType": "full_online"
        }
        mock_tx_ref.get.return_value = mock_tx_snap
        mock_firebase.collection.return_value.document.return_value = mock_tx_ref
        
        mock_analytics_snap = MagicMock()
        mock_analytics_snap.exists = True
        mock_analytics_ref = MagicMock()
        mock_analytics_ref.get.return_value = mock_analytics_snap
        mock_firebase.collection.return_value.document.return_value = mock_analytics_ref
        
        verify_response = client.post("/api/stripe/verify-session", json=verify_payload)
        assert verify_response.status_code == 200
        assert verify_response.json()["paid"] is True
    
    def test_partial_payment_flow(self, mock_env_vars, mock_firebase, mock_stripe):
        """Test partial payment flow"""
        # Partial payment: R80 online, R20 cash
        checkout_payload = {
            "transactionId": "tx_partial_123",
            "buyerEmail": "buyer@example.com",
            "amount": 8000,  # R80 online in cents
            "amountRand": 80.00,
            "cashAmount": 20.00,
            "totalAmount": 100.00,
            "currency": "zar",
            "stripeRef": "stripe_ref_partial",
            "paymentType": "partial",
            "listingId": "listing_partial",
            "listingTitle": "Partial Payment Item",
            "successUrl": "https://example.com/success",
            "cancelUrl": "https://example.com/cancel",
            "metadata": {}
        }
        
        mock_session = Mock()
        mock_session.id = "cs_test_partial"
        mock_session.url = "https://checkout.stripe.com/partial"
        mock_stripe.checkout.Session.create.return_value = mock_session
        
        create_response = client.post("/api/stripe/create-checkout-session", json=checkout_payload)
        assert create_response.status_code == 200
        
        # Verify the partial payment
        verify_payload = {
            "sessionId": "cs_test_partial",
            "transactionId": "tx_partial_123"
        }
        
        mock_verify_session = Mock()
        mock_verify_session.payment_status = "paid"
        mock_verify_session.amount_total = 8000
        mock_stripe.checkout.Session.retrieve.return_value = mock_verify_session
        
        mock_tx_ref = MagicMock()
        mock_tx_snap = MagicMock()
        mock_tx_snap.exists = True
        mock_tx_snap.to_dict.return_value = {
            "paymentStatus": "pending",
            "paymentType": "partial",
            "onlineAmount": 80.00
        }
        mock_tx_ref.get.return_value = mock_tx_snap
        mock_firebase.collection.return_value.document.return_value = mock_tx_ref
        
        mock_analytics_snap = MagicMock()
        mock_analytics_snap.exists = True
        mock_analytics_ref = MagicMock()
        mock_analytics_ref.get.return_value = mock_analytics_snap
        mock_firebase.collection.return_value.document.return_value = mock_analytics_ref
        
        verify_response = client.post("/api/stripe/verify-session", json=verify_payload)
        assert verify_response.status_code == 200
        assert verify_response.json()["paid"] is True
