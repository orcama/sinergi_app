from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from app.config import MODEL_ID, VLLM_BASE_URL, current_public_url
from app.middleware.cors import register_cors
from app.routes.auth_routes import router as auth_router
from app.routes.chat_routes import router as chat_router
from app.routes.library_routes import router as library_router
from app.routes.project_routes import router as project_router
from app.routes.rag_routes import router as rag_router
from app.routes.system_routes import router as system_router
from app.vllm_on_demand import VllmOnDemandConfig, VllmOnDemandManager


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http = httpx.AsyncClient(timeout=float(__import__("os").getenv("REQUEST_TIMEOUT_SECONDS", "300")))
    app.state.rag_docs = {}
    app.state.vllm_manager = VllmOnDemandManager(VllmOnDemandConfig.from_env(VLLM_BASE_URL, MODEL_ID))
    app.state.background_tasks: set[asyncio.Task] = set()
    public_url = current_public_url()
    print(f"Public API URL: {public_url}" if public_url else "Public API URL is not ready yet", flush=True)
    try:
        yield
    finally:
        await app.state.vllm_manager.shutdown()
        await app.state.http.aclose()


app = FastAPI(title="Sinergi API", version="0.1.0", lifespan=lifespan)
register_cors(app)
app.include_router(system_router)
app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(rag_router)
app.include_router(library_router)
app.include_router(project_router)

# Compatibility exports for existing backend consumers and tests.
from app.config import (  # noqa: E402,F401
    DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT, INDONESIAN_REASONING_INSTRUCTION,
    MODEL_ID, PROVIDER_BY_ID, WANDB_MODEL_ID, build_system_prompt,
    current_public_url, load_providers,
)
from app.services.content_service import extract_pdf_text, flatten_content  # noqa: E402,F401
from app.core.firebase import db  # noqa: E402,F401
