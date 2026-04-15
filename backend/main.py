from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import listings

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://campus-market-place-dnczhjgjc0bqh4ew.southafricanorth-01.azurewebsites.net",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(listings.router)

@app.get("/")
def read_root():
    return {"message": "Campus Marketplace API"}