from __future__ import annotations

import asyncio
import json
import os
import signal
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

# ``killpg`` is POSIX-only; keeping a module attribute on Windows also makes
# process termination easy to mock in the backend test suite.
if not hasattr(os, "killpg"):
    os.killpg = lambda *_args: None  # type: ignore[attr-defined]


class VllmStartupError(RuntimeError):
    """Raised when the on-demand vLLM process cannot become ready."""


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class VllmOnDemandConfig:
    enabled: bool
    command: tuple[str, ...]
    health_url: str
    idle_timeout: float
    startup_timeout: float
    poll_interval: float
    log_path: Path

    @classmethod
    def from_env(cls, base_url: str, model_id: str) -> "VllmOnDemandConfig":
        executable = os.path.expanduser(
            os.getenv("VLLM_EXECUTABLE", "~/.venv-vllm-metal/bin/vllm")
        )
        served_model = os.getenv("VLLM_SERVE_MODEL", model_id).strip() or model_id
        command = [
            executable,
            "serve",
            served_model,
            "--served-model-name",
            served_model,
            "--host",
            "127.0.0.1",
            "--port",
            "8000",
            "--max-model-len",
            os.getenv("VLLM_MAX_MODEL_LEN", "128000"),
            "--max-num-seqs",
            os.getenv("VLLM_MAX_NUM_SEQS", "1"),
            "--max-num-batched-tokens",
            os.getenv("VLLM_MAX_NUM_BATCHED_TOKENS", "512"),
        ]
        if _env_bool("VLLM_ENABLE_THINKING", True):
            command.extend(
                [
                    "--default-chat-template-kwargs",
                    '{"enable_thinking": true}',
                    "--reasoning-parser",
                    os.getenv("VLLM_REASONING_PARSER", "gemma4"),
                ]
            )

        extra_raw = os.getenv("VLLM_EXTRA_ARGS_JSON", "").strip()
        if extra_raw:
            try:
                extra = json.loads(extra_raw)
            except json.JSONDecodeError as exc:
                raise RuntimeError("VLLM_EXTRA_ARGS_JSON must be valid JSON") from exc
            if not isinstance(extra, list) or not all(
                isinstance(arg, str) for arg in extra
            ):
                raise RuntimeError("VLLM_EXTRA_ARGS_JSON must be a JSON array of strings")
            command.extend(extra)

        default_log = Path(__file__).resolve().parent.parent / "logs" / "vllm.log"
        return cls(
            enabled=_env_bool("VLLM_ON_DEMAND", False),
            command=tuple(command),
            health_url=f"{base_url.rstrip('/')}/health",
            idle_timeout=float(os.getenv("VLLM_IDLE_TIMEOUT_SECONDS", "300")),
            startup_timeout=float(os.getenv("VLLM_STARTUP_TIMEOUT_SECONDS", "600")),
            poll_interval=float(os.getenv("VLLM_STARTUP_POLL_SECONDS", "1")),
            log_path=Path(
                os.path.expanduser(os.getenv("VLLM_LOG_PATH", str(default_log)))
            ),
        )

    @staticmethod
    def child_environment() -> dict[str, str]:
        """Return the explicit Metal settings required by the child server."""
        environment = os.environ.copy()
        environment.setdefault("VLLM_METAL_USE_PAGED_ATTENTION", "1")
        environment.setdefault("VLLM_METAL_MEMORY_FRACTION", "0.90")
        environment.setdefault("VLLM_MLX_DEVICE", "gpu")
        return environment


