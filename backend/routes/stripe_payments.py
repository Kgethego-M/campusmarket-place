import os
import stripe
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from firebase_admin import firestore, initialize_app
import json

router = APIRouter(prefix="/api/stripe", tags=["stripe"])
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

# Initialize Firebase Admin SDK
try:
    firebase_app = initialize_app()
except ValueError:
    # App already initialized
    pass

db = firestore.client()

def get_stripe():
    if not stripe.api_key:
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

# NEW - Add this class
class VerifySessionRequest(BaseModel):
    sessionId: str
    transactionId: str

@router.post("/create-checkout-session")
async def create_checkout_session(payload: CheckoutSessionRequest):
    stripe_client = get_stripe()
    try:
        # Build line item description based on payment type
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

# NEW - Add this endpoint
@router.post("/verify-session")
async def verify_checkout_session(payload: VerifySessionRequest):
    stripe_client = get_stripe()
    try:
        print(f"🔍 Verifying session: {payload.sessionId} for transaction: {payload.transactionId}")
        
        # 1. Retrieve the session from Stripe
        session = stripe_client.checkout.Session.retrieve(payload.sessionId)
        
        print(f"💰 Payment status: {session.payment_status}")
        
        if session.payment_status != 'paid':
            return {"paid": False, "status": session.payment_status}
        
        # 2. Update the transaction in Firestore
        tx_ref = db.collection('transactions').document(payload.transactionId)
        tx_snapshot = tx_ref.get()
        
        if not tx_snapshot.exists:
            print(f"❌ Transaction {payload.transactionId} not found in Firestore")
            return {"paid": True, "status": "paid", "warning": "Transaction not found in database"}
        
        tx_data = tx_snapshot.to_dict()
        
        # 3. Only update if not already updated
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
    return {"stripe_configured": bool(stripe.api_key)}