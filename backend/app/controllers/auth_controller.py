from firebase_admin import firestore


def sync_user(user: dict, database=None) -> dict:
    if database is None:
        # Resolve through the application compatibility export so older
        # integrations that patch app.main.db continue to work.
        from app.main import db
        database = db
    from app.config import ADMIN_UIDS
    uid = user["uid"]
    ref = database.collection("users").document(uid)
    snapshot = ref.get()
    data = snapshot.to_dict() if snapshot.exists else {}
    is_admin = uid in ADMIN_UIDS

    updates: dict[str, object] = {
        "email": user.get("email"),
        "name": user.get("name", ""),
        "last_login": firestore.SERVER_TIMESTAMP,
    }
    if not snapshot.exists:
        # User baru: harus menunggu persetujuan admin dulu.
        updates["verified"] = False
    elif "verified" not in data:
        # Migrasi user yang sudah terdaftar sebelum fitur verifikasi:
        # disetujui otomatis sekali agar tidak kehilangan akses.
        updates["verified"] = True
    if is_admin:
        # Admin selalu dianggap verified agar tidak pernah terkunci.
        updates["verified"] = True
        updates["role"] = "admin"
    elif "role" not in data:
        updates["role"] = "user"

    ref.set(updates, merge=True)
    return {"uid": user["uid"], "email": user["email"]}


def me(user: dict, database=None) -> dict:
    if database is None:
        from app.main import db
        database = db
    # Sinkronkan dulu supaya migrasi user existing + seeding admin konsisten.
    sync_user(user, database)
    from app.config import ADMIN_UIDS
    uid = user["uid"]
    doc = database.collection("users").document(uid).get().to_dict() or {}
    is_admin = uid in ADMIN_UIDS
    role = "admin" if (is_admin or doc.get("role") == "admin") else (doc.get("role") or "user")
    return {
        "uid": uid,
        "email": doc.get("email") or user.get("email"),
        "name": doc.get("name", ""),
        "verified": bool(is_admin or doc.get("verified") is True),
        "role": role,
    }