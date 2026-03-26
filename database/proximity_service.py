import math
from dataclasses import dataclass
from typing import Optional
from sqlalchemy.orm import Session
from models import Vendor, Product, ProductStatus, ProductCategory


# ════════════════════════════════════════════════════════════════
#  HAVERSINE  —  straight-line distance between two GPS points
# ════════════════════════════════════════════════════════════════

EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Returns the great-circle distance in kilometres between two points
    on Earth given their latitude/longitude in decimal degrees.
    """
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi       = math.radians(lat2 - lat1)
    d_lambda    = math.radians(lon2 - lon1)

    a = (math.sin(d_phi / 2) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2)

    return EARTH_RADIUS_KM * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

# ════════════════════════════════════════════════════════════════
#  RESPONSE SHAPE
# ════════════════════════════════════════════════════════════════

@dataclass
class NearbyVendor:
    id:           int
    name:         str
    city:         str
    region:       str
    latitude:     float
    longitude:    float
    distance_km:  float          # distance from user
    farm_type:    str
    rating:       float          # farm rating (0.0 - 5.0)
    phone:        Optional[str]
    cover_image:  Optional[str]
    matched_products: list[dict] # products that matched the search (empty = browse mode)

# ════════════════════════════════════════════════════════════════
#  CORE SERVICE
# ════════════════════════════════════════════════════════════════

def get_vendors_within_radius(
    db:             Session,
    user_lat:       float,
    user_lon:       float,
    radius_km:      float = 100.0,  # default 100 km
) -> list[NearbyVendor]:
    """
    Returns all ACTIVE + APPROVED vendors within `radius_km` of the user,
    sorted by distance (nearest first).
    No product filter — used when the map first loads.
    """
    vendors = (
        db.query(Vendor)
        .filter(
            Vendor.is_active   == True,
            Vendor.is_approved == True,
            Vendor.latitude    != None,
            Vendor.longitude   != None,
        )
        .all()
    )

    results = []
    for vendor in vendors:
        dist = haversine_km(user_lat, user_lon, vendor.latitude, vendor.longitude)
        if dist <= radius_km:
            results.append(
                NearbyVendor(
                    id=vendor.id,
                    name=vendor.name,
                    city=vendor.city,
                    region=vendor.region,
                    latitude=vendor.latitude,
                    longitude=vendor.longitude,
                    distance_km=round(dist, 2),
                    farm_type=vendor.farm_type.value,
                    rating=vendor.rating,
                    phone=vendor.phone,
                    cover_image=vendor.cover_image,
                    matched_products=[],
                )
            )

    results.sort(key=lambda v: v.distance_km)
    return results


def search_vendors_by_requirements(
    db:             Session,
    user_lat:       float,
    user_lon:       float,
    radius_km:      float = 100.0,
    category:       Optional[ProductCategory] = None,
    keyword:        Optional[str] = None,       # searches product name + description
    is_organic:     Optional[bool] = None,
    max_price:      Optional[float] = None,
) -> list[NearbyVendor]:
    """
    Filters vendors by proximity AND product requirements.
    Returns vendors that have at least one matching product,
    with only the matched products attached.
    Returns an empty list if nothing matches — the router will
    turn that into a clear 'no results' response.
    """
    # Step 1 — base product query with filters
    product_query = (
        db.query(Product)
        .join(Vendor)
        .filter(
            Vendor.is_active    == True,
            Vendor.is_approved  == True,
            Vendor.latitude     != None,
            Vendor.longitude    != None,
            Product.status    == ProductStatus.AVAILABLE,
        )
    )

    if category:
        product_query = product_query.filter(Product.category == category)

    if is_organic is not None:
        product_query = product_query.filter(Product.is_organic == is_organic)

    if max_price is not None:
        product_query = product_query.filter(
            (Product.price == None) | (Product.price <= max_price)
        )

    if keyword:
        kw = f"%{keyword.lower()}%"
        product_query = product_query.filter(
            Product.name.ilike(kw) | Product.description.ilike(kw)
        )

    products = product_query.all()

    # Step 2 — group products by vendor, apply radius filter
    vendor_map: dict[int, NearbyVendor] = {}

    for product in products:
        vendor = product.vendor
        dist = haversine_km(user_lat, user_lon, vendor.latitude, vendor.longitude)

        if dist > radius_km:
            continue  # outside the user's selected radius

        if vendor.id not in vendor_map:
            vendor_map[vendor.id] = NearbyVendor(
                id=vendor.id,
                name=vendor.name,
                city=vendor.city,
                region=vendor.region,
                latitude=vendor.latitude,
                longitude=vendor.longitude,
                distance_km=round(dist, 2),
                farm_type=vendor.farm_type.value,
                rating=vendor.rating,
                phone=vendor.phone,
                cover_image=vendor.cover_image,
                matched_products=[],
            )

        vendor_map[vendor.id].matched_products.append({
            "id":          product.id,
            "name":        product.name,
            "category":    product.category.value,
            "price":       product.price,
            "price_unit":  product.price_unit,
            "is_organic":  product.is_organic,
            "image":       product.image,
        })

    results = sorted(vendor_map.values(), key=lambda v: v.distance_km)
    return results