from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path

import httpx
from pydantic import ValidationError

from app.schemas import ProviderConfig

DEFAULT_MODEL = os.getenv("MODEL_ID", "").strip()
DEFAULT_WANDB_MODEL = os.getenv("WANDB_MODEL_ID", "").strip()
DEFAULT_SYSTEM_PROMPT = (
    "Anda adalah LEGAL-VERSE AI, asisten analisis hukum Indonesia. "
    "Jawab dengan jelas dalam bahasa pengguna, nyatakan ketidakpastian, dan jangan "
    "mengarang nomor putusan, kutipan, sumber, atau fakta hukum. Ingatkan pengguna "
    "bahwa jawaban bukan pengganti nasihat hukum profesional bila relevan."
)
VLLM_BASE_URL = os.getenv("VLLM_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
MODEL_ID = os.getenv("MODEL_ID", DEFAULT_MODEL)
SYSTEM_PROMPT = os.getenv("CHAT_SYSTEM_PROMPT", DEFAULT_SYSTEM_PROMPT)
REQUEST_TIMEOUT_SECONDS = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "300"))
WANDB_BASE_URL = os.getenv("WANDB_BASE_URL", "https://api.inference.wandb.ai").rstrip("/")
WANDB_MODEL_ID = os.getenv("WANDB_MODEL_ID", DEFAULT_WANDB_MODEL) or "MiniMaxAI/MiniMax-M3"
DEFAULT_PROVIDER = os.getenv("DEFAULT_PROVIDER", "vllm")
LOCAL_CONTEXT_WINDOW = int(os.getenv("VLLM_MAX_MODEL_LEN", "65536"))
_vllm_model_cache: dict[str, float | str] = {}
_VLLM_DISCOVERY_TTL = float(os.getenv("VLLM_DISCOVERY_TTL", "30"))


def env_list(name: str, default: str) -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


def current_public_url(log_path: Path | None = None) -> str:
    configured_path = os.getenv("PUBLIC_TUNNEL_LOG", "").strip()
    path = log_path or (Path(os.path.expanduser(configured_path)) if configured_path else None)
    path = path or Path(__file__).resolve().parent.parent / "logs" / "tunnel-error.log"
    try:
        matches = re.findall(r"https://[a-z-]+\.trycloudflare\.com", path.read_text(encoding="utf-8"))
    except OSError:
        return ""
    return matches[-1] if matches else ""


def wandb_key_from_models_md() -> str:
    path = Path(__file__).resolve().parent.parent / "models.md"
    if not path.is_file():
        return ""
    match = re.search(r"WANDB_API_KEY\s*=\s*(\S+)", path.read_text(encoding="utf-8"))
    return match.group(1) if match else ""


def context_window_from_models_md(default: int = 262_000) -> int:
    path = Path(__file__).resolve().parent.parent / "models.md"
    if path.is_file():
        match = re.search(r"Context\s+window[^\d]*?(\d+(?:\.\d+)?)\s*k", path.read_text(encoding="utf-8"), re.I | re.S)
        if match:
            return int(float(match.group(1)) * 1000)
    return default


def _vllm_models_endpoint() -> str:
    return f"{VLLM_BASE_URL}/v1/models"


def discover_vllm_model() -> str:
    now = time.monotonic()
    if isinstance(_vllm_model_cache.get("model"), str) and now - float(_vllm_model_cache.get("ts", 0)) < _VLLM_DISCOVERY_TTL:
        return str(_vllm_model_cache["model"])
    try:
        response = httpx.get(_vllm_models_endpoint(), timeout=min(REQUEST_TIMEOUT_SECONDS, 10))
        response.raise_for_status()
        models = response.json().get("data") or []
        if models:
            model = str(models[0]["id"])
            _vllm_model_cache.update(model=model, ts=time.monotonic())
            return model
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        pass
    _vllm_model_cache.update(model=MODEL_ID, ts=time.monotonic())
    return MODEL_ID


async def resolve_vllm_model(client: httpx.AsyncClient) -> str:
    now = time.monotonic()
    if isinstance(_vllm_model_cache.get("model"), str) and now - float(_vllm_model_cache.get("ts", 0)) < _VLLM_DISCOVERY_TTL:
        return str(_vllm_model_cache["model"])
    try:
        response = await client.get(_vllm_models_endpoint(), timeout=min(REQUEST_TIMEOUT_SECONDS, 10))
        response.raise_for_status()
        models = response.json().get("data") or []
        if models:
            model = str(models[0]["id"])
            _vllm_model_cache.update(model=model, ts=time.monotonic())
            return model
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        pass
    _vllm_model_cache.update(model=MODEL_ID, ts=time.monotonic())
    return MODEL_ID


WANDB_API_KEY = os.getenv("WANDB_API_KEY", "") or wandb_key_from_models_md()


def _default_providers() -> list[ProviderConfig]:
    return [
        ProviderConfig(id="vllm", name="vLLM (Local)", model=discover_vllm_model(), base_url=VLLM_BASE_URL, kind="vllm", context_window=LOCAL_CONTEXT_WINDOW),
        ProviderConfig(id="wandb", name="WandB (MiniMax M3)", model=WANDB_MODEL_ID, base_url=WANDB_BASE_URL, kind="wandb", supports_images=True, api_key_env="WANDB_API_KEY", context_window=context_window_from_models_md()),
    ]


def load_providers() -> list[ProviderConfig]:
    raw = os.getenv("MODEL_PROVIDERS", "").strip()
    if not raw:
        return _default_providers()
    try:
        providers = [ProviderConfig.model_validate(item) for item in json.loads(raw)]
    except (json.JSONDecodeError, ValidationError) as exc:
        raise RuntimeError("MODEL_PROVIDERS env var is not valid provider JSON") from exc
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
    if provider.api_key_env and (value := os.getenv(provider.api_key_env, "").strip()):
        return value
    return WANDB_API_KEY if provider.kind == "wandb" else ""
