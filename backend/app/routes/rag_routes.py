from fastapi import APIRouter, Depends, Request

from app.core.auth import require_verified_user
from app.controllers.rag_controller import pdf_extract, rag_ingest, rag_query
from app.schemas import RagIngestRequest, RagQueryRequest, RagIngestResponse, RagQueryResponse, PdfExtractResponse

router = APIRouter()


@router.post("/api/pdf/extract", response_model=PdfExtractResponse)
async def pdf_extract_route(body: RagIngestRequest, user: dict = Depends(require_verified_user)):
    return pdf_extract(body)


@router.post("/api/rag/ingest", response_model=RagIngestResponse)
async def rag_ingest_route(body: RagIngestRequest, request: Request, user: dict = Depends(require_verified_user)):
    return rag_ingest(body, request)


@router.post("/api/rag/query", response_model=RagQueryResponse)
async def rag_query_route(body: RagQueryRequest, request: Request, user: dict = Depends(require_verified_user)):
    return rag_query(body, request, user)