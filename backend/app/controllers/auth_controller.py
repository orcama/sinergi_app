from firebase_admin import firestore

def sync_user(user: dict, database=None) -> dict:
    if database is None:
        # Resolve through the application compatibility export so older
        # integrations that patch app.main.db continue to work.
        from app.main import db
        database = db
    database.collection("users").document(user["uid"]).set({"email": user.get("email"), "name": user.get("name", ""), "last_login": firestore.SERVER_TIMESTAMP}, merge=True)
    return {"uid": user["uid"], "email": user["email"]}
