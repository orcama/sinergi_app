from __future__ import annotations

import asyncio

import httpx
from fastapi import HTTPException, Request
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.config import (
    MODEL_ID, PROVIDER_BY_ID, PROVIDERS, VLLM_BASE_URL, WANDB_API_KEY, WANDB_MODEL_ID,
    _vllm_model_cache, provider_api_key, resolve_vllm_model,
)
from app.vllm_on_demand import VllmOnDemandManager


async def health(request: Request) -> JSONResponse:
    vllm = PROVIDER_BY_ID.get("vllm")
    base_url = vllm.base_url if vllm else VLLM_BASE_URL
    manager: VllmOnDemandManager | None = getattr(request.app.state, "vllm_manager", None)
    on_demand = manager.snapshot() if manager else {"enabled": False, "status": "disabled"}
    if on_demand["status"] in {"stopped", "starting", "failed"}:
        model, ready = MODEL_ID, False
    else:
        model = await resolve_vllm_model(request.app.state.http) if vllm else MODEL_ID
        try:
            ready = (await request.app.state.http.get(f"{base_url}/health")).is_success
        except httpx.HTTPError:
            ready = False
    gateway_ready = ready or bool(on_demand["enabled"])
    return JSONResponse(status_code=200 if gateway_ready else 503, content={"status": "ready" if gateway_ready else "model_server_unavailable", "vllm_ready": ready, "vllm_on_demand": on_demand, "model": model, "vllm_base_url": base_url, "wandb_configured": bool(WANDB_API_KEY), "wandb_model": WANDB_MODEL_ID})


async def list_models(request: Request) -> JSONResponse:
    providers = []
    for provider in PROVIDERS:
        model = await resolve_vllm_model(request.app.state.http) if provider.kind == "vllm" else provider.model
        providers.append({"id": provider.id, "name": provider.name, "model": model, "kind": provider.kind, "supports_images": provider.supports_images, "context_window": provider.context_window, "max_output_tokens": provider.max_output_tokens, "configured": provider.kind == "gradio" or bool(provider_api_key(provider))})
    from app.config import DEFAULT_PROVIDER
    return JSONResponse(content={"default": DEFAULT_PROVIDER, "providers": providers})


async def _warm_local_model(app: FastAPI) -> None:
    manager: VllmOnDemandManager = app.state.vllm_manager
    acquired = False
    try:
        await manager.acquire(app.state.http)
        acquired = True
        _vllm_model_cache.clear()
    finally:
        if acquired:
            await manager.release()


def _finish_background_task(app: FastAPI, task: asyncio.Task) -> None:
    app.state.background_tasks.discard(task)
    if not task.cancelled():
        task.exception()


async def wake_vllm(request: Request) -> JSONResponse:
    manager: VllmOnDemandManager | None = getattr(request.app.state, "vllm_manager", None)
    if manager is None or not manager.config.enabled:
        raise HTTPException(status_code=503, detail="On-demand vLLM is disabled.")
    snapshot = manager.snapshot()
    if snapshot["status"] in {"ready", "external"}:
        return JSONResponse(status_code=200, content=snapshot)
    if snapshot["status"] != "starting":
        task = asyncio.create_task(_warm_local_model(request.app))
        request.app.state.background_tasks.add(task)
        task.add_done_callback(lambda completed: _finish_background_task(request.app, completed))
    return JSONResponse(status_code=202, content=manager.snapshot())
