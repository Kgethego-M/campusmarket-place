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


def update_analytics(fs, amount, payment_type, tx_data):
    """
    Read-then-write analytics update using plain arithmetic.
    Avoids firestore.Increment() which fails on mocked Firestore in tests.
    """
    analytics_ref = fs.collection("analytics").document("platform")
    analytics_snap = analytics_ref.get()

    # Determine the online amount to add
    if payment_type == "partial":
        online_amount = float(tx_data.get("onlineAmount") or amount)
    else:
        online_amount = amount

    if analytics_snap.exists:
        current = analytics_snap.to_dict()
        
        # Explicitly get values with default 0 (handle missing keys properly)
        current_total = current.get("totalRevenue")
        if current_total is None:
            current_total = 0
            
        current_online = current.get("onlineRevenue")
        if current_online is None:
            current_online = 0
        
        # Use amount for totalRevenue (full transaction amount)
        # Use online_amount for onlineRevenue (only the online portion)
        analytics_ref.update({
            "totalRevenue": current_total + amount,
            "onlineRevenue": current_online + online_amount,
            "lastUpdated": firestore.SERVER_TIMESTAMP,
        })
    else:
        analytics_ref.set({
            "totalRevenue": amount,
            "onlineRevenue": online_amount,
            "pendingCashRevenue": 0,
            "collectedCashRevenue": 0,
            "totalPayouts": 0,
            "totalRefunds": 0,
            "availableBalance": 0,
            "createdAt": firestore.SERVER_TIMESTAMP,
            "lastUpdated": firestore.SERVER_TIMESTAMP,
        })


# ─── Wallet recalculation (shared by all endpoints) ──────────────────────────

COMPLETED_STATUSES = ["completed", "sold", "traded"]
AD_PRICES = {"premium-popup": 150, "banner": 50}
CASH_TYPES = {"cash", "cod", "trade"}
CANCELLED_STATUSES = ["cancelled", "overdue_cancelled"]


def recalculate_wallet_balance(fs, user_id: str) -> float:
    """
    Full wallet recalculation — mirrors recalculateWallet() in walletService.js exactly.

    Credits:
      - Seller: completed sales (any payment method), excluding trades and self-purchases
      - Buyer:  cancelled transactions where payment was online/partial (online portion only)
      - Manual: topup entries in walletTransactions

    Debits:
      - Ads: AD_PRICES[ad.type] per ad in the ads collection (deduplicated)
      - Manual: withdrawal entries in walletTransactions
    """
    seller_txs = list(
        fs.collection("transactions")
          .where("sellerId", "==", user_id)
          .where("status", "in", COMPLETED_STATUSES)
          .stream()
    )
    cancelled_as_buyer = list(
        fs.collection("transactions")
        .where("buyerId", "==", user_id)
        .where("status", "in", CANCELLED_STATUSES)
        .stream()
    )
    ads = list(
        fs.collection("ads")
          .where("sellerId", "==", user_id)
          .stream()
    )
    manual_txs = list(
        fs.collection("walletTransactions")
          .where("userId", "==", user_id)
          .stream()
    )

    balance = 0.0

    # ── Seller credits (completed sales, any payment method) ──────────────────
    for d in seller_txs:
        p = d.to_dict()

        # SKIP: trades — no money changes hands
        if (p.get("type") or "").lower() == "trade":
            continue

        # SKIP: self-purchase edge case (sellerId === buyerId in test data)
        buyer_id = p.get("buyerId") or ""
        if buyer_id and buyer_id == user_id:
            continue

        amt = float(p.get("agreedPrice") or p.get("listingPrice") or p.get("price") or 0)
        if amt <= 0:
            continue

        balance += amt

    # ── Buyer refunds (cancelled, online payments only) ───────────────────────
    # Cash, COD, and trade payments were never in the wallet — nothing to refund.
    # Partial payments: only refund the online portion (onlineAmount).
    # Online payments: refund the full agreedPrice.
    for d in cancelled_as_buyer:
        p = d.to_dict()

        # SKIP: self-purchase edge case
        seller_id = p.get("sellerId") or ""
        if seller_id and seller_id == user_id:
            continue

        payment_type = (p.get("paymentType") or "").lower()
        provider = (p.get("paymentProvider") or "").lower()

        # Cash/COD/trade — no wallet money involved, nothing to refund
        if payment_type in CASH_TYPES or provider in CASH_TYPES:
            continue

        if payment_type == "partial":
            refund_amt = float(p.get("onlineAmount") or 0)
        else:
            refund_amt = float(p.get("agreedPrice") or p.get("listingPrice") or p.get("price") or 0)

        if refund_amt <= 0:
            continue

        balance += refund_amt

    # ── Ad debits (always wallet-paid, use AD_PRICES, deduplicated) ───────────
    seen_ad_ids = set()
    for d in ads:
        if d.id in seen_ad_ids:
            continue
        seen_ad_ids.add(d.id)
        p = d.to_dict()
        ad_price = AD_PRICES.get(p.get("type", ""))
        if not ad_price:
            continue  # unknown ad type — skip
        balance -= ad_price

    # ── Manual wallet entries: topup + withdrawal only ────────────────────────
    # Ignores any legacy ad_debit entries written by a previous code version.
    seen_manual_ids = set()
    for d in manual_txs:
        if d.id in seen_manual_ids:
            continue
        seen_manual_ids.add(d.id)
        p = d.to_dict()
        if p.get("type") not in ("topup", "withdrawal"):
            continue
        amt = float(p.get("amount") or 0)
        if p.get("direction") == "credit":
            balance += amt
        else:
            balance -= amt

    return balance


