from __future__ import annotations

import logging
import uuid

from fastapi import HTTPException, Request
from firebase_admin import storage
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure

from app.core.firebase import db
from app.embeddings import EMBEDDING_MODEL_ID
from app.rag import SECTION_LABELS, retrieve, sectionize
from app.rag.vector_store import cosine_score, query_vector
from app.schemas import RagIngestRequest, RagIngestResponse, RagQueryRequest, RagQueryResponse, RagHit, RagSection, PdfExtractResponse
from app.services.content_service import estimate_tokens, extract_pdf_text

logger = logging.getLogger(__name__)


def pdf_extract(body: RagIngestRequest) -> PdfExtractResponse:
    text = extract_pdf_text(body.data, max_chars=None, collapse=False)
    if not text:
        logger.warning("PDF extraction returned no text for %s", body.name)
        raise HTTPException(status_code=422, detail=f"PDF '{body.name}' tidak dapat dibaca (tidak ada teks ter-extract).")
    return PdfExtractResponse(name=body.name, text=text, char_count=len(text), token_count=estimate_tokens(text))


def rag_ingest(body: RagIngestRequest, request: Request) -> RagIngestResponse:
    text = extract_pdf_text(body.data, max_chars=None, collapse=False)
    if not text:
        logger.warning("RAG PDF extraction returned no text for %s", body.name)
        raise HTTPException(status_code=422, detail=f"PDF '{body.name}' tidak dapat dibaca (tidak ada teks ter-extract).")
    doc_id = str(uuid.uuid4())
    request.app.state.rag_docs[doc_id] = {"name": body.name, "text": text}
    return RagIngestResponse(id=doc_id, name=body.name, char_count=len(text), sections=[RagSection(key=key, label=SECTION_LABELS.get(key, key), text=span) for key, span in sectionize(text).items() if span and span.strip()])


def _vector_hits(question: str, document_ids: list[str], user_id: str, top_k: int) -> list[RagHit]:
    vector = query_vector(question)
    candidates: list[RagHit] = []
    for document_id in document_ids:
        query = (
            db.collection("document_chunks")
            .where("user_id", "==", user_id)
            .where("file_id", "==", document_id)
            .find_nearest(
                vector_field="embedding",
                query_vector=vector,
                distance_measure=DistanceMeasure.COSINE,
                limit=top_k,
                distance_result_field="vector_distance",
            )
        )
        for snapshot in query.stream():
            data = snapshot.to_dict()
            candidates.append(RagHit(key=data.get("section_key", "document"), label=data.get("section_label", "Dokumen"), text=data.get("text", ""), score=cosine_score(data.get("vector_distance")), reason=f"vector:{EMBEDDING_MODEL_ID}"))
    candidates.sort(key=lambda hit: hit.score, reverse=True)
    return candidates[:top_k]


def _stored_texts(document_ids: list[str], user_id: str) -> list[str]:
    texts: list[str] = []
    for document_id in document_ids:
        snapshot = db.collection("files").document(document_id).get()
        if snapshot.exists:
            data = snapshot.to_dict()
            if data.get("user_id") == user_id and data.get("text"):
                texts.append(data["text"])
            elif data.get("user_id") == user_id and data.get("text_storage_path"):
                try:
                    text = storage.bucket().blob(data["text_storage_path"]).download_as_text()
                except Exception:
                    text = ""
                if text:
                    texts.append(text)
    return texts


def rag_query(body: RagQueryRequest, request: Request, user: dict | None = None) -> RagQueryResponse:
    if user and body.document_ids:
        try:
            vector_hits = _vector_hits(body.question, body.document_ids, user["uid"], body.top_k)
            if vector_hits:
                return RagQueryResponse(question=body.question, hits=vector_hits)
        except Exception:
            # Missing vector indexes, model downloads, or old documents should
            # not make retrieval unusable; section-aware lexical retrieval is
            # deterministic and remains the fallback.
            pass

    sources = [body.text] if body.text else []
    for doc_id in body.document_ids:
        doc = request.app.state.rag_docs.get(doc_id)
        if doc is not None:
            sources.append(doc.get("text", ""))
        elif not user:
            raise HTTPException(status_code=404, detail=f"Unknown RAG document id '{doc_id}'.")
    if user and body.document_ids:
        sources.extend(_stored_texts(body.document_ids, user["uid"]))
    if body.document_ids and not sources:
        raise HTTPException(status_code=404, detail="No accessible document was found for the supplied ids.")
    if not sources:
        raise HTTPException(status_code=422, detail="Provide at least one document (text or document_ids).")
    hits = retrieve("\n\n".join(sources), body.question, top_k=body.top_k)
    return RagQueryResponse(question=body.question, hits=[RagHit(key=h.key, label=h.label, text=h.text, score=h.score, reason=h.reason) for h in hits])
