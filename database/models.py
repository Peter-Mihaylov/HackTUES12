from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    Text, Enum, Float, ForeignKey, Table
)
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime, timezone
import enum

Base = declarative_base()


# ════════════════════════════════════════════════════════════════
#  ENUMS
# ════════════════════════════════════════════════════════════════

class UserRole(enum.Enum):
    CONSUMER = "consumer"
    FARMER   = "farmer"       # reserved for later


class ProductCategory(enum.Enum):
    VEGETABLES   = "vegetables"    # Зеленчуци
    FRUITS       = "fruits"        # Плодове
    DAIRY        = "dairy"         # Млечни продукти
    MEAT         = "meat"          # Месо
    EGGS         = "eggs"          # Яйца
    HONEY        = "honey"         # Мед
    GRAINS       = "grains"        # Зърнени
    WINE         = "wine"          # Вино
    HERBS        = "herbs"         # Билки
    PRESERVES    = "preserves"     # Консерви / буркани
    OTHER        = "other"         # Друго


class ProductStatus(enum.Enum):
    AVAILABLE    = "available"     # In season / in stock
    SEASONAL     = "seasonal"      # Coming soon / seasonal
    UNAVAILABLE  = "unavailable"   # Out of stock


class FarmType(enum.Enum):
    ORGANIC      = "organic"       # Биологично
    TRADITIONAL  = "traditional"   # Традиционно
    MIXED        = "mixed"         # Смесено


# ════════════════════════════════════════════════════════════════
#  USER
# ════════════════════════════════════════════════════════════════

class User(Base):
    __tablename__ = "users"

    # ── Identity ─────────────────────────────────────────────────
    id            = Column(Integer, primary_key=True, index=True)
    email         = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)

    # ── Basic profile ─────────────────────────────────────────────
    first_name    = Column(String(100), nullable=False)
    last_name     = Column(String(100), nullable=False)
    phone         = Column(String(20),  nullable=True)

    # ── Role ──────────────────────────────────────────────────────
    role          = Column(Enum(UserRole), default=UserRole.CONSUMER, nullable=False)

    # ── Location ──────────────────────────────────────────────────
    city          = Column(String(100), nullable=True)
    region        = Column(String(100), nullable=True)

    # ── Account state ─────────────────────────────────────────────
    is_active     = Column(Boolean, default=True,  nullable=False)
    is_verified   = Column(Boolean, default=False, nullable=False)

    # ── Timestamps ────────────────────────────────────────────────
    created_at    = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at    = Column(DateTime(timezone=True),
                           default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    # ── Relationships ─────────────────────────────────────────────
    vendors       = relationship("Vendor", back_populates="owner", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User id={self.id} email={self.email} role={self.role.value}>"


# ════════════════════════════════════════════════════════════════
#  VENDOR
# ════════════════════════════════════════════════════════════════

class Vendor(Base):
    __tablename__ = "vendors"

    # ── Identity ─────────────────────────────────────────────────
    id            = Column(Integer, primary_key=True, index=True)
    owner_id      = Column(Integer, ForeignKey("users.id"), nullable=False)

    # ── Basic info ────────────────────────────────────────────────
    name          = Column(String(200), nullable=False)
    description   = Column(Text,        nullable=True)
    farm_type     = Column(Enum(FarmType), default=FarmType.TRADITIONAL, nullable=False)

    # ── Location (required for the map) ───────────────────────────
    address       = Column(String(300), nullable=True)   # Street / village name
    city          = Column(String(100), nullable=False)
    region        = Column(String(100), nullable=False)  # e.g. "Пловдив", "Варна"
    latitude      = Column(Float,       nullable=True)   # For map pin
    longitude     = Column(Float,       nullable=True)   # For map pin

    # ── Contact ───────────────────────────────────────────────────
    phone         = Column(String(20),  nullable=True)
    website       = Column(String(255), nullable=True)
    facebook      = Column(String(255), nullable=True)
    instagram     = Column(String(255), nullable=True)

    # ── Media ─────────────────────────────────────────────────────
    cover_image   = Column(String(500), nullable=True)   # URL / file path
    # ── Rating ───────────────────────────────────────────────────
    rating        = Column(Float, default=0.0, nullable=False)      # 0.0 - 5.0 scale
    # ── State ─────────────────────────────────────────────────────
    is_active     = Column(Boolean, default=True, nullable=False)
    is_approved   = Column(Boolean, default=False, nullable=False)  # Admin approval gate

    # ── Timestamps ────────────────────────────────────────────────
    created_at    = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at    = Column(DateTime(timezone=True),
                           default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    # ── Relationships ─────────────────────────────────────────────
    owner         = relationship("User",    back_populates="vendors")
    products      = relationship("Product", back_populates="vendor", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Vendor id={self.id} name={self.name} region={self.region}>"


# ════════════════════════════════════════════════════════════════
#  PRODUCT  (a product a vendor is offering)
# ════════════════════════════════════════════════════════════════

class Product(Base):
    __tablename__ = "products"

    # ── Identity ─────────────────────────────────────────────────
    id            = Column(Integer, primary_key=True, index=True)
    vendor_id     = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    creator_id    = Column(Integer, nullable=True)  # User who created this product listing

    # ── Product info ──────────────────────────────────────────────
    name          = Column(String(200),      nullable=False)   # e.g. "Домати чери"
    description   = Column(Text,             nullable=True)
    category      = Column(Enum(ProductCategory), nullable=False)

    # ── Pricing ───────────────────────────────────────────────────
    price         = Column(Float,            nullable=True)    # None = "price on request"
    price_unit    = Column(String(50),       nullable=True)    # "кг", "бр", "литър", etc.

    # ── Availability ──────────────────────────────────────────────
    status        = Column(Enum(ProductStatus), default=ProductStatus.AVAILABLE, nullable=False)
    is_organic    = Column(Boolean, default=False, nullable=False)

    # ── Media ─────────────────────────────────────────────────────
    image         = Column(String(500), nullable=True)         # URL / file path

    # ── Timestamps ────────────────────────────────────────────────
    created_at    = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at    = Column(DateTime(timezone=True),
                           default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    # ── Relationships ─────────────────────────────────────────────
    vendor        = relationship("Vendor", back_populates="products")

    def __repr__(self):
        return f"<Product id={self.id} name={self.name} vendor_id={self.vendor_id}>"
