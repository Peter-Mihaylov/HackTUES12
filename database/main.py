from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from routes import auth_router, vendors_router
from messages import get_message

# Initialize database tables
init_db()

# Create FastAPI app
app = FastAPI(
    title="Vendor Market API",
    description="Map-based local vendor product search platform",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(vendors_router)

# ════════════════════════════════════════════════════════════════════
#  HEALTH CHECK & ROOT
# ════════════════════════════════════════════════════════════════════

@app.get("/")
def root(lang: str = Query("en", description="Language (en or bg)")):
    return {"message": get_message("api_running", lang)}


@app.get("/health")
def health_check(lang: str = Query("en", description="Language (en or bg)")):
    return {"status": get_message("status_healthy", lang)}
