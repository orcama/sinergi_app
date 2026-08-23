from __future__ import annotations

import json

import httpx
from fastapi import HTTPException, Request
from fastapi.responses import StreamingResponse

from app.config import MODEL_ID, PROVIDER_BY_ID, SYSTEM_PROMPT, VLLM_BASE_URL, _vllm_model_cache, provider_api_key, resolve_vllm_model
from app.schemas import ChatRequest, ChatResponse, Message, ProviderConfig
from app.services.content_service import expand_content, flatten_content
from app.vllm_on_demand import VllmOnDemandManager, VllmStartupError


async def _prepare(body: ChatRequest, request: Request):
    provider = PROVIDER_BY_ID.get(body.provider)
    if provider is None:
        raise HTTPException(status_code=400, detail=f"Unknown provider '{body.provider}'. Available: {', '.join(PROVIDER_BY_ID) or 'none'}.")
    key = provider_api_key(provider)
    if provider.kind == "wandb" and not key:
        raise HTTPException(status_code=503, detail=f"Provider '{provider.id}' is not configured (missing API key).")
    model = (await resolve_vllm_model(request.app.state.http) or provider.model) if provider.kind == "vllm" else provider.model
    messages = [{"role": m.role, "content": expand_content(m.content) if provider.kind == "wandb" else flatten_content(m.content)} for m in body.messages]
    if SYSTEM_PROMPT and not any(m["role"] == "system" for m in messages):
        messages.insert(0, {"role": "system", "content": SYSTEM_PROMPT})
    return provider, model, f"{provider.base_url}/v1/chat/completions", ({"Authorization": f"Bearer {key}"} if provider.kind == "wandb" else {}), messages


async def _acquire(body: ChatRequest, request: Request):
    provider = PROVIDER_BY_ID.get(body.provider)
    manager: VllmOnDemandManager | None = getattr(request.app.state, "vllm_manager", None)
    if provider is None or provider.kind != "vllm" or manager is None:
        return None
    try:
        await manager.acquire(request.app.state.http)
    except VllmStartupError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    _vllm_model_cache.clear()
    return manager


def _raise_provider_error(exc: Exception, name: str) -> None:
    if isinstance(exc, httpx.ConnectError):
        raise HTTPException(status_code=503, detail=f"The {name} model server is not reachable.") from exc
    if isinstance(exc, httpx.TimeoutException):
        raise HTTPException(status_code=504, detail="The model request timed out.") from exc
    if isinstance(exc, httpx.HTTPStatusError):
        raise HTTPException(status_code=502, detail=exc.response.text[:1000] or f"{name} rejected the request.") from exc
    if isinstance(exc, httpx.HTTPError):
        raise HTTPException(status_code=502, detail=f"Could not reach {name}.") from exc


def _text(value) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        return "".join(p.get("text", "") for p in value if isinstance(p, dict) and p.get("type") == "text").strip()
    return ""


async def chat(body: ChatRequest, request: Request) -> ChatResponse:
    manager = await _acquire(body, request)
    try:
        provider, model, url, headers, messages = await _prepare(body, request)
        try:
            response = await request.app.state.http.post(url, headers=headers, json={"model": model, "messages": messages, "temperature": body.temperature, "max_tokens": body.max_tokens, "stream": False})
            response.raise_for_status()
        except httpx.HTTPError as exc:
            _raise_provider_error(exc, provider.name)
        try:
            data = response.json()
            message = data["choices"][0]["message"]
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise HTTPException(status_code=502, detail=f"{provider.name} returned an invalid response.") from exc
        content = _text(message.get("content"))
        if not content:
            raise HTTPException(status_code=502, detail=f"{provider.name} returned an empty response.")
        return ChatResponse(message=Message(role="assistant", content=content, thinking=_text(message.get("reasoning_content") or message.get("reasoning")) or None), model=data.get("model", provider.model), provider=body.provider)
    finally:
        if manager is not None:
            await manager.release()


def _event(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def chat_stream(body: ChatRequest, request: Request) -> StreamingResponse:
    manager = await _acquire(body, request)
    try:
        provider, model, url, headers, messages = await _prepare(body, request)
    except Exception:
        if manager is not None:
            await manager.release()
        raise

    async def stream():
        try:
            async with request.app.state.http.stream("POST", url, headers=headers, json={"model": model, "messages": messages, "temperature": body.temperature, "max_tokens": body.max_tokens, "stream": True}) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    if raw == "[DONE]":
                        break
                    try:
                        delta = json.loads(raw)["choices"][0]["delta"]
                    except (json.JSONDecodeError, KeyError, IndexError, TypeError):
                        continue
                    if thinking := (delta.get("reasoning_content") or delta.get("reasoning")):
                        yield _event({"type": "thinking", "content": thinking})
                    if content := delta.get("content"):
                        yield _event({"type": "answer", "content": content})
            yield _event({"type": "done", "model": model})
        except Exception as exc:
            yield _event({"type": "error", "content": f"{provider.name} stream failed: {exc}"})
        finally:
            if manager is not None:
                await manager.release()

    return StreamingResponse(stream(), headers={"Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"})
