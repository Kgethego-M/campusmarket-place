from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.listings import router as listings_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "https://campus-market-place-dnczhjgjc0bqh4ew.southafricanorth-01.azurewebsites.net",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(listings_router)

@app.get("/")
def root():
    return {"message": "Campus Marketplace API"}