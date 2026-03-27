from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

# ════════════════════════════════════════════════════════════════════
#  USER SCHEMAS
# ════════════════════════════════════════════════════════════════════

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    last_name: str

class UserUpdate(BaseModel):
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class UserOut(BaseModel):
    id: int
    email: str
    first_name: str
    last_name: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ════════════════════════════════════════════════════════════════════
#  VENDOR SCHEMAS
# ════════════════════════════════════════════════════════════════════

class VendorCreate(BaseModel):
    name: str
    description: Optional[str] = None
    latitude: float
    longitude: float
    rating: float = 0.0
    cover_image: Optional[str] = None


class VendorUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None

class VendorOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    latitude: float
    longitude: float
    rating: float
    cover_image: Optional[str] = None
    is_active: bool
    is_approved: bool
    created_at: datetime

    model_config = {"from_attributes": True}

# ════════════════════════════════════════════════════════════════════
#  RATING SCHEMAS
# ════════════════════════════════════════════════════════════════════

class RatingCreate(BaseModel):
    vendor_id: int
    rating: float
    description: Optional[str] = None

class RatingOut(BaseModel):
    id: int
    vendor_id: int
    user_id: int
    rating: float
    description: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

# ════════════════════════════════════════════════════════════════════
#  TOKEN SCHEMA
# ════════════════════════════════════════════════════════════════════

class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    email: Optional[str] = None

