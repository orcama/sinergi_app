from fastapi import HTTPException


def _fmt_time(value) -> str:
    if value is None:
        return ""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def admin_list_users(status: str, database=None) -> list[dict]:
    if database is None:
        from app.main import db
        database = db
    items: list[dict] = []
    for doc in database.collection("users").get():
        data = doc.to_dict() or {}
        verified = data.get("verified") is True
        if status == "pending" and verified:
            continue
        if status == "approved" and not verified:
            continue
        items.append(
            {
                "uid": doc.id,
                "email": data.get("email", ""),
                "name": data.get("name", ""),
                "verified": verified,
                "role": data.get("role", "user"),
                "last_login": _fmt_time(data.get("last_login")),
            }
        )
    items.sort(key=lambda item: (item["verified"], item["email"].lower()))
    return items


def admin_set_verified(uid: str, verified: bool, database=None) -> dict:
    if database is None:
        from app.main import db
        database = db
    ref = database.collection("users").document(uid)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="User tidak ditemukan.")
    ref.update({"verified": verified})
    return {"uid": uid, "verified": verified}