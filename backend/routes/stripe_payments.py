import os
import json
import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from firebase_admin import firestore, credentials, initialize_app
import firebase_admin

router = APIRouter(prefix="/api/stripe", tags=["stripe"])

# ─── Firebase Admin (singleton) ───────────────────────────────────────────────

_firestore_client = None

def get_firestore():
    global _firestore_client
    
    if _firestore_client is not None:
        return _firestore_client
    
    try:
        service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
        if not service_account_json:
            print("⚠️ Firebase credentials not available")
            return None
        
        cred_dict = json.loads(service_account_json)
        cred = credentials.Certificate(cred_dict)
        
        if not firebase_admin._apps:
            initialize_app(cred)
            print("✅ Firebase initialized")
        
        _firestore_client = firestore.client()
        print("✅ Firestore client obtained")
        return _firestore_client
        
    except Exception as e:
        print(f"❌ Firebase init error: {e}")
        return None


def get_stripe():
    key = os.getenv("STRIPE_SECRET_KEY")
    if not key:
        raise HTTPException(500, "STRIPE_SECRET_KEY is missing")
    stripe.api_key = key
    return stripe


def safe_meta(value):
    if value is None:
        return ""
    return str(value)[:500]


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
    listingId: str | None = None
    listingTitle: str = "Marketplace transaction"
    successUrl: str
    cancelUrl: str
    metadata: dict = {}


class VerifySessionRequest(BaseModel):
    sessionId: str
    transactionId: str = ""


@router.get("/health")
def health():
    fs = get_firestore()
    return {
        "stripe_configured": bool(os.getenv("STRIPE_SECRET_KEY")),
        "firebase_configured": fs is not None,
    }


@router.post("/create-checkout-session")
async def create_checkout_session(payload: CheckoutSessionRequest):
    stripe_client = get_stripe()

    if payload.paymentType == "ad_promotion":
        product_name = f"[AD PROMOTION] {payload.listingTitle}"
    else:
        product_name = payload.listingTitle or "Marketplace transaction"

    metadata = {
        "transactionId": safe_meta(payload.transactionId),
        "stripeRef": safe_meta(payload.stripeRef),
        "paymentType": safe_meta(payload.paymentType),
        "listingId": safe_meta(payload.listingId),
        "amountRand": safe_meta(payload.amountRand),
        "cashAmount": safe_meta(payload.cashAmount),
        "totalAmount": safe_meta(payload.totalAmount),
    }
    for key, value in payload.metadata.items():
        metadata[key] = safe_meta(value)

    separator = "&" if "?" in payload.successUrl else "?"
    success_url = payload.successUrl + f"{separator}session_id={{CHECKOUT_SESSION_ID}}"

    try:
        session = stripe_client.checkout.Session.create(
            mode="payment",
            customer_email=payload.buyerEmail,
            client_reference_id=payload.transactionId,
            success_url=success_url,
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
            metadata=metadata,
        )
        return {"id": session.id, "url": session.url}
    except Exception as e:
        raise HTTPException(500, f"Failed to create Stripe session: {str(e)}")


