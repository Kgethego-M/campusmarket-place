from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import listings

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(listings.router)

@app.get("/")
def read_root():
    return {"message": "Campus Marketplace API"}