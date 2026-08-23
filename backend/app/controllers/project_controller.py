from __future__ import annotations
import uuid
from datetime import datetime, timezone
from fastapi import HTTPException
from fastapi.responses import JSONResponse
from firebase_admin import firestore
from app.core.firebase import db
from app.schemas import ProjectCreateRequest, ProjectItem, ProjectUpdateRequest

def _iso(value) -> str:
    if value is None: return datetime.now(timezone.utc).isoformat()
    return value.isoformat() if hasattr(value, "isoformat") else str(value)

def _owned(project_id: str, uid: str):
    ref = db.collection("projects").document(project_id); snap = ref.get()
    if not snap.exists: raise HTTPException(status_code=404, detail="Project tidak ditemukan.")
    data = snap.to_dict()
    if data.get("user_id") != uid: raise HTTPException(status_code=403, detail="Akses ditolak.")
    return ref, data

def _to_item(project_id: str, data: dict, uid: str) -> ProjectItem:
    files = list(db.collection("files").where("user_id", "==", uid).where("project_id", "==", project_id).stream())
    chats = list(db.collection("chats").where("user_id", "==", uid).where("project_id", "==", project_id).stream())
    return ProjectItem(id=project_id, name=data.get("name", ""), emoji=data.get("emoji"), created_by="you", modified_at=_iso(data.get("modified_at") or data.get("created_at")), chat_ids=[doc.id for doc in chats], file_ids=[doc.id for doc in files], instructions=data.get("instructions"))

def project_list(user: dict) -> JSONResponse:
    projects = [_to_item(doc.id, doc.to_dict(), user["uid"]).model_dump(mode="json") for doc in db.collection("projects").where("user_id", "==", user["uid"]).stream()]
    projects.sort(key=lambda item: item["modified_at"], reverse=True)
    return JSONResponse(content={"projects": projects})

def project_get(project_id: str, user: dict) -> ProjectItem:
    _, data = _owned(project_id, user["uid"]); return _to_item(project_id, data, user["uid"])

def project_create(body: ProjectCreateRequest, user: dict) -> ProjectItem:
    project_id = str(uuid.uuid4()); name = body.name.strip()
    db.collection("projects").document(project_id).set({"user_id": user["uid"], "name": name, "emoji": body.emoji, "instructions": "", "created_at": firestore.SERVER_TIMESTAMP, "modified_at": firestore.SERVER_TIMESTAMP})
    return ProjectItem(id=project_id, name=name, emoji=body.emoji, created_by="you", modified_at=datetime.now(timezone.utc).isoformat(), chat_ids=[], file_ids=[], instructions="")

def project_update(project_id: str, body: ProjectUpdateRequest, user: dict) -> ProjectItem:
    ref, _ = _owned(project_id, user["uid"]); changes = body.model_dump(exclude_unset=True)
    if "name" in changes: changes["name"] = changes["name"].strip()
    changes["modified_at"] = firestore.SERVER_TIMESTAMP; ref.update(changes)
    return project_get(project_id, user)

def project_delete(project_id: str, user: dict) -> JSONResponse:
    ref, _ = _owned(project_id, user["uid"])
    for collection_name in ("files", "chats"):
        for doc in db.collection(collection_name).where("user_id", "==", user["uid"]).where("project_id", "==", project_id).stream(): doc.reference.update({"project_id": firestore.DELETE_FIELD})
    ref.delete(); return JSONResponse(content={"ok": True, "id": project_id})
