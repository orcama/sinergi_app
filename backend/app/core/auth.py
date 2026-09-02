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


def _user_doc(uid: str) -> dict:
    from app.core.firebase import db
    snap = db.collection("users").document(uid).get()
    return snap.to_dict() if snap.exists else {}


def _is_admin(uid: str, doc: dict) -> bool:
    from app.config import ADMIN_UIDS
    return uid in ADMIN_UIDS or doc.get("role") == "admin"


async def require_verified_user(authorization: str = Header(...)) -> dict:
    """Token valid + user sudah disetujui admin (atau admin dari env).

    Dipakai di semua route yang mengakses data user: kalau belum
    diverifikasi, tolak dengan 403 supaya frontend bisa menampilkan
    layar "Menunggu Verifikasi"."""

    user = await get_current_user(authorization)
    uid = user["uid"]
    doc = _user_doc(uid)
    if _is_admin(uid, doc):
        return user
    if doc.get("verified") is not True:
        raise HTTPException(status_code=403, detail="Akun belum diverifikasi.")
    return user


async def require_admin(authorization: str = Header(...)) -> dict:
    """Route admin: hanya user dengan role admin (atau ADMIN_UIDS dari env)."""

    user = await get_current_user(authorization)
    if not _is_admin(user["uid"], _user_doc(user["uid"])):
        raise HTTPException(status_code=403, detail="Akses ditolak.")
    return user