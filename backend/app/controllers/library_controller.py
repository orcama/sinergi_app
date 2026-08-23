from __future__ import annotations

import base64
import os
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from fastapi.responses import JSONResponse
from firebase_admin import firestore, storage
from google.cloud.firestore_v1.vector import Vector

from app.core.firebase import db
from app.embeddings import EMBEDDING_DIMENSION, EMBEDDING_MODEL_ID
from app.rag.vector_store import chunk_payloads, make_chunks
from app.schemas import LibraryItem, LibrarySaveRequest
from app.services.content_service import clean_pdf_text, extract_pdf_text, estimate_tokens


def library_save(body: LibrarySaveRequest, user: dict) -> LibraryItem:
    data = body.data.split(",", 1)[1] if body.data.startswith("data:") and "," in body.data else body.data
    try:
        raw = base64.b64decode(data)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Data file tidak valid.") from exc
    # Re-extract from the original uploaded PDF.  The browser's preview text is
    # intentionally not authoritative because it may have been capped for UI
    # rendering; the full source is retained in Storage and chunked below.
    cleaned_text = extract_pdf_text(body.data, max_chars=None, collapse=False)
    if not cleaned_text:
        raise HTTPException(status_code=422, detail=f"PDF '{body.name}' tidak dapat dibaca (tidak ada teks ter-extract).")
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(body.name)[1].lower() or ".pdf"
    path = f"users/{user['uid']}/library/{file_id}{ext}"
    blob = storage.bucket().blob(path)
    blob.upload_from_string(raw, content_type="application/pdf" if ext == ".pdf" else "application/octet-stream")
    blob.make_public()
    text_path = f"{path}.txt"
    text_blob = storage.bucket().blob(text_path)
    text_blob.upload_from_string(cleaned_text, content_type="text/plain; charset=utf-8")
    token_count = estimate_tokens(cleaned_text)
    file_ref = db.collection("files").document(file_id)
    file_data = {"user_id": user["uid"], "name": body.name, "size": body.size, "token_count": token_count, "chat_id": body.chat_id or "", "project_id": body.project_id or "", "storage_path": path, "text_storage_path": text_path, "text_char_count": len(cleaned_text), "type": "document", "extension": ext.lstrip(".") or "pdf", "embedding_status": "pending", "created_at": firestore.SERVER_TIMESTAMP}
    # Firestore documents have a ~1 MiB field/document limit. Keep a small
    # compatibility copy only when it fits; Storage is the complete source.
    if len(cleaned_text.encode("utf-8")) < 900_000:
        file_data["text"] = cleaned_text
    file_ref.set(file_data)

    embedding_status = "ready"
    embedding_error = None
    try:
        chunk_vectors = chunk_payloads(cleaned_text)
        batch = db.batch()
        for index, (chunk, vector) in enumerate(chunk_vectors):
            chunk_ref = db.collection("document_chunks").document(f"{file_id}-{index}")
            batch.set(chunk_ref, {"user_id": user["uid"], "file_id": file_id, "project_id": body.project_id or "", "section_key": chunk.section_key, "section_label": chunk.section_label, "text": chunk.text, "chunk_index": chunk.chunk_index, "embedding": Vector(vector), "embedding_model": EMBEDDING_MODEL_ID, "embedding_dimensions": EMBEDDING_DIMENSION, "created_at": firestore.SERVER_TIMESTAMP})
        if chunk_vectors:
            batch.commit()
        file_ref.update({"embedding_status": "ready", "embedding_model": EMBEDDING_MODEL_ID, "embedding_dimensions": EMBEDDING_DIMENSION, "embedding_chunk_count": len(chunk_vectors)})
    except Exception as exc:
        embedding_status = "failed"
        embedding_error = str(exc)[:500]
        # Preserve lexical retrieval even when the embedding model or vector
        # index is unavailable. These chunks are complete and never a prefix
        # slice of the uploaded document.
        try:
            chunks = make_chunks(cleaned_text)
            batch = db.batch()
            for chunk in chunks:
                chunk_ref = db.collection("document_chunks").document(f"{file_id}-{chunk.chunk_index}-{chunk.section_key}")
                batch.set(chunk_ref, {"user_id": user["uid"], "file_id": file_id, "project_id": body.project_id or "", "section_key": chunk.section_key, "section_label": chunk.section_label, "text": chunk.text, "chunk_index": chunk.chunk_index, "created_at": firestore.SERVER_TIMESTAMP})
            if chunks:
                batch.commit()
        except Exception:
            pass
        file_ref.update({"embedding_status": embedding_status, "embedding_model": EMBEDDING_MODEL_ID, "embedding_dimensions": EMBEDDING_DIMENSION, "embedding_error": embedding_error})

    return LibraryItem(id=file_id, name=body.name, type="document", extension=ext.lstrip(".") or "pdf", modified_at=datetime.now(timezone.utc).isoformat(), size_in_bytes=body.size, chat_id=body.chat_id, storage_path=path, token_count=token_count, project_id=body.project_id, embedding_status=embedding_status, embedding_model=EMBEDDING_MODEL_ID, embedding_dimensions=EMBEDDING_DIMENSION, embedding_error=embedding_error)


def library_list(user: dict, project_id: str | None = None) -> JSONResponse:
    items = []
    query = db.collection("files").where("user_id", "==", user["uid"])
    if project_id:
        query = query.where("project_id", "==", project_id)
    for doc in query.stream():
        data = doc.to_dict()
        created = data.get("created_at")
        items.append({"id": doc.id, "name": data.get("name", ""), "type": data.get("type", "document"), "extension": data.get("extension", "pdf"), "modified_at": created.isoformat() if created else data.get("modified_at", ""), "size_in_bytes": data.get("size", 0), "chat_id": data.get("chat_id") or None, "project_id": data.get("project_id") or None, "storage_path": data.get("storage_path", ""), "token_count": data.get("token_count", 0), "embedding_status": data.get("embedding_status", "pending"), "embedding_model": data.get("embedding_model"), "embedding_dimensions": data.get("embedding_dimensions"), "embedding_error": data.get("embedding_error")})
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
    if data.get("text_storage_path"):
        try:
            storage.bucket().blob(data["text_storage_path"]).delete()
        except Exception:
            pass
    for chunk in db.collection("document_chunks").where("user_id", "==", user["uid"]).where("file_id", "==", file_id).stream():
        chunk.reference.delete()
    ref.delete()
    return JSONResponse(content={"ok": True, "id": file_id})
