# listings.py

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from database import get_db
from azure.storage.blob import BlobServiceClient
import os, uuid

router = APIRouter(prefix="/listings", tags=["listings"])


# ----------------------------
# Azure upload helper
# ----------------------------
def upload_image(file: UploadFile):
    conn_str = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
    container = os.getenv("AZURE_CONTAINER_NAME")

    if not conn_str or not container:
        raise HTTPException(status_code=500, detail="Azure config missing")

    blob_service = BlobServiceClient.from_connection_string(conn_str)

    file_ext = os.path.splitext(file.filename)[1] if file.filename else ""
    blob_name = f"{uuid.uuid4()}{file_ext}"

    blob_client = blob_service.get_blob_client(
        container=container,
        blob=blob_name
    )

    blob_client.upload_blob(file.file, overwrite=True)

    return f"https://{blob_service.account_name}.blob.core.windows.net/{container}/{blob_name}"


# ----------------------------
# GET ALL LISTINGS
# ----------------------------
@router.get("/")
def get_listings():
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT *
            FROM listings
            JOIN products ON listings.product_id = products.product_id
        """)
        return cursor.fetchall()

    finally:
        db.close()


# ----------------------------
# CREATE LISTING
# ----------------------------
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

    # ----------------------------
    # NORMALISE INPUT
    # ----------------------------
    listing_type = (listing_type or "sell").strip().lower()
    condition = (condition or "good").strip().lower()

    # ----------------------------
    # VALIDATION
    # ----------------------------
    valid_listing_types = {"sell", "trade", "either"}
    valid_conditions = {"new", "like_new", "good", "fair"}

    if listing_type not in valid_listing_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid listing_type: {listing_type}"
        )

    if condition not in valid_conditions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid condition: {condition}"
        )

    # ----------------------------
    # IMAGE UPLOAD
    # ----------------------------
    image_url = None
    if image and image.filename:
        try:
            image_url = upload_image(image)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Image upload failed: {str(e)}")

    db = get_db()
    cursor = db.cursor()

    try:
        # ----------------------------
        # INSERT PRODUCT
        # ----------------------------
        cursor.execute("""
            INSERT INTO products
            (title, description, specifications, price, category, `condition`, images)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            title,
            description or "",
            specifications or "",
            price,
            category or "other",
            condition,
            image_url
        ))

        product_id = cursor.lastrowid

        if not product_id:
            raise HTTPException(status_code=500, detail="Product insert failed")

        # ----------------------------
        # INSERT LISTING
        # ----------------------------
        cursor.execute("""
            INSERT INTO listings
            (user_id, product_id, listing_type)
            VALUES (%s, %s, %s)
        """, (
            user_id,
            product_id,
            listing_type
        ))

        listing_id = cursor.lastrowid

        db.commit()

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        db.close()

    return {
        "message": "Listing created successfully",
        "listing_id": listing_id,
        "product_id": product_id
    }