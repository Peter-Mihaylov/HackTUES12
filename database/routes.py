from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import Optional
from dataclasses import asdict

from auth import (
    authenticate_user,
    create_access_token,
    get_current_active_user,
    hash_password,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)
from database import get_db
from models import User, Vendor, VendorRating
from schemas import Token, UserCreate, UserOut, VendorCreate, VendorOut, RatingCreate, RatingOut
from messages import get_message

router = APIRouter()

# ════════════════════════════════════════════════════════════════════
#  AUTHENTICATION ROUTES
# ════════════════════════════════════════════════════════════════════

auth_router = APIRouter(prefix="/auth", tags=["authentication"])


@auth_router.post("/register", response_model=Token)
def register_user(user_data: UserCreate, db: Session = Depends(get_db)):
    """Register a new user and return an access token"""
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Hash the password
    hashed_password = hash_password(user_data.password)

    # Create new user
    new_user = User(
        email=user_data.email,
        password_hash=hashed_password,
        first_name=user_data.first_name,
        # last_name=user_data.last_name,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Auto-login: generate access token for the new user
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": new_user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@auth_router.post("/token", response_model=Token)
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Authenticate user and return access token"""
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@auth_router.get("/me", response_model=UserOut)
def read_users_me(current_user: User = Depends(get_current_active_user)):
    """Get current user information"""
    return current_user


# ════════════════════════════════════════════════════════════════════
#  VENDOR/FARMS ROUTES
# ════════════════════════════════════════════════════════════════════

vendors_router = APIRouter(prefix="/vendors", tags=["vendors"])


@vendors_router.post("/", response_model=VendorOut)
def create_vendor(
    vendor_data: VendorCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Create a new vendor (requires Bearer token)"""
    vendor = Vendor(**vendor_data.dict(), owner_id=current_user.id)
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return vendor


@vendors_router.post("/rating", response_model=RatingOut)
def create_rating(
    rating_data: RatingCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Rate a vendor (requires Bearer token)"""
    vendor = db.query(Vendor).filter(Vendor.id == rating_data.vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    if rating_data.rating < 0.0 or rating_data.rating > 5.0:
        raise HTTPException(status_code=400, detail="Rating must be between 0.0 and 5.0")

    new_rating = VendorRating(
        vendor_id=rating_data.vendor_id,
        user_id=current_user.id,
        rating=rating_data.rating,
        description=rating_data.description,
    )
    db.add(new_rating)
    db.commit()
    db.refresh(new_rating)
    return new_rating

@vendors_router.get("/{vendor_id}", response_model=VendorOut)
def get_vendor(vendor_id: int, db: Session = Depends(get_db)):
    """Get vendor details"""
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail=get_message("vendor_not_found", lang))
    return vendor


@vendors_router.get("/", response_model=list[VendorOut])
def list_vendors(db: Session = Depends(get_db)):
    """List all vendors"""
    return db.query(Vendor).all()
