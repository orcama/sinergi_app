from __future__ import annotations

import uuid

from fastapi import HTTPException, Request

from app.rag import SECTION_LABELS, retrieve, sectionize
from app.schemas import RagIngestRequest, RagIngestResponse, RagQueryRequest, RagQueryResponse, RagHit, RagSection, PdfExtractResponse
from app.services.content_service import estimate_tokens, extract_pdf_text


def pdf_extract(body: RagIngestRequest) -> PdfExtractResponse:
    text = extract_pdf_text(body.data, max_chars=1_000_000, collapse=False)
    if not text:
        raise HTTPException(status_code=422, detail=f"PDF '{body.name}' tidak dapat dibaca (tidak ada teks ter-extract).")
    return PdfExtractResponse(name=body.name, text=text, char_count=len(text), token_count=estimate_tokens(text))


def rag_ingest(body: RagIngestRequest, request: Request) -> RagIngestResponse:
    text = extract_pdf_text(body.data, max_chars=1_000_000, collapse=False)
    if not text:
        raise HTTPException(status_code=422, detail=f"PDF '{body.name}' tidak dapat dibaca (tidak ada teks ter-extract).")
    doc_id = str(uuid.uuid4())
    request.app.state.rag_docs[doc_id] = {"name": body.name, "text": text}
    return RagIngestResponse(id=doc_id, name=body.name, char_count=len(text), sections=[RagSection(key=key, label=SECTION_LABELS.get(key, key), text=span) for key, span in sectionize(text).items() if span and span.strip()])


def rag_query(body: RagQueryRequest, request: Request) -> RagQueryResponse:
    sources = [body.text] if body.text else []
    for doc_id in body.document_ids:
        doc = request.app.state.rag_docs.get(doc_id)
        if doc is None:
            raise HTTPException(status_code=404, detail=f"Unknown RAG document id '{doc_id}'.")
        sources.append(doc.get("text", ""))
    if not sources:
        raise HTTPException(status_code=422, detail="Provide at least one document (text or document_ids).")
    hits = retrieve("\n\n".join(sources), body.question, top_k=body.top_k)
    return RagQueryResponse(question=body.question, hits=[RagHit(key=h.key, label=h.label, text=h.text, score=h.score, reason=h.reason) for h in hits])
