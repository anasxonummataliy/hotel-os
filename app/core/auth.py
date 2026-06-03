from typing import Optional
from fastapi import HTTPException, Header, Depends
from jose import JWTError, jwt

from app.core.config import settings

ALGORITHM = "HS256"


def decode_jwt(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {e}")


def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Use: Authorization: Bearer <token>")
    return decode_jwt(token)


def require_roles(*roles: str):
    def _dep(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in roles:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required: {list(roles)}, your role: {user.get('role')}",
            )
        return user
    return _dep


def staff_or_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in ("admin", "reception", "housekeeping", "room_service", "maintenance"):
        raise HTTPException(status_code=403, detail="Staff access required")
    return user


def any_authenticated(user: dict = Depends(get_current_user)) -> dict:
    return user
