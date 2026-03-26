from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
import os

# Database URL (modify based on your setup - MySQL, PostgreSQL, SQLite, etc.)
# For SQLite: "sqlite:///./test.db"
# For MySQL: "mysql+pymysql://user:password@localhost/dbname"
DATABASE_URL = os.getenv("DATABASE_URL", "mysql+pymysql://uco6w86mzvgsx:khnvamytgbxe@irintchev.com/dbnaipsmcu9bok")

engine = create_engine(
    DATABASE_URL,
    echo=False,  # Set to True for SQL debugging
    pool_size=10,
    max_overflow=20,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Dependency for FastAPI routes to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables based on SQLAlchemy models"""
    from models import Base
    Base.metadata.create_all(bind=engine)