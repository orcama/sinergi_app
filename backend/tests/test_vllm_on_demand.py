from __future__ import annotations

import asyncio
from unittest import mock

import httpx
import pytest

from app.vllm_on_demand import VllmOnDemandConfig, VllmOnDemandManager


class FakeProcess:
    pid = 4242

    def __init__(self) -> None:
        self.returncode = None

    async def wait(self) -> int:
        self.returncode = 0
        return 0


@pytest.mark.asyncio
async def test_manager_starts_on_first_request_and_stops_when_idle(tmp_path) -> None:
    executable = tmp_path / "vllm"
    executable.write_text("fake executable", encoding="utf-8")
    config = VllmOnDemandConfig(
        enabled=True,
        command=(str(executable), "serve", "test-model"),
        health_url="http://127.0.0.1:8000/health",
        idle_timeout=0.01,
        startup_timeout=1,
        poll_interval=0,
        log_path=tmp_path / "vllm.log",
    )
    checks = 0

    async def health_handler(request: httpx.Request) -> httpx.Response:
        nonlocal checks
        checks += 1
        if checks == 1:
            raise httpx.ConnectError("sleeping", request=request)
        return httpx.Response(200)

    process = FakeProcess()
    manager = VllmOnDemandManager(config)
    async with httpx.AsyncClient(transport=httpx.MockTransport(health_handler)) as client:
        with (
            mock.patch(
                "app.vllm_on_demand.asyncio.create_subprocess_exec",
                new=mock.AsyncMock(return_value=process),
            ) as spawn,
            mock.patch("app.vllm_on_demand.os.killpg") as killpg,
        ):
            await manager.acquire(client)
            assert manager.status == "ready"
            assert manager.active_requests == 1
            spawn.assert_awaited_once()

            await manager.release()
            await asyncio.sleep(0.03)

            assert manager.status == "stopped"
            assert manager.active_requests == 0
            killpg.assert_called_once()


@pytest.mark.asyncio
async def test_manager_never_stops_an_external_vllm(tmp_path) -> None:
    config = VllmOnDemandConfig(
        enabled=True,
        command=(str(tmp_path / "unused"),),
        health_url="http://127.0.0.1:8000/health",
        idle_timeout=0,
        startup_timeout=1,
        poll_interval=0,
        log_path=tmp_path / "vllm.log",
    )

    async def ready(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200)

    manager = VllmOnDemandManager(config)
    async with httpx.AsyncClient(transport=httpx.MockTransport(ready)) as client:
        with (
            mock.patch("app.vllm_on_demand.asyncio.create_subprocess_exec") as spawn,
            mock.patch("app.vllm_on_demand.os.killpg") as killpg,
        ):
            await manager.acquire(client)
            await manager.release()
            await asyncio.sleep(0)

            assert manager.status == "external"
            spawn.assert_not_called()
            killpg.assert_not_called()