class VllmOnDemandManager:
    """Cold-start vLLM for local requests and stop it after an idle period.

    The FastAPI gateway stays resident and lightweight. Only a process started
    by this manager is stopped; a vLLM server started manually is never killed.
    """

    def __init__(self, config: VllmOnDemandConfig):
        self.config = config
        self._process: asyncio.subprocess.Process | None = None
        self._log_file: Any | None = None
        self._lock = asyncio.Lock()
        self._idle_task: asyncio.Task | None = None
        self._active_requests = 0
        self._owned = False
        self._status = "stopped" if config.enabled else "disabled"

    @property
    def status(self) -> str:
        if self._process is not None and self._process.returncode is not None:
            return "stopped"
        return self._status

    @property
    def active_requests(self) -> int:
        return self._active_requests

    async def _is_ready(self, client: httpx.AsyncClient) -> bool:
        try:
            response = await client.get(self.config.health_url, timeout=2)
            return response.is_success
        except httpx.HTTPError:
            return False

    async def acquire(self, client: httpx.AsyncClient) -> None:
        """Ensure vLLM is ready and hold an activity lease for one request."""
        async with self._lock:
            self._cancel_idle_task()
            if not await self._is_ready(client):
                if not self.config.enabled:
                    return
                await self._start_locked(client)
            elif self._process is None:
                self._owned = False
                self._status = "external"
            self._active_requests += 1

    async def release(self) -> None:
        """Release a request lease and arm idle shutdown when appropriate."""
        async with self._lock:
            self._active_requests = max(0, self._active_requests - 1)
            if self._active_requests == 0 and self._owned and self._process is not None:
                self._idle_task = asyncio.create_task(self._stop_after_idle())

    async def _start_locked(self, client: httpx.AsyncClient) -> None:
        if self._process is not None and self._process.returncode is None:
            return
        executable = Path(self.config.command[0])
        if not executable.is_file():
            raise VllmStartupError(f"vLLM executable not found: {executable}")

        self.config.log_path.parent.mkdir(parents=True, exist_ok=True)
        self._log_file = self.config.log_path.open("ab", buffering=0)
        self._status = "starting"
        try:
            self._process = await asyncio.create_subprocess_exec(
                *self.config.command,
                stdout=self._log_file,
                stderr=asyncio.subprocess.STDOUT,
                start_new_session=True,
                env=self.config.child_environment(),
            )
        except OSError as exc:
            self._close_log()
            self._status = "failed"
            raise VllmStartupError(f"could not start vLLM: {exc}") from exc

        self._owned = True
        deadline = asyncio.get_running_loop().time() + self.config.startup_timeout
        while asyncio.get_running_loop().time() < deadline:
            if self._process.returncode is not None:
                code = self._process.returncode
                self._status = "failed"
                self._close_log()
                raise VllmStartupError(
                    f"vLLM exited with code {code}; inspect {self.config.log_path}"
                )
            if await self._is_ready(client):
                self._status = "ready"
                return
            await asyncio.sleep(self.config.poll_interval)

        await self._terminate_locked()
        self._status = "failed"
        raise VllmStartupError(
            f"vLLM did not become ready within {self.config.startup_timeout:g}s; "
            f"inspect {self.config.log_path}"
        )

    async def _stop_after_idle(self) -> None:
        try:
            await asyncio.sleep(self.config.idle_timeout)
            async with self._lock:
                if self._active_requests == 0 and self._owned:
                    await self._terminate_locked()
        except asyncio.CancelledError:
            pass

    def _cancel_idle_task(self) -> None:
        if self._idle_task is not None:
            self._idle_task.cancel()
            self._idle_task = None

    async def _terminate_locked(self) -> None:
        process = self._process
        if process is None:
            return
        if process.returncode is None:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(process.wait(), timeout=15)
            except asyncio.TimeoutError:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                await process.wait()
        self._process = None
        self._owned = False
        self._status = "stopped"
        self._close_log()

    def _close_log(self) -> None:
        if self._log_file is not None:
            self._log_file.close()
            self._log_file = None

    async def shutdown(self) -> None:
        """Stop a manager-owned model process when the gateway exits."""
        async with self._lock:
            self._cancel_idle_task()
            if self._owned:
                await self._terminate_locked()

    def snapshot(self) -> dict[str, object]:
        return {
            "enabled": self.config.enabled,
            "status": self.status,
            "active_requests": self._active_requests,
            "idle_timeout_seconds": self.config.idle_timeout,
        }
