from __future__ import annotations

import base64
import io
import json
import os
import re
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from firebase_admin import firestore
from pydantic import BaseModel, Field, ValidationError
from pypdf import PdfReader

from app.core.auth import get_current_user
from app.core.firebase import db
from app.rag import SECTION_LABELS, retrieve, sectionize

DEFAULT_MODEL = "mlx-community/DeepSeek-R1-Distill-Qwen-1.5B-4bit"
DEFAULT_WANDB_MODEL = "MiniMaxAI/MiniMax-M3"
DEFAULT_SYSTEM_PROMPT = (
    "Anda adalah LEGAL-VERSE AI, asisten analisis hukum Indonesia. "
    "Jawab dengan jelas dalam bahasa pengguna, nyatakan ketidakpastian, dan jangan "
    "mengarang nomor putusan, kutipan, sumber, atau fakta hukum. Ingatkan pengguna "
    "bahwa jawaban bukan pengganti nasihat hukum profesional bila relevan."
)


def env_list(name: str, default: str) -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


def wandb_key_from_models_md() -> str:
    """Read WANDB_API_KEY embedded in backend/models.md (dev/test convenience)."""
    models_md = Path(__file__).resolve().parent.parent / "models.md"
    if not models_md.is_file():
        return ""
    match = re.search(r"WANDB_API_KEY\s*=\s*(\S+)", models_md.read_text(encoding="utf-8"))
    return match.group(1) if match else ""


def context_window_from_models_md(default: int = 262_000) -> int:
    """Read the deployed model's context window (e.g. ``262k``) from models.md."""
    models_md = Path(__file__).resolve().parent.parent / "models.md"
    if models_md.is_file():
        match = re.search(
            r"Context\s+window[^\d]*?(\d+(?:\.\d+)?)\s*k",
            models_md.read_text(encoding="utf-8"),
            re.IGNORECASE | re.DOTALL,
        )
        if match:
            return int(float(match.group(1)) * 1000)
    return default


VLLM_BASE_URL = os.getenv("VLLM_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
MODEL_ID = os.getenv("MODEL_ID", DEFAULT_MODEL)
SYSTEM_PROMPT = os.getenv("CHAT_SYSTEM_PROMPT", DEFAULT_SYSTEM_PROMPT)
REQUEST_TIMEOUT_SECONDS = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "300"))


def discover_vllm_model() -> str:
    """Query the vLLM server for the model it is actually serving.

    Uses ``GET {VLLM_BASE_URL}/v1/models`` so the gateway adapts to whatever
    model vLLM is running (e.g. a swapped Gemma build) instead of relying on a
    hardcoded MODEL_ID. Falls back to MODEL_ID when vLLM is unreachable or the
    endpoint reports no model.
    """
    try:
        resp = httpx.get(
            f"{VLLM_BASE_URL}/v1/models",
            timeout=min(REQUEST_TIMEOUT_SECONDS, 10),
        )
        resp.raise_for_status()
        data = resp.json()
        model_list = data.get("data") or []
        if model_list:
            return str(model_list[0]["id"])
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        pass
    return MODEL_ID


WANDB_BASE_URL = os.getenv("WANDB_BASE_URL", "https://api.inference.wandb.ai").rstrip("/")
WANDB_MODEL_ID = os.getenv("WANDB_MODEL_ID", DEFAULT_WANDB_MODEL)
WANDB_API_KEY = os.getenv("WANDB_API_KEY", "") or wandb_key_from_models_md()
DEFAULT_PROVIDER = os.getenv("DEFAULT_PROVIDER", "vllm")


class ProviderConfig(BaseModel):
    id: str
    name: str
    model: str
    base_url: str
    kind: Literal["vllm", "wandb"]
    supports_images: bool = False
    api_key_env: str | None = None
    context_window: int = 128_000


LOCAL_CONTEXT_WINDOW = 128_000


def _default_providers() -> list[ProviderConfig]:
    return [
        ProviderConfig(
            id="vllm",
            name="vLLM (Local)",
            model=discover_vllm_model(),
            base_url=VLLM_BASE_URL,
            kind="vllm",
            supports_images=False,
            context_window=LOCAL_CONTEXT_WINDOW,
        ),
        ProviderConfig(
            id="wandb",
            name="WandB (MiniMax M3)",
            model=WANDB_MODEL_ID,
            base_url=WANDB_BASE_URL,
            kind="wandb",
            supports_images=True,
            api_key_env="WANDB_API_KEY",
            context_window=context_window_from_models_md(),
        ),
    ]


