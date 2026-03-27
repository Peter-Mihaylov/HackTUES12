from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from dataclasses import asdict

from database import get_db
from models import Vendor
from schemas import VendorCreate, VendorOut
from messages import get_message

router = APIRouter(prefix="/vendors", tags=["vendors"])


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
def get_vendor(vendor_id: int, db: Session = Depends(get_db)):
    """Get vendor details"""
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail=get_message("vendor_not_found", lang))
    return vendor

# ════════════════════════════════════════════════════════════════════
#  GET /vendors
#  List all vendors
# ════════════════════════════════════════════════════════════════════

@router.get("/", response_model=list[VendorOut])
def list_vendors(db: Session = Depends(get_db)):
    """List all vendors"""
    return db.query(Vendor).all()