from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from dataclasses import asdict

from database import get_db
from models import ProductCategory, Vendor, Product  
from schemas import VendorCreate, VendorUpdate, VendorOut, ProductCreate, ProductUpdate, ProductOut
from proximity_service import (
    get_vendors_within_radius,
    search_vendors_by_requirements,
)
from messages import get_message
from config import DEFAULT_SEARCH_RADIUS_KM, RECOMMENDED_RADIUSES

router = APIRouter(prefix="/vendors", tags=["vendors"])


# ════════════════════════════════════════════════════════════════════
#  GET /farms/info/radiuses
#  Show recommended search radiuses for Bulgaria
# ════════════════════════════════════════════════════════════════════

@router.get("/info/radiuses")
def get_search_radiuses():
    """Get recommended search radiuses for Bulgaria"""
    return {
        "default_radius_km": DEFAULT_SEARCH_RADIUS_KM,
        "recommended_radiuses": RECOMMENDED_RADIUSES,
        "info": "Adjust radius_km parameter in /nearby or /search endpoints to change search area"
    }


# ════════════════════════════════════════════════════════════════
#  GET /farms/nearby
#  Called when the map first loads — no product filter
#  just show all farms within the radius
# ════════════════════════════════════════════════════════════════

@router.get("/nearby")
def nearby_farms(
    lat:       float = Query(...,                                   description="User latitude (Bulgaria: 40.95-44.20)"),
    lon:       float = Query(...,                                   description="User longitude (Bulgaria: 22.37-28.61)"),
    radius_km: float = Query(DEFAULT_SEARCH_RADIUS_KM,             description=f"Search radius in km (default {DEFAULT_SEARCH_RADIUS_KM} km)"),
    lang:      str   = Query("en",                                 description="Language (en or bg)"),
    db:        Session = Depends(get_db),
):
    farms = get_farms_within_radius(
        db=db,
        user_lat=lat,
        user_lon=lon,
        radius_km=radius_km,
    )

    if not farms:
        return {
            "found": False,
            "count": 0,
            "radius_km": radius_km,
            "message": get_message("no_farms_found", lang, radius=radius_km),
            "farms": [],
        }

    return {
        "found": True,
        "count": len(farms),
        "radius_km": radius_km,
        "message": get_message("farms_found", lang, count=len(farms), radius=radius_km),
        "farms": [asdict(f) for f in farms],
    }


# ════════════════════════════════════════════════════════════════
#  GET /vendors/search
#  Called when the user searches for a specific product/category
# ════════════════════════════════════════════════════════════════════════════════

@router.get("/search")
def search_vendors(
    lat:       float           = Query(...,                                   description="User latitude (Bulgaria: 40.95-44.20)"),
    lon:       float           = Query(...,                                   description="User longitude (Bulgaria: 22.37-28.61)"),
    radius_km: float           = Query(DEFAULT_SEARCH_RADIUS_KM,             description=f"Search radius in km (default {DEFAULT_SEARCH_RADIUS_KM} km)"),
    keyword:   Optional[str]   = Query(None,                                 description="Free text search in listing name/description"),
    category:  Optional[ProductCategory] = Query(None,                       description="Product category filter"),
    is_organic: Optional[bool] = Query(None,                                 description="Filter organic products only"),
    max_price:  Optional[float]= Query(None,                                 description="Maximum price filter"),
    lang:      str             = Query("en",                                 description="Language (en or bg)"),
    db:        Session         = Depends(get_db),
):
    # Must provide at least keyword or category
    if not keyword and not category:
        raise HTTPException(
            status_code=400,
            detail=get_message("search_required", lang)
        )

    vendors = search_vendors_by_requirements(
        db=db,
        user_lat=lat,
        user_lon=lon,
        radius_km=radius_km,
        category=category,
        keyword=keyword,
        is_organic=is_organic,
        max_price=max_price,
    )

    if not vendors:
        search_desc = ""
        if keyword:
            search_desc = get_message("search_for_keyword", lang, keyword=keyword)
        if category:
            cat_msg = get_message("search_in_category", lang, category=category.value)
            search_desc = f"{search_desc} {cat_msg}" if search_desc else cat_msg
        
        return {
            "found": False,
            "count": 0,
            "radius_km": radius_km,
            "message": get_message("no_vendors_with_products", lang, keyword=keyword or "", radius=radius_km),
            "vendors": [],
        }

    return {
        "found": True,
        "count": len(vendors),
        "radius_km": radius_km,
        "message": get_message("vendors_with_products_found", lang, count=len(vendors)),
        "vendors": [asdict(v) for v in vendors],
    }