def load_providers() -> list[ProviderConfig]:
    """Build the provider list from the MODEL_PROVIDERS JSON env var.

    Each entry: {"id", "name", "model", "base_url", "kind" ("vllm"|"wandb"),
    "supports_images", "api_key_env"}. If the var is unset, falls back to the
    default vLLM + WandB pair.
    """
    raw = os.getenv("MODEL_PROVIDERS", "").strip()
    if not raw:
        return _default_providers()
    try:
        data = json.loads(raw)
        providers = [ProviderConfig.model_validate(item) for item in data]
    except (json.JSONDecodeError, ValidationError) as exc:
        raise RuntimeError("MODEL_PROVIDERS env var is not valid provider JSON") from exc

    # Never hardcode the served model for local vLLM: pick up whatever the
    # server is actually running, so swapping the model does not need a config
    # change.
    discovered = discover_vllm_model()
    for provider in providers:
        if provider.kind == "vllm":
            provider.model = discovered
    return providers


PROVIDERS = load_providers()
PROVIDER_BY_ID = {provider.id: provider for provider in PROVIDERS}
if DEFAULT_PROVIDER not in PROVIDER_BY_ID:
    DEFAULT_PROVIDER = PROVIDERS[0].id if PROVIDERS else "vllm"


def provider_api_key(provider: ProviderConfig) -> str:
    if provider.api_key_env:
        value = os.getenv(provider.api_key_env, "").strip()
        if value:
            return value
    return WANDB_API_KEY if provider.kind == "wandb" else ""


class TextPart(BaseModel):
    type: Literal["text"] = "text"
    text: str = Field(min_length=1, max_length=32_000)


class ImageUrlPart(BaseModel):
    type: Literal["image_url"] = "image_url"
    image_url: str | dict[str, str] = Field(min_length=1)


class PdfPart(BaseModel):
    type: Literal["pdf"] = "pdf"
    name: str = Field(min_length=1, max_length=255)
    data: str = Field(min_length=1, max_length=10_000_000)


ContentPart = Annotated[
    TextPart | ImageUrlPart | PdfPart, Field(discriminator="type")
]


class Message(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str | list[ContentPart]


class ChatRequest(BaseModel):
    provider: str = DEFAULT_PROVIDER
    messages: list[Message] = Field(min_length=1, max_length=50)
    temperature: float = Field(default=0.6, ge=0, le=2)
    max_tokens: int = Field(default=1024, ge=1, le=4096)


class ChatResponse(BaseModel):
    message: Message
    model: str
    provider: str


class RagIngestRequest(BaseModel):
    name: str = Field(default="dokumen.pdf", min_length=1, max_length=255)
    data: str = Field(min_length=1, max_length=10_000_000)


class RagSection(BaseModel):
    key: str
    label: str
    text: str


class RagIngestResponse(BaseModel):
    id: str
    name: str
    char_count: int
    sections: list[RagSection]


class RagQueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2_000)
    document_ids: list[str] = Field(default_factory=list, max_length=10)
    text: str | None = Field(default=None, max_length=1_000_000)
    top_k: int = Field(default=3, ge=1, le=10)


class RagHit(BaseModel):
    key: str
    label: str
    text: str
    score: float
    reason: str


class RagQueryResponse(BaseModel):
    question: str
    hits: list[RagHit]


class PdfExtractResponse(BaseModel):
    name: str
    text: str
    char_count: int


def extract_pdf_text(data: str, max_chars: int = 32_000, collapse: bool = True) -> str:
    """Extract text from a base64-encoded PDF (with optional data: prefix).

    When ``collapse`` is True (default, used for chat context) all whitespace
    runs are collapsed to single spaces. Pass ``collapse=False`` to preserve
    line breaks for the section-aware RAG pipeline.
    """
    if "," in data and data.startswith("data:"):
        data = data.split(",", 1)[1]
    try:
        raw = base64.b64decode(data)
        reader = PdfReader(io.BytesIO(raw))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception:
        return ""
    if collapse:
        text = " ".join(text.split())
    return text[:max_chars]


