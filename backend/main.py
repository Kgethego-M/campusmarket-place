# main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from listings import router as listings_router  # adjust import path if needed

app = FastAPI()

# ----------------------------
# CORS (MUST BE FIRST MIDDLEWARE)
# ----------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        # FRONTEND ORIGIN (exact match)
        "https://campus-market-place-dnczhjgjc0bqh4ew.southafricanorth-01.azurewebsites.net",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------
# ROUTES
# ----------------------------
app.include_router(listings_router)

# ----------------------------
# ROOT
# ----------------------------
@app.get("/")
def root():
    return {"message": "Campus Marketplace API"}