# ════════════════════════════════════════════════════════════════════
#  CONFIGURATION — Bulgaria-specific settings
# ════════════════════════════════════════════════════════════════════

# Bulgaria boundaries (for reference)
BULGARIA = {
    "name": "Bulgaria",
    "min_latitude": 40.95,
    "max_latitude": 44.20,
    "min_longitude": 22.37,
    "max_longitude": 28.61,
    "max_diagonal_km": 450,  # Diagonal distance across Bulgaria
}

# Default search radius in kilometers
DEFAULT_SEARCH_RADIUS_KM = 50

# Recommended search radiuses for Bulgaria
RECOMMENDED_RADIUSES = {
    "city": 15,      # Within a city
    "district": 30,  # Within a district
    "region": 50,    # Within a region
    "country": 100,  # Across regions
}

# Latitude/Longitude precision for Bulgaria (can be less precise than global)
# Bulgaria is small enough that 2-3 decimal places is usually sufficient
COORDINATE_PRECISION = 2  # 0.01 degrees ≈ 1.1 km
