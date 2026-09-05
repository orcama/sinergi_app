from __future__ import annotations

import os
from typing import Any, Iterator

from gradio_client import Client

GRADIO_API_NAME = "/respond"


def _client(space: str) -> Client:
    token = os.getenv("GRADIO_HF_TOKEN", "").strip() or None
    return Client(space, token=token)


def gradio_respond(space: str, payload: dict[str, Any]) -> str:
    client = _client(space)
    result = client.predict(**{**payload, "api_name": GRADIO_API_NAME})
    return str(result)


def gradio_stream(space: str, payload: dict[str, Any]) -> Iterator[str]:
    client = _client(space)
    job = client.submit(**{**payload, "api_name": GRADIO_API_NAME})
    for value in job:
        yield str(value)