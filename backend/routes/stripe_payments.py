import os
import stripe
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from firebase_admin import firestore, initialize_app, credentials
import json

router = APIRouter(prefix="/api/stripe", tags=["stripe"])
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

# Lazy initialization - only initialize Firebase if credentials are available
db = None

def get_firestore():
    global db
    if db is not None:
        return db
    
    # Check if we're in a test/CI environment
    if os.getenv("CI") or os.getenv("GITHUB_ACTIONS") or not os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON"):
        print("⚠️ Firebase credentials not available - running in test mode")
        return None
    
    try:
        # Try to initialize Firebase with service account
        firebase_creds = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
        if firebase_creds:
            cred = credentials.Certificate(json.loads(firebase_creds))
            firebase_app = initialize_app(cred)
        else:
            # Try default credentials (for production environments like Azure)
            firebase_app = initialize_app()
        
        db = firestore.client()
        print("✅ Firebase initialized successfully")
        return db
    except Exception as e:
        print(f"⚠️ Failed to initialize Firebase: {e}")
        return None

def get_stripe():
    if not stripe.api_key:
        # In CI/test, allow Stripe to be missing
        if os.getenv("CI") or os.getenv("GITHUB_ACTIONS"):
            return None
        raise HTTPException(500, "STRIPE_SECRET_KEY is missing")
    return stripe

class CheckoutSessionRequest(BaseModel):
    transactionId: str
    buyerEmail: str
    amount: int
    amountRand: float
    cashAmount: float = 0
    totalAmount: float
    currency: str = "zar"
    stripeRef: str
    paymentType: str
    listingId: str = None
    listingTitle: str = "Marketplace transaction"
    successUrl: str
    cancelUrl: str
    metadata: dict = {}

class VerifySessionRequest(BaseModel):
    sessionId: str
    transactionId: str

@router.post("/create-checkout-session")
async def create_checkout_session(payload: CheckoutSessionRequest):
    stripe_client = get_stripe()
    if stripe_client is None:
        raise HTTPException(503, "Stripe is not configured")
    
    try:
        if payload.paymentType == "ad_promotion":
            product_name = f"[AD PROMOTION] {payload.listingTitle}"
        else:
            product_name = payload.listingTitle
        
        session = stripe_client.checkout.Session.create(
            mode="payment",
            customer_email=payload.buyerEmail,
            client_reference_id=payload.transactionId,
            success_url=payload.successUrl + "?session_id={CHECKOUT_SESSION_ID}",
            cancel_url=payload.cancelUrl,
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": payload.currency.lower(),
                    "unit_amount": payload.amount,
                    "product_data": {"name": product_name},
                },
                "quantity": 1,
            }],
            metadata={
                "transactionId": payload.transactionId,
                "stripeRef": payload.stripeRef,
                "paymentType": payload.paymentType,
                "listingId": payload.listingId or "",
                "adType": payload.metadata.get("adType", ""),
                **payload.metadata,
            },
        )
        return {"id": session.id, "url": session.url}
    except Exception as e:
        raise HTTPException(500, str(e))

@router.post("/verify-session")
async def verify_checkout_session(payload: VerifySessionRequest):
    stripe_client = get_stripe()
    if stripe_client is None:
        raise HTTPException(503, "Stripe is not configured")
    
    try:
        print(f"🔍 Verifying session: {payload.sessionId} for transaction: {payload.transactionId}")
        
        # 1. Retrieve the session from Stripe
        session = stripe_client.checkout.Session.retrieve(payload.sessionId)
        
        print(f"💰 Payment status: {session.payment_status}")
        
        if session.payment_status != 'paid':
            return {"paid": False, "status": session.payment_status}
        
        # 2. Get Firestore - skip if not available (test environment)
        fs = get_firestore()
        if fs is None:
            print("⚠️ Firestore not available - skipping database update")
            return {"paid": True, "status": "paid", "warning": "Firestore not configured"}
        
        # 3. Update the transaction in Firestore
        tx_ref = fs.collection('transactions').document(payload.transactionId)
        tx_snapshot = tx_ref.get()
        
        if not tx_snapshot.exists:
            print(f"❌ Transaction {payload.transactionId} not found in Firestore")
            return {"paid": True, "status": "paid", "warning": "Transaction not found in database"}
        
        tx_data = tx_snapshot.to_dict()
        
        # 4. Only update if not already updated
        if tx_data.get('paymentStatus') != 'paid' and tx_data.get('status') != 'waiting':
            update_data = {
                'status': 'waiting',
                'paymentStatus': 'paid',
                'paymentProvider': 'stripe',
                'stripeSessionId': payload.sessionId,
                'paymentVerifiedAt': firestore.SERVER_TIMESTAMP,
                'updatedAt': firestore.SERVER_TIMESTAMP,
            }
            tx_ref.update(update_data)
            print(f"✅ Transaction {payload.transactionId} updated to waiting")
        else:
            print(f"ℹ️ Transaction already updated - status: {tx_data.get('status')}, paymentStatus: {tx_data.get('paymentStatus')}")
        
        return {"paid": True, "status": "paid", "transactionId": payload.transactionId}
        
    except Exception as e:
        print(f"❌ Verify session error: {e}")
        raise HTTPException(500, str(e))

@router.get("/health")
def health():
    return {
        "stripe_configured": bool(stripe.api_key),
        "firebase_configured": get_firestore() is not None
    }