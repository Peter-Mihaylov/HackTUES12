from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    Text, Enum, Float, ForeignKey, Table
)
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime, timezone
import enum

Base = declarative_base()

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

    # ── Account state ─────────────────────────────────────────────
    is_active     = Column(Boolean, default=True, nullable=False)

    # ── Timestamps ────────────────────────────────────────────────
    created_at    = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at    = Column(DateTime(timezone=True),
                           default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

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

    # ── Location (required for the map) ───────────────────────────
    latitude      = Column(Float,       nullable=True)   # For map pin
    longitude     = Column(Float,       nullable=True)   # For map pin

    # ── Media ─────────────────────────────────────────────────────
    cover_image   = Column(String(500), nullable=True)   # URL / file path
    # ── Rating ───────────────────────────────────────────────────
    rating        = Column(Float, default=0.0, nullable=False)      # 0.0 - 5.0 scale
    # ── State ─────────────────────────────────────────────────────
    is_active     = Column(Boolean, default=True, nullable=False)
    is_approved   = Column(Boolean, default=False, nullable=False)
    # ── Timestamps ────────────────────────────────────────────────
    created_at    = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at    = Column(DateTime(timezone=True),
                           default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

# ════════════════════════════════════════════════════════════════
#  RATING
# ════════════════════════════════════════════════════════════════

class VendorRating(Base):
    __tablename__ = "vendor_ratings"

    # ── Identity ─────────────────────────────────────────────────
    id         = Column(Integer, primary_key=True, index=True)
    vendor_id  = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    user_id    = Column(Integer, ForeignKey("users.id"),   nullable=False)

    # ── Rating value ─────────────────────────────────────────────
    rating     = Column(Float, nullable=False)  # 0.0 - 5.0

    # ── Timestamps ───────────────────────────────────────────────
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