# ════════════════════════════════════════════════════════════════════
#  POST /vendors
#  Create a new vendor
# ════════════════════════════════════════════════════════════════════

@router.post("/", response_model=VendorOut)
def create_vendor(vendor_data: VendorCreate, db: Session = Depends(get_db)):
    """Create a new vendor"""
    vendor = Vendor(**vendor_data.dict())
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return vendor


# ════════════════════════════════════════════════════════════════════
#  GET /vendors/{vendor_id}
#  Get vendor details by ID
# ════════════════════════════════════════════════════════════════════

@router.get("/{vendor_id}", response_model=VendorOut)
def get_vendor(vendor_id: int, lang: str = Query("en", description="Language (en or bg)"), db: Session = Depends(get_db)):
    """Get vendor details"""
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail=get_message("vendor_not_found", lang))
    return vendor


# ════════════════════════════════════════════════════════════════════
#  POST /vendors/{vendor_id}/products
#  Add a product to a vendor
# ════════════════════════════════════════════════════════════════════

@router.post("/{vendor_id}/products", response_model=ProductOut)
def add_product(vendor_id: int, product_data: ProductCreate, lang: str = Query("en", description="Language (en or bg)"), db: Session = Depends(get_db)):
    """Add a product to a vendor"""
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail=get_message("vendor_not_found", lang))
    
    listing = Listing(farm_id=farm_id, **listing_data.dict())
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return listing


# ════════════════════════════════════════════════════════════════════
#  GET /vendors/{vendor_id}/products
#  Get all products for a vendor
# ════════════════════════════════════════════════════════════════════

@router.get("/{vendor_id}/products")
def get_vendor_products(vendor_id: int, lang: str = Query("en", description="Language (en or bg)"), db: Session = Depends(get_db)):
    """Get all products for a specific vendor"""
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail=get_message("vendor_not_found", lang))
    
    products = db.query(Product).filter(Product.vendor_id == vendor_id).all()
    return {
        "vendor_id": vendor_id,
        "count": len(products),
        "products": [asdict(p) if hasattr(p, '__dataclass_fields__') else {
            "id": p.id,
            "name": p.name,
            "category": p.category.value,
            "price": p.price,
            "price_unit": p.price_unit,
            "is_organic": p.is_organic,
            "status": p.status.value,
        } for p in products]
    }


# ════════════════════════════════════════════════════════════════════
#  PATCH /vendors/{vendor_id}
#  Update vendor details
# ════════════════════════════════════════════════════════════════════

@router.patch("/{vendor_id}", response_model=VendorOut)
def update_vendor(vendor_id: int, vendor_data: VendorUpdate, lang: str = Query("en", description="Language (en or bg)"), db: Session = Depends(get_db)):
    """Update vendor details"""
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail=get_message("vendor_not_found", lang))
    
    update_data = vendor_data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(vendor, key, value)
    
    db.commit()
    db.refresh(vendor)
    return vendor


# ════════════════════════════════════════════════════════════════════
#  PATCH /vendors/{vendor_id}/products/{product_id}
#  Update a product
# ════════════════════════════════════════════════════════════════════

@router.patch("/{vendor_id}/products/{product_id}", response_model=ProductOut)
def update_product(vendor_id: int, product_id: int, product_data: ProductUpdate, lang: str = Query("en", description="Language (en or bg)"), db: Session = Depends(get_db)):
    """Update a product"""
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.vendor_id == vendor_id
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail=get_message("product_not_found", lang))
    
    update_data = product_data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(product, key, value)
    
    db.commit()
    db.refresh(product)
    return product


# ════════════════════════════════════════════════════════════════════
#  DELETE /vendors/{vendor_id}/products/{product_id}
#  Delete a product
# ════════════════════════════════════════════════════════════════════

@router.delete("/{vendor_id}/products/{product_id}")
def delete_product(vendor_id: int, product_id: int, lang: str = Query("en", description="Language (en or bg)"), db: Session = Depends(get_db)):
    """Delete a product"""
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.vendor_id == vendor_id
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail=get_message("product_not_found", lang))
    
    db.delete(product)
    db.commit()
    return {"message": get_message("product_deleted", lang, id=product_id)}