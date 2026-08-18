from __future__ import annotations

import httpx
import pytest

from app.main import DEFAULT_SYSTEM_PROMPT, MODEL_ID, app


@pytest.mark.asyncio
async def test_chat_proxies_conversation_and_adds_system_prompt() -> None:
    async def vllm_handler(request: httpx.Request) -> httpx.Response:
        payload = __import__("json").loads(request.content)
        assert request.url.path == "/v1/chat/completions"
        assert payload["model"] == MODEL_ID
        assert payload["messages"][0] == {
            "role": "system",
            "content": DEFAULT_SYSTEM_PROMPT,
        }
        assert payload["messages"][1] == {"role": "user", "content": "Halo"}
        return httpx.Response(
            200,
            json={
                "model": MODEL_ID,
                "choices": [
                    {"message": {"role": "assistant", "content": "Halo juga."}}
                ],
            },
        )

    app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(vllm_handler))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/chat",
            json={"messages": [{"role": "user", "content": "Halo"}]},
        )
    await app.state.http.aclose()

    assert response.status_code == 200
    assert response.json() == {
        "message": {"role": "assistant", "content": "Halo juga."},
        "model": MODEL_ID,
    }


@pytest.mark.asyncio
async def test_chat_reports_model_server_connection_failure() -> None:
    async def unavailable(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline", request=request)

    app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(unavailable))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/chat",
            json={"messages": [{"role": "user", "content": "Halo"}]},
        )
    await app.state.http.aclose()

    assert response.status_code == 503
    assert "not running" in response.json()["detail"]