def persist_wallet_balance(fs, user_id: str, balance: float):
    fs.collection("users").document(user_id).update({
        "walletBalance": balance,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    })
    print(f"✅ walletBalance persisted: user={user_id}, balance=R{balance:.2f}")


# ─── Wallet top-up credit (idempotent) ───────────────────────────────────────

def credit_wallet_topup(fs, user_id: str, amount_rand: float, session_id: str, description: str = ""):
    """
    Writes a walletTransactions credit entry (idempotent — skips if session_id
    already exists), then recalculates and persists walletBalance.

    Returns the new walletBalance, or None if already credited (idempotent skip).
    """
    # ── Idempotency: skip if this Stripe session was already credited ─────────
    existing = list(
        fs.collection("walletTransactions")
          .where("refId", "==", session_id)
          .where("userId", "==", user_id)
          .limit(1)
          .stream()
    )
    if existing:
        print(f"ℹ️ Wallet top-up for session {session_id} already credited — skipping")
        return None

    # ── Write the credit entry ────────────────────────────────────────────────
    fs.collection("walletTransactions").add({
        "userId": user_id,
        "type": "topup",
        "direction": "credit",
        "amount": amount_rand,
        "description": description or f"Stripe top-up — R{amount_rand:.0f}",
        "refId": session_id,
        "createdAt": firestore.SERVER_TIMESTAMP,
    })
    print(f"✅ Wallet credit entry written: user={user_id}, R{amount_rand}, session={session_id}")

    # ── Recalculate and persist ───────────────────────────────────────────────
    balance = recalculate_wallet_balance(fs, user_id)
    persist_wallet_balance(fs, user_id, balance)
    return balance


# ─── Request models ───────────────────────────────────────────────────────────

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


class TopUpSessionRequest(BaseModel):
    userId: str
    userEmail: str
    amount: float
    description: str = ""
    currency: str = "zar"
    successUrl: str
    cancelUrl: str
    metadata: dict = {}