def expand_content(content: str | list[ContentPart] | list[dict]) -> str | list[dict]:
    """Resolve PDF parts into text so every provider receives readable content.

    Returns a plain string when only text is present, otherwise a list of
    OpenAI-style content parts (text + image_url).
    """
    if isinstance(content, str):
        return content

    parts: list[dict] = []
    for raw_part in content:
        if isinstance(raw_part, TextPart):
            parts.append({"type": "text", "text": raw_part.text})
        elif isinstance(raw_part, ImageUrlPart):
            parts.append({"type": "image_url", "image_url": raw_part.image_url})
        elif isinstance(raw_part, PdfPart):
            extracted = extract_pdf_text(raw_part.data)
            parts.append(
                {
                    "type": "text",
                    "text": (
                        f"Konteks:\n{extracted}"
                        if extracted
                        else f"[PDF tidak terbaca: {raw_part.name}]"
                    ),
                }
            )
        elif isinstance(raw_part, dict):
            part_type = raw_part.get("type")
            if part_type == "text":
                parts.append({"type": "text", "text": raw_part.get("text", "")})
            elif part_type == "image_url":
                parts.append({"type": "image_url", "image_url": raw_part.get("image_url", "")})
            elif part_type == "pdf":
                name = raw_part.get("name", "dokumen.pdf")
                extracted = extract_pdf_text(raw_part.get("data", ""))
                parts.append(
                    {
                        "type": "text",
                        "text": (
                            f"Konteks:\n{extracted}"
                            if extracted
                            else f"[PDF tidak terbaca: {name}]"
                        ),
                    }
                )

    if len(parts) == 1 and parts[0]["type"] == "text":
        return parts[0]["text"]
    return parts


def flatten_content(content: str | list[ContentPart]) -> str:
    """Reduce multimodal content to plain text (used for text-only providers)."""
    expanded = expand_content(content)
    if isinstance(expanded, str):
        return expanded
    return "\n".join(
        part.get("text", "")
        for part in expanded
        if isinstance(part, dict) and part.get("type") == "text"
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http = httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS)
    app.state.rag_docs: dict[str, dict] = {}
    yield
    await app.state.http.aclose()


app = FastAPI(
    title="Sinergi API",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=env_list(
        "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/health")
async def health(request: Request) -> JSONResponse:
    vllm = PROVIDER_BY_ID.get("vllm")
    base_url = vllm.base_url if vllm else VLLM_BASE_URL
    model = vllm.model if vllm else MODEL_ID
    try:
        response = await request.app.state.http.get(f"{base_url}/health")
        ready = response.is_success
    except httpx.HTTPError:
        ready = False

    return JSONResponse(
        status_code=200 if ready else 503,
        content={
            "status": "ready" if ready else "model_server_unavailable",
            "model": model,
            "vllm_base_url": base_url,
            "wandb_configured": bool(WANDB_API_KEY),
            "wandb_model": WANDB_MODEL_ID,
        },
    )


@app.post("/auth/sync")
async def sync_user(user: dict = Depends(get_current_user)):
    user_ref = db.collection("users").document(user["uid"])
    user_ref.set(
        {
            "email": user.get("email"),
            "name": user.get("name", ""),
            "last_login": firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )
    return {"uid": user["uid"], "email": user["email"]}


@app.get("/api/models")
async def list_models() -> JSONResponse:
    return JSONResponse(
        content={
            "default": DEFAULT_PROVIDER,
            "providers": [
                {
                    "id": provider.id,
                    "name": provider.name,
                    "model": provider.model,
                    "kind": provider.kind,
                    "supports_images": provider.supports_images,
                    "context_window": provider.context_window,
                    "configured": bool(provider_api_key(provider)),
                }
                for provider in PROVIDERS
            ],
        }
    )


@app.post("/api/chat", response_model=ChatResponse)
async def chat(body: ChatRequest, request: Request) -> ChatResponse:
    provider = PROVIDER_BY_ID.get(body.provider)
    if provider is None:
        available = ", ".join(PROVIDER_BY_ID) or "none"
        raise HTTPException(
            status_code=400,
            detail=f"Unknown provider '{body.provider}'. Available: {available}.",
        )

    api_key = provider_api_key(provider)
    if provider.kind == "wandb" and not api_key:
        raise HTTPException(
            status_code=503,
            detail=f"Provider '{provider.id}' is not configured (missing API key).",
        )

    provider_name = provider.name
    url = f"{provider.base_url}/v1/chat/completions"
    if provider.kind == "wandb":
        headers = {"Authorization": f"Bearer {api_key}"}
        messages = [
            {"role": message.role, "content": expand_content(message.content)}
            for message in body.messages
        ]
    else:
        headers = {}
        messages = [
            {"role": message.role, "content": flatten_content(message.content)}
            for message in body.messages
        ]

    if SYSTEM_PROMPT and not any(message["role"] == "system" for message in messages):
        messages.insert(0, {"role": "system", "content": SYSTEM_PROMPT})

    try:
        response = await request.app.state.http.post(
            url,
            headers=headers,
            json={
                "model": provider.model,
                "messages": messages,
                "temperature": body.temperature,
                "max_tokens": body.max_tokens,
                "stream": False,
            },
        )
        response.raise_for_status()
    except httpx.ConnectError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"The {provider_name} model server is not reachable.",
        ) from exc
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="The model request timed out.") from exc
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:1000] or f"{provider_name} rejected the request."
        raise HTTPException(status_code=502, detail=detail) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach {provider_name}.") from exc

    try:
        data = response.json()
        raw_content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"{provider_name} returned an invalid response.") from exc

    if isinstance(raw_content, str):
        content = raw_content.strip()
    elif isinstance(raw_content, list):
        content = "".join(
            part.get("text", "")
            for part in raw_content
            if isinstance(part, dict) and part.get("type") == "text"
        ).strip()
    else:
        content = ""

    if not content:
        raise HTTPException(status_code=502, detail=f"{provider_name} returned an empty response.")

    return ChatResponse(
        message=Message(role="assistant", content=content),
        model=data.get("model", provider.model),
        provider=body.provider,
    )


