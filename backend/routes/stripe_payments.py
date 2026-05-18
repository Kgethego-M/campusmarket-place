import os
import json
import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from firebase_admin import firestore, credentials
import firebase_admin

router = APIRouter(prefix="/api/stripe", tags=["stripe"])

# ─── Firebase Admin (singleton) ───────────────────────────────────────────────

def get_firestore():
    if not firebase_admin._apps:
        service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
        if not service_account_json:
            print("⚠️ Firebase credentials not available - running in test mode")
            return None
        try:
            cred = credentials.Certificate(json.loads(service_account_json))
            firebase_admin.initialize_app(cred)
            print("✅ Firebase initialized successfully")
        except Exception as e:
            print(f"⚠️ Failed to initialize Firebase: {e}")
            return None
    try:
        client = firestore.client()
        print("✅ Firestore client obtained")
        return client
    except Exception as e:
        print(f"⚠️ Failed to get Firestore client: {e}")
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


# ─── Request models ───────────────────────────────────────────────────────────

class CheckoutSessionRequest(BaseModel):
    transactionId: str
    buyerEmail:    str
    amount:        int
    amountRand:    float
    cashAmount:    float = 0
    totalAmount:   float
    currency:      str = "zar"
    stripeRef:     str
    paymentType:   str
    listingId:     str | None = None
    listingTitle:  str = "Marketplace transaction"
    successUrl:    str
    cancelUrl:     str
    metadata:      dict = {}


class VerifySessionRequest(BaseModel):
    sessionId:     str
    transactionId: str = ""


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/health")
def health():
    return {
        "stripe_configured":   bool(os.getenv("STRIPE_SECRET_KEY")),
        "firebase_configured": get_firestore() is not None,
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
        "stripeRef":     safe_meta(payload.stripeRef),
        "paymentType":   safe_meta(payload.paymentType),
        "listingId":     safe_meta(payload.listingId),
        "amountRand":    safe_meta(payload.amountRand),
        "cashAmount":    safe_meta(payload.cashAmount),
        "totalAmount":   safe_meta(payload.totalAmount),
    }
    for key, value in payload.metadata.items():
        metadata[key] = safe_meta(value)

    # ✅ Use & if successUrl already contains ? to avoid double-question-mark bug.
    # The frontend sends successUrl as:  /payment-success?tx=TX_ID
    # Without this the redirect becomes: /payment-success?tx=TX_ID?session_id=...
    # which breaks URL parsing and makes txId null in the frontend.
    separator   = "&" if "?" in payload.successUrl else "?"
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

    try:
        session = stripe_client.checkout.Session.retrieve(payload.sessionId)
    except Exception as e:
        raise HTTPException(500, f"Could not retrieve Stripe session: {str(e)}")

    print(f"🔍 verify-session: session={payload.sessionId}, payment_status={session.payment_status}")

    if session.payment_status != "paid":
        return {"paid": False, "status": session.payment_status}

    # ── Resolve transactionId ─────────────────────────────────────────────────
    # ✅ Use attribute access (session.metadata, session.client_reference_id)
    # NOT session.get() — Stripe objects are not dicts and don't support .get()
    transaction_id = payload.transactionId.strip() if payload.transactionId else ""
    if not transaction_id:
        meta = session.metadata or {}
        transaction_id = meta.get("transactionId") or session.client_reference_id or ""

    if not transaction_id:
        raise HTTPException(400, "Cannot resolve transactionId from session or payload.")

    # ── Firestore not available (test/CI environment) ─────────────────────────
    fs = get_firestore()
    if fs is None:
        print("⚠️ Firestore not available — skipping DB update")
        return {"paid": True, "status": "paid", "warning": "Firestore not configured"}

    try:
        ref     = fs.collection("transactions").document(transaction_id)
        tx_snap = ref.get()

        # ── Transaction not found — return warning instead of 404 ─────────────
        if not tx_snap.exists:
            print(f"❌ Transaction {transaction_id} not found in Firestore")
            return {
                "paid":    True,
                "status":  "paid",
                "warning": f"Transaction '{transaction_id}' not found in database",
            }

        tx_data = tx_snap.to_dict()

        # ── Idempotency — already updated ─────────────────────────────────────
        if tx_data.get("paymentStatus") == "paid":
            print(f"ℹ️ tx={transaction_id} already paid — skipping")
            return {"paid": True, "alreadyUpdated": True}

        # ── Resolve amount paid ───────────────────────────────────────────────
        # ✅ Use attribute access, not session.get("amount_total")
        amount_paid  = (session.amount_total or 0) / 100
        payment_type = tx_data.get("paymentType", "full_online")

        # ── Analytics increment (non-fatal) ───────────────────────────────────
        try:
            analytics_ref  = fs.collection("analytics").document("platform")
            analytics_snap = analytics_ref.get()

            if not analytics_snap.exists:
                analytics_ref.set({
                    "totalRevenue":         0,
                    "onlineRevenue":        0,
                    "pendingCashRevenue":   0,
                    "collectedCashRevenue": 0,
                    "totalPayouts":         0,
                    "totalRefunds":         0,
                    "availableBalance":     0,
                    "createdAt":            firestore.SERVER_TIMESTAMP,
                    "lastUpdated":          firestore.SERVER_TIMESTAMP,
                })

            if payment_type == "partial":
                online_amount = float(tx_data.get("onlineAmount") or amount_paid)
                analytics_ref.update({
                    "totalRevenue":  firestore.Increment(online_amount),
                    "onlineRevenue": firestore.Increment(online_amount),
                    "lastUpdated":   firestore.SERVER_TIMESTAMP,
                })
            else:
                analytics_ref.update({
                    "totalRevenue":  firestore.Increment(amount_paid),
                    "onlineRevenue": firestore.Increment(amount_paid),
                    "lastUpdated":   firestore.SERVER_TIMESTAMP,
                })

            print(f"📊 Analytics updated: +R{amount_paid} for tx={transaction_id}")

        except Exception as analytics_err:
            # Analytics failure must NEVER block the transaction update
            print(f"⚠️ Analytics update failed (non-fatal): {analytics_err}")

        # ── Update transaction — this is the critical step ────────────────────
        ref.update({
            "status":                  "waiting",
            "paymentStatus":           "paid",
            "paymentProvider":         "stripe",
            "paymentSettled":          True,
            "stripeRef":               session.id,
            "stripeCheckoutSessionId": session.id,
            "stripeSessionId":         session.id,
            "revenueRecorded":         True,
            "revenueAmount":           amount_paid,
            "revenueRecordedAt":       firestore.SERVER_TIMESTAMP,
            "updatedAt":               firestore.SERVER_TIMESTAMP,
        })

        print(f"✅ tx={transaction_id} → status=waiting, paymentStatus=paid")
        return {"paid": True, "alreadyUpdated": False, "transactionId": transaction_id}

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ verify-session Firestore error: {e}")
        raise HTTPException(500, f"Firestore update failed: {str(e)}")