class VerifyTopUpRequest(BaseModel):
    sessionId: str
    userId: str
    amount: float = 0


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/health")
def health():
    return {
        "stripe_configured": bool(os.getenv("STRIPE_SECRET_KEY")),
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

    try:
        session = stripe_client.checkout.Session.retrieve(payload.sessionId)
    except Exception as e:
        raise HTTPException(500, f"Could not retrieve Stripe session: {str(e)}")

    print(f"🔍 verify-session: session={payload.sessionId}, payment_status={session.payment_status}")

    if session.payment_status != "paid":
        return {"paid": False, "status": session.payment_status}

    transaction_id = payload.transactionId.strip() if payload.transactionId else ""
    if not transaction_id:
        meta = session.metadata or {}
        transaction_id = meta.get("transactionId") or session.client_reference_id or ""

    if not transaction_id:
        raise HTTPException(400, "Cannot resolve transactionId from session or payload.")

    fs = get_firestore()
    if fs is None:
        print("⚠️ Firestore not available — skipping DB update")
        return {"paid": True, "status": "paid", "warning": "Firestore not configured"}

    try:
        ref = fs.collection("transactions").document(transaction_id)
        tx_snap = ref.get()

        if not tx_snap.exists:
            print(f"❌ Transaction {transaction_id} not found in Firestore")
            return {
                "paid": True,
                "status": "paid",
                "warning": f"Transaction '{transaction_id}' not found in database",
            }

        tx_data = tx_snap.to_dict()

        if tx_data.get("paymentStatus") == "paid":
            print(f"ℹ️ tx={transaction_id} already paid — skipping")
            return {"paid": True, "alreadyUpdated": True}

        amount_paid = (session.amount_total or 0) / 100
        payment_type = tx_data.get("paymentType", "full_online")

        try:
            update_analytics(fs, amount_paid, payment_type, tx_data)
            print(f"📊 Analytics updated: +R{amount_paid} for tx={transaction_id}")
        except Exception as analytics_err:
            print(f"⚠️ Analytics update failed (non-fatal): {analytics_err}")

        ref.update({
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

        print(f"✅ tx={transaction_id} → status=waiting, paymentStatus=paid")
        return {"paid": True, "alreadyUpdated": False, "transactionId": transaction_id}

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ verify-session Firestore error: {e}")
        raise HTTPException(500, f"Firestore update failed: {str(e)}")


# ─── Wallet top-up endpoints ──────────────────────────────────────────────────

@router.post("/create-topup-session")
async def create_topup_session(payload: TopUpSessionRequest):
    stripe_client = get_stripe()

    amount_cents = int(round(payload.amount * 100))
    if amount_cents < 1000:
        raise HTTPException(400, "Minimum top-up amount is R10")

    metadata = {
        "type": "wallet_topup",
        "userId": safe_meta(payload.userId),
        "amount": safe_meta(payload.amount),
    }
    for key, value in payload.metadata.items():
        metadata[key] = safe_meta(value)

    separator = "&" if "?" in payload.successUrl else "?"
    success_url = payload.successUrl + f"{separator}session_id={{CHECKOUT_SESSION_ID}}"

    try:
        session = stripe_client.checkout.Session.create(
            mode="payment",
            customer_email=payload.userEmail,
            client_reference_id=payload.userId,
            success_url=success_url,
            cancel_url=payload.cancelUrl,
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": payload.currency.lower(),
                    "unit_amount": amount_cents,
                    "product_data": {
                        "name": payload.description or f"Campus Marketplace — Wallet Top-up R{payload.amount:.0f}",
                    },
                },
                "quantity": 1,
            }],
            metadata=metadata,
        )
        print(f"✅ Top-up session created: user={payload.userId}, R{payload.amount}, session={session.id}")
        return {"id": session.id, "url": session.url}
    except Exception as e:
        raise HTTPException(500, f"Failed to create top-up session: {str(e)}")


