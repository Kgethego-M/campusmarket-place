from fastapi import APIRouter, UploadFile, File, Form
from database import get_db
from azure.storage.blob import BlobServiceClient
import os, uuid

router = APIRouter(prefix="/listings", tags=["listings"])

def upload_image(file):
    conn_str = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
    container = os.getenv("AZURE_CONTAINER_NAME")
    blob_service = BlobServiceClient.from_connection_string(conn_str)
    blob_name = f"{uuid.uuid4()}{os.path.splitext(file.filename)[1]}"
    blob_client = blob_service.get_blob_client(container=container, blob=blob_name)
    blob_client.upload_blob(file.file)
    return f"https://{blob_service.account_name}.blob.core.windows.net/{container}/{blob_name}"

@router.get("/")
def get_listings():
    db = get_db()
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM listings JOIN products ON listings.product_id = products.product_id")
    results = cursor.fetchall()
    db.close()
    return results

@router.post("/")
async def create_listing(
    user_id: str = Form(...),
    title: str = Form(...),
    description: str = Form(None),
    specifications: str = Form(None),
    price: float = Form(...),
    category: str = Form(None),
    condition: str = Form("good"),
    listing_type: str = Form("sell"),
    image: UploadFile = File(None)
):
    image_url = upload_image(image) if image else None
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        INSERT INTO products (title, description, specifications, price, category, `condition`, images)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """, (title, description, specifications, price, category, condition, image_url))
    product_id = cursor.lastrowid

    cursor.execute("""
        INSERT INTO listings (user_id, product_id, listing_type)
        VALUES (%s, %s, %s)
    """, (user_id, product_id, listing_type))

    db.commit()
    db.close()
    return {"message": "Listing created successfully"}