import os
import json
import stripe
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False
    print("Firebase Admin not installed. Run: pip install firebase-admin")

router = APIRouter(prefix="/api/stripe", tags=["stripe"])
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

def get_firestore_client():
    if not FIREBASE_AVAILABLE:
        return None
    if not firebase_admin._apps:
        service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
        if not service_account_json:
            print("WARNING: FIREBASE_SERVICE_ACCOUNT_JSON missing. Ads will not be saved.")
            return None
        try:
            service_account_info = json.loads(service_account_json)
            cred = credentials.Certificate(service_account_info)
            firebase_admin.initialize_app(cred)
        except Exception as e:
            print(f"Firebase init error: {e}")
            return None
    return firestore.client()

db = get_firestore_client()

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
    transactionId: str = ""

@router.post("/create-checkout-session")
async def create_checkout_session(payload: CheckoutSessionRequest):
    if not stripe.api_key:
        raise HTTPException(500, "STRIPE_SECRET_KEY not configured")
    try:
        session = stripe.checkout.Session.create(
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
                    "product_data": {"name": payload.listingTitle},
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
async def verify_session(payload: VerifySessionRequest):
<<<<<<< Updated upstream
    """Called by the frontend on the payment-success page."""
    stripe_client = get_stripe()

=======
    if not stripe.api_key:
        raise HTTPException(500, "STRIPE_SECRET_KEY not configured")
>>>>>>> Stashed changes
    try:
        session = stripe.checkout.Session.retrieve(payload.sessionId)
    except Exception as e:
        raise HTTPException(500, f"Could not retrieve session: {str(e)}")

    if session.payment_status != "paid":
        return {"paid": False, "status": session.payment_status}

<<<<<<< Updated upstream
    # Resolve transactionId
    transaction_id = payload.transactionId.strip() if payload.transactionId else ""
    if not transaction_id:
        meta = session.get("metadata") or {}
        transaction_id = meta.get("transactionId") or session.get("client_reference_id") or ""

    if not transaction_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot resolve transactionId",
        )

    try:
        db = get_firestore_client()
        ref = db.collection("transactions").document(transaction_id)
        tx_snap = ref.get()

        if not tx_snap.exists:
            raise HTTPException(status_code=404, detail=f"Transaction '{transaction_id}' not found.")

        tx_data = tx_snap.to_dict()

        # Already updated — idempotent return
        if tx_data.get("paymentStatus") == "paid":
            return {"paid": True, "alreadyUpdated": True}

        # Get the amount paid (convert from cents to Rand)
        amount_paid = session.get("amount_total", 0) / 100
        payment_type = tx_data.get("paymentType", "full_online")

        # ─── NEW: Update analytics revenue ─────────────────────────────────
        analytics_ref = db.collection("analytics").document("platform")
        
        # Check if analytics document exists, create if not
        analytics_snap = analytics_ref.get()
        if not analytics_snap.exists:
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
        
        # Increment revenue based on payment type
        if payment_type == "full_online":
            analytics_ref.update({
                "totalRevenue": firestore.Increment(amount_paid),
                "onlineRevenue": firestore.Increment(amount_paid),
                "lastUpdated": firestore.SERVER_TIMESTAMP,
            })
            print(f"[Revenue] Full online payment: +R{amount_paid} for tx {transaction_id}")
        
        elif payment_type == "partial":
            # Only the online portion increments now; cash portion later
            online_amount = tx_data.get("onlineAmount", amount_paid)
            analytics_ref.update({
                "totalRevenue": firestore.Increment(online_amount),
                "onlineRevenue": firestore.Increment(online_amount),
                "lastUpdated": firestore.SERVER_TIMESTAMP,
            })
            print(f"[Revenue] Partial payment: +R{online_amount} online for tx {transaction_id}")
        
        # Update transaction
        ref.update({
            "status": "waiting",
            "paymentStatus": "paid",
            "paymentProvider": "stripe",
            "paymentSettled": True,
            "stripeRef": session.id,
            "stripeCheckoutSessionId": session.id,
            "revenueRecorded": True,
            "revenueAmount": amount_paid,
            "revenueRecordedAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        })

        return {"paid": True, "alreadyUpdated": False}

    except HTTPException:
        raise
    except Exception as exc:
        print(f"[verify-session] ERROR: {exc}")
        raise HTTPException(status_code=500, detail=f"Firestore update failed: {str(exc)}")


# ─── Webhook (kept for redundancy — harmless duplicate write if fired) ────────

@router.post("/webhook")
async def stripe_webhook(request: Request):
    stripe_client = get_stripe()

    payload        = await request.body()
    signature      = request.headers.get("stripe-signature")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")

    if not webhook_secret:
        raise HTTPException(status_code=500, detail="STRIPE_WEBHOOK_SECRET is missing.")

    try:
        event = stripe_client.Webhook.construct_event(payload, signature, webhook_secret)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook payload.") from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook signature.") from exc

    # ── Payment confirmed ──────────────────────────────────────────────────────
    if event["type"] == "checkout.session.completed":
        session        = event["data"]["object"]
        session_id     = session.get("id", "")
        meta           = session.get("metadata") or {}
        transaction_id = meta.get("transactionId") or session.get("client_reference_id", "")

        print(f"[Webhook] checkout.session.completed — session={session_id}, txId={transaction_id}")

        if not transaction_id:
            print("[Webhook] WARNING: No transactionId in metadata or client_reference_id. Skipping Firestore update.")
            return {"received": True}
=======
    meta = session.get("metadata") or {}
    listing_id = meta.get("listingId") or ""
    ad_type = meta.get("adType") or meta.get("type")
>>>>>>> Stashed changes

    if db and listing_id and ad_type:
        try:
            listing_ref = db.collection("listings").document(listing_id)
            listing_snap = listing_ref.get()
            if listing_snap.exists:
                listing_data = listing_snap.to_dict()
                promotion_data = {
                    "listingId": listing_id,
                    "title": listing_data.get("title", "Listing"),
                    "imageUrl": (listing_data.get("photos") or [None])[0] or listing_data.get("imageUrl"),
                    "price": listing_data.get("price"),
                    "type": ad_type,
                    "status": "active",
                    "createdAt": firestore.SERVER_TIMESTAMP if FIREBASE_AVAILABLE else datetime.utcnow(),
                    "expiresAt": datetime.utcnow() + timedelta(days=7),
                    "stripeSessionId": session.id,
                }
                ad_ref = db.collection("ads").document(session.id)
                ad_ref.set(promotion_data)
                print(f"✅ Ad created for {listing_id} ({ad_type})")
            else:
                print(f"Listing {listing_id} not found")
        except Exception as e:
            print(f"Firestore error: {e}")

    return {"paid": True, "alreadyUpdated": False}

@router.get("/health")
def health():
    return {"stripe_configured": bool(stripe.api_key), "firebase_available": db is not None}