@router.post("/verify-session")
async def verify_session(payload: VerifySessionRequest):
    stripe_client = get_stripe()
    
    # Get the session from Stripe
    try:
        session = stripe_client.checkout.Session.retrieve(payload.sessionId)
    except Exception as e:
        print(f"❌ Stripe retrieve error: {e}")
        raise HTTPException(500, f"Could not retrieve Stripe session: {str(e)}")

    print(f"🔍 Session: {payload.sessionId}, payment_status={session.payment_status}")

    if session.payment_status != "paid":
        return {"paid": False, "status": session.payment_status}

    # Resolve transactionId
    transaction_id = payload.transactionId.strip() if payload.transactionId else ""
    if not transaction_id:
        meta = session.get("metadata") or {}
        transaction_id = meta.get("transactionId") or session.get("client_reference_id") or ""

    if not transaction_id:
        raise HTTPException(400, "Cannot resolve transactionId")

    # Get Firestore
    fs = get_firestore()
    if fs is None:
        print("⚠️ Firestore not available")
        return {"paid": True, "status": "paid", "warning": "Firestore not configured"}

    try:
        # Get transaction
        tx_ref = fs.collection("transactions").document(transaction_id)
        tx_snap = tx_ref.get()
        
        if not tx_snap.exists:
            print(f"❌ Transaction {transaction_id} not found")
            return {"paid": True, "status": "paid", "warning": f"Transaction not found"}

        tx_data = tx_snap.to_dict()
        
        if tx_data.get("paymentStatus") == "paid":
            print(f"ℹ️ Transaction {transaction_id} already paid")
            return {"paid": True, "alreadyUpdated": True}

        amount_paid = (session.get("amount_total") or 0) / 100
        
        # Update analytics - SAFE VERSION without Increment
        analytics_ref = fs.collection("analytics").document("platform")
        analytics_snap = analytics_ref.get()
        
        current_total = 0
        current_online = 0
        
        if analytics_snap.exists:
            analytics_data = analytics_snap.to_dict()
            current_total = analytics_data.get("totalRevenue", 0)
            current_online = analytics_data.get("onlineRevenue", 0)
        else:
            # Create the document if it doesn't exist
            analytics_ref.set({
                "totalRevenue": 0,
                "onlineRevenue": 0,
                "pendingCashRevenue": 0,
                "collectedCashRevenue": 0,
                "totalPayouts": 0,
                "totalRefunds": 0,
                "availableBalance": 0,
                "createdAt": firestore.SERVER_TIMESTAMP,
                "lastUpdated": firestore.SERVER_TIMESTAMP,
            })
        
        # Update with new values
        analytics_ref.update({
            "totalRevenue": current_total + amount_paid,
            "onlineRevenue": current_online + amount_paid,
            "lastUpdated": firestore.SERVER_TIMESTAMP,
        })
        
        # Update transaction to "waiting"
        tx_ref.update({
            "status": "waiting",
            "paymentStatus": "paid",
            "paymentProvider": "stripe",
            "paymentSettled": True,
            "stripeRef": session.id,
            "stripeCheckoutSessionId": session.id,
            "stripeSessionId": session.id,
            "revenueRecorded": True,
            "revenueAmount": amount_paid,
            "revenueRecordedAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        })

        print(f"✅ Transaction {transaction_id} updated to waiting")
        return {"paid": True, "alreadyUpdated": False, "transactionId": transaction_id}

    except Exception as e:
        print(f"❌ Firestore error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Firestore update failed: {str(e)}")


@router.post("/webhook")
async def stripe_webhook(request: Request):
    stripe_client = get_stripe()
    payload = await request.body()
    signature = request.headers.get("stripe-signature")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")

    if not webhook_secret:
        return {"received": True}

    try:
        event = stripe_client.Webhook.construct_event(payload, signature, webhook_secret)
    except Exception:
        return {"received": True}

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        session_id = session.get("id", "")
        meta = session.get("metadata") or {}
        transaction_id = meta.get("transactionId") or session.get("client_reference_id", "")

        if transaction_id:
            fs = get_firestore()
            if fs:
                try:
                    tx_ref = fs.collection("transactions").document(transaction_id)
                    tx_snap = tx_ref.get()
                    
                    if tx_snap.exists and tx_snap.to_dict().get("paymentStatus") != "paid":
                        amount_paid = (session.get("amount_total") or 0) / 100
                        tx_ref.update({
                            "status": "waiting",
                            "paymentStatus": "paid",
                            "paymentProvider": "stripe",
                            "updatedAt": firestore.SERVER_TIMESTAMP,
                        })
                        print(f"[Webhook] Updated {transaction_id} to waiting")
                except Exception as e:
                    print(f"[Webhook] Error: {e}")

    return {"received": True}