@router.post("/verify-topup-session")
async def verify_topup_session(payload: VerifyTopUpRequest):
    stripe_client = get_stripe()

    try:
        session = stripe_client.checkout.Session.retrieve(payload.sessionId)
    except Exception as e:
        raise HTTPException(500, f"Could not retrieve Stripe session: {str(e)}")

    print(f"🔍 verify-topup-session: session={payload.sessionId}, payment_status={session.payment_status}")

    if session.payment_status != "paid":
        return {"paid": False, "status": session.payment_status}

    meta = session.metadata or {}
    user_id = payload.userId.strip() or meta.get("userId") or session.client_reference_id or ""
    if not user_id:
        raise HTTPException(400, "Cannot resolve userId from session or payload.")

    amount_rand = (session.amount_total or 0) / 100

    fs = get_firestore()
    if fs is None:
        print("⚠️ Firestore not available — skipping wallet credit")
        return {"paid": True, "status": "paid", "warning": "Firestore not configured"}

    try:
        new_balance = credit_wallet_topup(
            fs=fs,
            user_id=user_id,
            amount_rand=amount_rand,
            session_id=payload.sessionId,
            description=f"Stripe top-up — R{amount_rand:.0f}",
        )

        already_credited = new_balance is None
        print(f"{'ℹ️ Already credited' if already_credited else '✅ Wallet credited'}: user={user_id}")

        return {
            "paid": True,
            "alreadyCredited": already_credited,
            "userId": user_id,
            "amountRand": amount_rand,
            "newBalance": new_balance,
        }

    except Exception as e:
        print(f"❌ verify-topup-session Firestore error: {e}")
        raise HTTPException(500, f"Wallet credit failed: {str(e)}")


# ─── Webhook (redundancy fallback) ────────────────────────────────────────────

@router.post("/webhook")
async def stripe_webhook(request: Request):
    stripe_client = get_stripe()
    payload = await request.body()
    signature = request.headers.get("stripe-signature")
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
        session = event["data"]["object"]
        session_id = session.get("id", "")
        meta = session.get("metadata") or {}

        # ── Route: wallet top-up vs marketplace transaction ───────────────────
        if meta.get("type") == "wallet_topup":
            # ── Wallet top-up webhook path ────────────────────────────────────
            user_id = meta.get("userId") or session.get("client_reference_id", "")
            print(f"[Webhook] wallet_topup — session={session_id}, user={user_id}")

            if not user_id:
                print("[Webhook] No userId found for wallet_topup — skipping")
                return {"received": True}

            amount_rand = (session.get("amount_total") or 0) / 100
            fs = get_firestore()
            if fs is None:
                return {"received": True}

            try:
                credit_wallet_topup(
                    fs=fs,
                    user_id=user_id,
                    amount_rand=amount_rand,
                    session_id=session_id,
                    description=f"Stripe top-up — R{amount_rand:.0f}",
                )
                print(f"[Webhook] Wallet credited: user={user_id}, R{amount_rand}")
            except Exception as e:
                print(f"[Webhook] Wallet credit ERROR for user={user_id}: {e}")
                raise HTTPException(500, f"Wallet credit failed: {str(e)}")

        else:
            # ── Existing marketplace transaction webhook path ──────────────────
            transaction_id = meta.get("transactionId") or session.get("client_reference_id", "")
            print(f"[Webhook] checkout.session.completed — session={session_id}, tx={transaction_id}")

            if not transaction_id:
                print("[Webhook] No transactionId found — skipping")
                return {"received": True}

            fs = get_firestore()
            if fs is None:
                return {"received": True}

            try:
                ref = fs.collection("transactions").document(transaction_id)
                tx_snap = ref.get()

                if tx_snap.exists and tx_snap.to_dict().get("paymentStatus") == "paid":
                    print(f"[Webhook] tx={transaction_id} already paid — skipping")
                    return {"received": True}

                ref.update({
                    "status": "waiting",
                    "paymentStatus": "paid",
                    "paymentProvider": "stripe",
                    "paymentSettled": True,
                    "stripeRef": meta.get("stripeRef", session_id),
                    "stripeCheckoutSessionId": session_id,
                    "updatedAt": firestore.SERVER_TIMESTAMP,
                })
                print(f"[Webhook] tx={transaction_id} → waiting/paid")

            except Exception as e:
                print(f"[Webhook] ERROR for tx={transaction_id}: {e}")
                raise HTTPException(500, f"Firestore update failed: {str(e)}")

    return {"received": True}