def _rag_text_for(doc: dict) -> str:
    """Plain text of an ingested RAG document (already extracted)."""
    return doc.get("text", "")


@app.post("/api/pdf/extract", response_model=PdfExtractResponse)
async def pdf_extract(body: RagIngestRequest) -> PdfExtractResponse:
    """Extract raw text from a base64 PDF without storing it (used for preview)."""
    text = extract_pdf_text(body.data, max_chars=1_000_000, collapse=False)
    if not text:
        raise HTTPException(
            status_code=422,
            detail=f"PDF '{body.name}' tidak dapat dibaca (tidak ada teks ter-extract).",
        )
    return PdfExtractResponse(name=body.name, text=text, char_count=len(text))


@app.post("/api/rag/ingest", response_model=RagIngestResponse)
async def rag_ingest(body: RagIngestRequest, request: Request) -> RagIngestResponse:
    """Extract and sectionize a base64 PDF, keeping it for later RAG queries."""
    text = extract_pdf_text(body.data, max_chars=1_000_000, collapse=False)
    if not text:
        raise HTTPException(
            status_code=422,
            detail=f"PDF '{body.name}' tidak dapat dibaca (tidak ada teks ter-extract).",
        )
    sections = sectionize(text)
    doc_id = str(uuid.uuid4())
    request.app.state.rag_docs[doc_id] = {"name": body.name, "text": text}
    return RagIngestResponse(
        id=doc_id,
        name=body.name,
        char_count=len(text),
        sections=[
            RagSection(key=key, label=SECTION_LABELS.get(key, key), text=span)
            for key, span in sections.items()
            if span and span.strip()
        ],
    )


@app.post("/api/rag/query", response_model=RagQueryResponse)
async def rag_query(body: RagQueryRequest, request: Request) -> RagQueryResponse:
    """Retrieve the most relevant sections of a stored (or inline) document."""
    sources: list[str] = []
    if body.text:
        sources.append(body.text)
    for doc_id in body.document_ids:
        doc = request.app.state.rag_docs.get(doc_id)
        if doc is None:
            raise HTTPException(
                status_code=404,
                detail=f"Unknown RAG document id '{doc_id}'.",
            )
        sources.append(_rag_text_for(doc))
    if not sources:
        raise HTTPException(
            status_code=422,
            detail="Provide at least one document (text or document_ids).",
        )

    text = "\n\n".join(sources)
    hits = retrieve(text, body.question, top_k=body.top_k)
    return RagQueryResponse(
        question=body.question,
        hits=[
            RagHit(
                key=hit.key,
                label=hit.label,
                text=hit.text,
                score=hit.score,
                reason=hit.reason,
            )
            for hit in hits
        ],
    )