import json
import os

import stripe
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

load_dotenv()

router = APIRouter(prefix="/api/stripe", tags=["stripe"])


# ─── Firebase Admin (singleton) ───────────────────────────────────────────────

def get_firestore_client():
    """Return a Firestore client, initialising Firebase Admin once."""
    if not firebase_admin._apps:
        service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
        if not service_account_json:
            raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON env var is missing.")
        service_account_info = json.loads(service_account_json)
        cred = credentials.Certificate(service_account_info)
        firebase_admin.initialize_app(cred)
    return firestore.client()


# ─── Request models ───────────────────────────────────────────────────────────

class CheckoutSessionRequest(BaseModel):
    transactionId: str = Field(..., min_length=1)
    buyerEmail: str = Field(..., min_length=3)
    amount: int = Field(..., gt=0)
    amountRand: float = Field(..., gt=0)
    cashAmount: float = Field(default=0, ge=0)
    totalAmount: float = Field(..., gt=0)
    currency: str = Field(default="zar", min_length=3, max_length=3)
    stripeRef: str = Field(..., min_length=1)
    paymentType: str = Field(..., min_length=1)
    listingId: str | None = None
    listingTitle: str = Field(default="Marketplace transaction")
    successUrl: str = Field(..., min_length=1)
    cancelUrl: str = Field(..., min_length=1)
    metadata: dict = Field(default_factory=dict)


class VerifySessionRequest(BaseModel):
    sessionId: str = Field(..., min_length=1)
    transactionId: str = Field(default="")  # Optional — recovered from session metadata if missing


# ─── Helpers ──────────────────────────────────────────────────────────────────

def get_stripe():
    secret_key = os.getenv("STRIPE_SECRET_KEY")
    if not secret_key:
        raise HTTPException(
            status_code=500,
            detail="STRIPE_SECRET_KEY is missing. Check your root .env file.",
        )
    stripe.api_key = secret_key
    return stripe


def safe_metadata(value):
    if value is None:
        return ""
    return str(value)[:500]


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/health")
def stripe_health():
    return {
        "message": "Stripe route is running",
        "stripeConfigured": bool(os.getenv("STRIPE_SECRET_KEY")),
        "webhookConfigured": bool(os.getenv("STRIPE_WEBHOOK_SECRET")),
    }


@router.post("/create-checkout-session")
async def create_checkout_session(payload: CheckoutSessionRequest):
    stripe_client = get_stripe()

    metadata = {
        "transactionId": safe_metadata(payload.transactionId),
        "stripeRef":     safe_metadata(payload.stripeRef),
        "paymentType":   safe_metadata(payload.paymentType),
        "listingId":     safe_metadata(payload.listingId),
        "amountRand":    safe_metadata(payload.amountRand),
        "cashAmount":    safe_metadata(payload.cashAmount),
        "totalAmount":   safe_metadata(payload.totalAmount),
    }
    for key, value in payload.metadata.items():
        metadata[key] = safe_metadata(value)

    success_separator = "&" if "?" in payload.successUrl else "?"

    try:
        session = stripe_client.checkout.Session.create(
            mode="payment",
            customer_email=payload.buyerEmail,
            client_reference_id=payload.transactionId,
            success_url=payload.successUrl + f"{success_separator}session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=payload.cancelUrl,
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": payload.currency.lower(),
                        "unit_amount": payload.amount,
                        "product_data": {
                            "name": payload.listingTitle or "Marketplace transaction",
                        },
                    },
                    "quantity": 1,
                }
            ],
            metadata=metadata,
        )
        return {"id": session.id, "url": session.url}

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create Stripe Checkout session: {str(exc)}",
        ) from exc


# ─── Verify Session ───────────────────────────────────────────────────────────

@router.post("/verify-session")
async def verify_session(payload: VerifySessionRequest):
    """
    Called by the frontend on the payment-success page.
    Retrieves the Stripe session directly and updates Firestore if paid.
    transactionId is recovered from session metadata if not supplied by the frontend.
    """
    stripe_client = get_stripe()

    # ── Retrieve session from Stripe ──────────────────────────────────────────
    try:
        session = stripe_client.checkout.Session.retrieve(payload.sessionId)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not retrieve Stripe session: {str(exc)}",
        ) from exc

    # ── Not paid yet ──────────────────────────────────────────────────────────
    if session.payment_status != "paid":
        print(f"[verify-session] Session {payload.sessionId} not paid — status: {session.payment_status}")
        return {"paid": False, "status": session.payment_status}

    # ── Resolve transactionId — payload first, then session metadata/client_reference_id ──
    transaction_id = payload.transactionId.strip() if payload.transactionId else ""

    if not transaction_id:
        meta = session.get("metadata") or {}
        transaction_id = (
            meta.get("transactionId")
            or session.get("client_reference_id")
            or ""
        )
        print(f"[verify-session] transactionId missing from payload — resolved from session: '{transaction_id}'")

    if not transaction_id:
        print(f"[verify-session] ERROR: Could not resolve transactionId for session {payload.sessionId}")
        raise HTTPException(
            status_code=400,
            detail="Cannot resolve transactionId — not in payload or session metadata.",
        )

    # ── Update Firestore ──────────────────────────────────────────────────────
    try:
        db  = get_firestore_client()
        ref = db.collection("transactions").document(transaction_id)

        tx_snap = ref.get()

        if not tx_snap.exists:
            print(f"[verify-session] ERROR: transactions/{transaction_id} does not exist in Firestore")
            raise HTTPException(
                status_code=404,
                detail=f"Transaction '{transaction_id}' not found in Firestore.",
            )

        tx_data = tx_snap.to_dict()
        print(
            f"[verify-session] Found tx={transaction_id} | "
            f"status={tx_data.get('status')} | "
            f"paymentStatus={tx_data.get('paymentStatus')}"
        )

        # Already updated — idempotent return
        if tx_data.get("paymentStatus") == "paid":
            print(f"[verify-session] tx={transaction_id} already marked paid — skipping update")
            return {"paid": True, "alreadyUpdated": True}

        ref.update({
            "status":                  "waiting",
            "paymentStatus":           "paid",
            "paymentProvider":         "stripe",
            "paymentSettled":          True,
            "stripeRef":               session.id,
            "stripeCheckoutSessionId": session.id,
            "updatedAt":               firestore.SERVER_TIMESTAMP,
        })

        print(f"[verify-session] ✅ tx={transaction_id} → status=waiting, paymentStatus=paid")
        return {"paid": True, "alreadyUpdated": False}

    except HTTPException:
        raise  # Re-raise 400/404 without wrapping
    except Exception as exc:
        print(f"[verify-session] ERROR updating Firestore for tx={transaction_id}: {exc}")
        raise HTTPException(
            status_code=500,
            detail=f"Firestore update failed: {str(exc)}",
        ) from exc


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

        try:
            db  = get_firestore_client()
            ref = db.collection("transactions").document(transaction_id)

            tx_snap = ref.get()
            if tx_snap.exists and tx_snap.to_dict().get("paymentStatus") == "paid":
                print(f"[Webhook] tx={transaction_id} already marked paid by verify-session — skipping")
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

            print(f"[Webhook] Firestore updated — tx={transaction_id} → status=waiting, paymentStatus=paid")

        except Exception as exc:
            print(f"[Webhook] ERROR updating Firestore for tx={transaction_id}: {exc}")
            raise HTTPException(status_code=500, detail=f"Firestore update failed: {str(exc)}") from exc

    return {"received": True}