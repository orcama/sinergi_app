from fastapi import Depends, HTTPException, Header
from firebase_admin import auth as firebase_auth

async def get_current_user(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    token = authorization.split("Bearer ")[1]
    try:
        decoded_token = firebase_auth.verify_id_token(token)
        return decoded_token  # berisi uid, email, dll
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def get_optional_user(authorization: str | None = Header(default=None)):
    if not authorization:
        return None
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    try:
        return firebase_auth.verify_id_token(authorization.split("Bearer ", 1)[1])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
