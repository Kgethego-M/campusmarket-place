import os
import stripe
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/stripe", tags=["stripe"])
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

def get_stripe():
    if not stripe.api_key:
        raise HTTPException(500, "STRIPE_SECRET_KEY not configured")
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

@router.post("/create-checkout-session")
async def create_checkout_session(payload: CheckoutSessionRequest):
    stripe_client = get_stripe()
    try:
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

@router.get("/health")
def health():
    return {"stripe_configured": bool(stripe.api_key)}