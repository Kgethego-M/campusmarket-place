import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load .env from the project root
ROOT_DIR = Path(__file__).resolve().parent
load_dotenv(ROOT_DIR / ".env")

from backend.routes.listings import router as listings_router
from backend.routes.stripe_payments import router as stripe_router

app = FastAPI(title="Campus Marketplace API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "https://campus-market-place-dnczhjgjc0bqh4ew.southafricanorth-01.azurewebsites.net",
        "https://campus-marketplace-api-gwgxand7f7aggha5.southafricanorth-01.azurewebsites.net",
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(listings_router)
app.include_router(stripe_router)

@app.get("/")
def root():
    return {
        "message": "Campus Marketplace API",
        "status": "running",
    }

@app.get("/health")
def health():
    return {
        "api": "ok",
        "envPath": str(ROOT_DIR / ".env"),
        "stripeConfigured": bool(os.getenv("STRIPE_SECRET_KEY")),
        "webhookConfigured": bool(os.getenv("STRIPE_WEBHOOK_SECRET")),
        "firebaseConfigured": bool(os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")),
    }
