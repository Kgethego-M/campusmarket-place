import os

import stripe
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

load_dotenv()

router = APIRouter(prefix="/api/stripe", tags=["stripe"])


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
        "stripeRef": safe_metadata(payload.stripeRef),
        "paymentType": safe_metadata(payload.paymentType),
        "listingId": safe_metadata(payload.listingId),
        "amountRand": safe_metadata(payload.amountRand),
        "cashAmount": safe_metadata(payload.cashAmount),
        "totalAmount": safe_metadata(payload.totalAmount),
    }

    for key, value in payload.metadata.items():
        metadata[key] = safe_metadata(value)

    success_separator = "&" if "?" in payload.successUrl else "?"

    try:
        session = stripe_client.checkout.Session.create(
            mode="payment",
            customer_email=payload.buyerEmail,
            client_reference_id=payload.transactionId,
            success_url=payload.successUrl
            + f"{success_separator}session_id={{CHECKOUT_SESSION_ID}}",
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

        return {
            "id": session.id,
            "url": session.url,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create Stripe Checkout session: {str(exc)}",
        ) from exc


@router.post("/webhook")
async def stripe_webhook(request: Request):
    stripe_client = get_stripe()

    payload = await request.body()
    signature = request.headers.get("stripe-signature")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")

    if not webhook_secret:
        raise HTTPException(
            status_code=500,
            detail="STRIPE_WEBHOOK_SECRET is missing.",
        )

    try:
        event = stripe_client.Webhook.construct_event(
            payload,
            signature,
            webhook_secret,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook payload.") from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook signature.") from exc

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]

        # Later, when Firebase Admin is fully configured,
        # update Firestore here:
        #
        # status: waiting
        # paymentStatus: paid
        # paymentProvider: stripe

        print("Stripe payment completed:", session.get("id"))

    return {"received": True}