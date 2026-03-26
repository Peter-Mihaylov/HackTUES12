from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from models import UserRole, FarmType, ProductCategory, ProductStatus


# ════════════════════════════════════════════════════════════════════
#  USER SCHEMAS
# ════════════════════════════════════════════════════════════════════

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    last_name: str
    phone: Optional[str] = None
    city: Optional[str] = None
    region: Optional[str] = None


class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    region: Optional[str] = None


class UserOut(BaseModel):
    id: int
    email: str
    first_name: str
    last_name: str
    phone: Optional[str]
    role: UserRole
    city: Optional[str]
    region: Optional[str]
    is_active: bool
    is_verified: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ════════════════════════════════════════════════════════════════════
#  VENDOR SCHEMAS
# ════════════════════════════════════════════════════════════════════

class VendorCreate(BaseModel):
    name: str
    description: Optional[str] = None
    farm_type: FarmType
    address: Optional[str] = None
    city: str
    region: str
    latitude: float
    longitude: float
    phone: Optional[str] = None
    website: Optional[str] = None
    facebook: Optional[str] = None
    instagram: Optional[str] = None
    rating: float = 0.0


class VendorUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    facebook: Optional[str] = None
    instagram: Optional[str] = None


class VendorOut(BaseModel):
    id: int
    name: str
    city: str
    region: str
    farm_type: FarmType
    latitude: float
    longitude: float
    phone: Optional[str]
    rating: float
    is_active: bool
    is_approved: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ════════════════════════════════════════════════════════════════════
#  PRODUCT SCHEMAS
# ════════════════════════════════════════════════════════════════════

class ProductCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: ProductCategory
    price: Optional[float] = None
    price_unit: Optional[str] = None
    is_organic: bool = False
    status: ProductStatus = ProductStatus.AVAILABLE
    creator_id: Optional[int] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    price_unit: Optional[str] = None
    status: Optional[ProductStatus] = None
    is_organic: Optional[bool] = None


class ProductOut(BaseModel):
    id: int
    name: str
    category: ProductCategory
    price: Optional[float]
    price_unit: Optional[str]
    is_organic: bool
    status: ProductStatus
    created_at: datetime

    model_config = {"from_attributes": True}
