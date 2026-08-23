from __future__ import annotations

import base64
import os
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from fastapi.responses import JSONResponse
from firebase_admin import firestore, storage

from app.core.firebase import db
from app.schemas import LibraryItem, LibrarySaveRequest


def library_save(body: LibrarySaveRequest, user: dict) -> LibraryItem:
    data = body.data.split(",", 1)[1] if body.data.startswith("data:") and "," in body.data else body.data
    try:
        raw = base64.b64decode(data)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Data file tidak valid.") from exc
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(body.name)[1].lower() or ".pdf"
    path = f"users/{user['uid']}/library/{file_id}{ext}"
    blob = storage.bucket().blob(path)
    blob.upload_from_string(raw, content_type="application/pdf" if ext == ".pdf" else "application/octet-stream")
    blob.make_public()
    db.collection("files").document(file_id).set({"user_id": user["uid"], "name": body.name, "size": body.size, "text": body.text, "token_count": body.token_count, "chat_id": body.chat_id or "", "project_id": body.project_id or "", "storage_path": path, "type": "document", "extension": ext.lstrip(".") or "pdf", "created_at": firestore.SERVER_TIMESTAMP})
    return LibraryItem(id=file_id, name=body.name, type="document", extension=ext.lstrip(".") or "pdf", modified_at=datetime.now(timezone.utc).isoformat(), size_in_bytes=body.size, chat_id=body.chat_id, storage_path=path, token_count=body.token_count)


def library_list(user: dict, project_id: str | None = None) -> JSONResponse:
    items = []
    query = db.collection("files").where("user_id", "==", user["uid"])
    if project_id:
        query = query.where("project_id", "==", project_id)
    for doc in query.stream():
        data = doc.to_dict()
        created = data.get("created_at")
        items.append({"id": doc.id, "name": data.get("name", ""), "type": data.get("type", "document"), "extension": data.get("extension", "pdf"), "modified_at": created.isoformat() if created else data.get("modified_at", ""), "size_in_bytes": data.get("size", 0), "chat_id": data.get("chat_id") or None, "project_id": data.get("project_id") or None, "storage_path": data.get("storage_path", ""), "token_count": data.get("token_count", 0)})
    items.sort(key=lambda item: item["modified_at"], reverse=True)
    return JSONResponse(content={"files": items})


def library_delete(file_id: str, user: dict) -> JSONResponse:
    ref = db.collection("files").document(file_id)
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="File tidak ditemukan.")
    data = doc.to_dict()
    if data.get("user_id") != user["uid"]:
        raise HTTPException(status_code=403, detail="Akses ditolak.")
    if data.get("storage_path"):
        try:
            storage.bucket().blob(data["storage_path"]).delete()
        except Exception:
            pass
    ref.delete()
    return JSONResponse(content={"ok": True, "id": file_id})
