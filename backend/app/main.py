from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

DEFAULT_MODEL = "mlx-community/DeepSeek-R1-Distill-Qwen-1.5B-4bit"
DEFAULT_SYSTEM_PROMPT = (
    "Anda adalah LEGAL-VERSE AI, asisten analisis hukum Indonesia. "
    "Jawab dengan jelas dalam bahasa pengguna, nyatakan ketidakpastian, dan jangan "
    "mengarang nomor putusan, kutipan, sumber, atau fakta hukum. Ingatkan pengguna "
    "bahwa jawaban bukan pengganti nasihat hukum profesional bila relevan."
)


def env_list(name: str, default: str) -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


VLLM_BASE_URL = os.getenv("VLLM_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
MODEL_ID = os.getenv("MODEL_ID", DEFAULT_MODEL)
SYSTEM_PROMPT = os.getenv("CHAT_SYSTEM_PROMPT", DEFAULT_SYSTEM_PROMPT)
REQUEST_TIMEOUT_SECONDS = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "300"))


class Message(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1, max_length=32_000)


class ChatRequest(BaseModel):
    messages: list[Message] = Field(min_length=1, max_length=50)
    temperature: float = Field(default=0.6, ge=0, le=2)
    max_tokens: int = Field(default=1024, ge=1, le=4096)


class ChatResponse(BaseModel):
    message: Message
    model: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http = httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS)
    yield
    await app.state.http.aclose()


app = FastAPI(
    title="Sinergi Chat API",
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
    allow_headers=["Content-Type"],
)


@app.get("/health")
async def health(request: Request) -> JSONResponse:
    try:
        response = await request.app.state.http.get(f"{VLLM_BASE_URL}/health")
        ready = response.is_success
    except httpx.HTTPError:
        ready = False

    return JSONResponse(
        status_code=200 if ready else 503,
        content={
            "status": "ready" if ready else "model_server_unavailable",
            "model": MODEL_ID,
            "vllm_base_url": VLLM_BASE_URL,
        },
    )


@app.post("/api/chat", response_model=ChatResponse)
async def chat(body: ChatRequest, request: Request) -> ChatResponse:
    messages = [message.model_dump() for message in body.messages]
    if SYSTEM_PROMPT and not any(message["role"] == "system" for message in messages):
        messages.insert(0, {"role": "system", "content": SYSTEM_PROMPT})

    try:
        response = await request.app.state.http.post(
            f"{VLLM_BASE_URL}/v1/chat/completions",
            json={
                "model": MODEL_ID,
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
            detail="The vLLM model server is not running on the configured address.",
        ) from exc
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="The model request timed out.") from exc
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:1000] or "vLLM rejected the request."
        raise HTTPException(status_code=502, detail=detail) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not reach vLLM.") from exc

    try:
        data = response.json()
        content = data["choices"][0]["message"]["content"].strip()
    except (AttributeError, KeyError, IndexError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="vLLM returned an invalid response.") from exc

    if not content:
        raise HTTPException(status_code=502, detail="vLLM returned an empty response.")

    return ChatResponse(
        message=Message(role="assistant", content=content),
        model=data.get("model", MODEL_ID),
    )