# ─── Webhook (redundancy fallback) ────────────────────────────────────────────

@router.post("/webhook")
async def stripe_webhook(request: Request):
    stripe_client  = get_stripe()
    payload        = await request.body()
    signature      = request.headers.get("stripe-signature")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")

    if not webhook_secret:
        raise HTTPException(500, "STRIPE_WEBHOOK_SECRET is missing.")

    try:
        event = stripe_client.Webhook.construct_event(payload, signature, webhook_secret)
    except ValueError:
        raise HTTPException(400, "Invalid webhook payload.")
    except Exception:
        raise HTTPException(400, "Invalid webhook signature.")

    if event["type"] == "checkout.session.completed":
        session        = event["data"]["object"]
        session_id     = session.get("id", "")
        meta           = session.get("metadata") or {}
        transaction_id = meta.get("transactionId") or session.get("client_reference_id", "")

        print(f"[Webhook] checkout.session.completed — session={session_id}, tx={transaction_id}")

        if not transaction_id:
            print("[Webhook] No transactionId found — skipping")
            return {"received": True}

        fs = get_firestore()
        if fs is None:
            return {"received": True}

        try:
            ref     = fs.collection("transactions").document(transaction_id)
            tx_snap = ref.get()

            if tx_snap.exists and tx_snap.to_dict().get("paymentStatus") == "paid":
                print(f"[Webhook] tx={transaction_id} already paid — skipping")
                return {"received": True}

            ref.update({
                "status":                  "waiting",
                "paymentStatus":           "paid",
                "paymentProvider":         "stripe",
                "paymentSettled":          True,
                "stripeRef":               meta.get("stripeRef", session_id),
                "stripeCheckoutSessionId": session_id,
                "updatedAt":               firestore.SERVER_TIMESTAMP,
            })
            print(f"[Webhook] tx={transaction_id} → waiting/paid")

        except Exception as e:
            print(f"[Webhook] ERROR for tx={transaction_id}: {e}")
            raise HTTPException(500, f"Firestore update failed: {str(e)}")

    return {"received": True}