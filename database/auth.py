import hashlib
from datetime import datetime, timedelta, timezone

import jwt
from jwt.exceptions import InvalidTokenError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from typing import Annotated

from models import User
from schemas import TokenData
from database import get_db

# -------------------------------------------------------------------
# Security configuration
# Generate your own secret with:  openssl rand -hex 32
# -------------------------------------------------------------------
SECRET_KEY = "705287af50f1b188f649fcea798b140dcba23aea394221be4bbeeaddb676fae2"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


# ── Password helpers ───────────────────────────────────────────────

def hash_password(plain_password: str) -> str:
    """Return the SHA-256 hex digest of the given password."""
    return hashlib.sha256(plain_password.encode("utf-8")).hexdigest()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Compare a plaintext password against a stored SHA-256 hash."""
    return hash_password(plain_password) == hashed_password


# ── JWT helpers ────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Encode a JWT access token with an expiry claim."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta if expires_delta else timedelta(minutes=15)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


# ── DB helpers ─────────────────────────────────────────────────────

def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    """Return the user if credentials are valid, otherwise None."""
    user = get_user_by_email(db, email)
    if not user or not verify_password(password, user.hashed_password):
        return None
    return user


# ── FastAPI dependency ─────────────────────────────────────────────

async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Session = Depends(get_db),
) -> User:
    """Decode the JWT and return the matching user from the database."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email)
    except InvalidTokenError:
        raise credentials_exception

    user = get_user_by_email(db, token_data.email)
    if user is None:
        raise credentials_exception
    return user


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Guard that also rejects inactive accounts."""
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user