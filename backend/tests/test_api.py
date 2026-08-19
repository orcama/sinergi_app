from __future__ import annotations

import base64
import json
import os

import httpx
import pytest

from app.main import (
    DEFAULT_MODEL,
    DEFAULT_SYSTEM_PROMPT,
    MODEL_ID,
    WANDB_MODEL_ID,
    extract_pdf_text,
    flatten_content,
    load_providers,
    app,
)

MULTIMODAL_USER = {
    "role": "user",
    "content": [
        {"type": "text", "text": "Apa isi dokumen ini?"},
        {
            "type": "image_url",
            "image_url": {"url": "data:image/png;base64,AAAA"},
        },
    ],
}


def make_test_pdf(text: str) -> str:
    content = f"BT /F1 24 Tf 72 720 Td ({text}) Tj ET".encode("latin-1")
    body = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"
        ),
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = {}
    for num, obj in enumerate(body, start=1):
        offsets[num] = len(out)
        out += f"{num} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref_pos = len(out)
    count = len(body) + 1
    out += f"xref\n0 {count}\n".encode()
    out += b"0000000000 65535 f \n"
    for num in range(1, count):
        out += f"{offsets[num]:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {count} /Root 1 0 R >>\n"
        f"startxref\n{xref_pos}\n%%EOF\n".encode()
    )
    return f"data:application/pdf;base64,{base64.b64encode(bytes(out)).decode()}"


def teardown_provider_env() -> None:
    os.environ.pop("MODEL_PROVIDERS", None)


@pytest.mark.asyncio
async def test_chat_proxies_conversation_and_adds_system_prompt() -> None:
    async def vllm_handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        assert request.url.path == "/v1/chat/completions"
        assert request.url.host == "127.0.0.1"
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
            json={"provider": "vllm", "messages": [{"role": "user", "content": "Halo"}]},
        )
    await app.state.http.aclose()

    assert response.status_code == 200
    assert response.json() == {
        "message": {"role": "assistant", "content": "Halo juga."},
        "model": MODEL_ID,
        "provider": "vllm",
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
            json={"provider": "vllm", "messages": [{"role": "user", "content": "Halo"}]},
        )
    await app.state.http.aclose()

    assert response.status_code == 503
    assert "not reachable" in response.json()["detail"]


@pytest.mark.asyncio
async def test_wandb_provider_forward_multimodal_messages() -> None:
    async def wandb_handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        assert request.url.path == "/v1/chat/completions"
        assert request.url.host == "api.inference.wandb.ai"
        assert request.headers["authorization"].startswith("Bearer ")
        assert payload["model"] == WANDB_MODEL_ID
        assert payload["messages"][0] == {
            "role": "system",
            "content": DEFAULT_SYSTEM_PROMPT,
        }
        assert payload["messages"][1] == MULTIMODAL_USER
        return httpx.Response(
            200,
            json={
                "model": WANDB_MODEL_ID,
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": "Dokumen ini adalah surat keterangan.",
                        }
                    }
                ],
            },
        )

    app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(wandb_handler))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/chat",
            json={
                "provider": "wandb",
                "messages": [MULTIMODAL_USER],
            },
        )
    await app.state.http.aclose()

    assert response.status_code == 200
    assert response.json()["message"]["content"] == "Dokumen ini adalah surat keterangan."
    assert response.json()["provider"] == "wandb"


@pytest.mark.asyncio
async def test_vllm_provider_flattens_multimodal_content() -> None:
    async def vllm_handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        assert payload["messages"][1] == {
            "role": "user",
            "content": "Apa isi dokumen ini?",
        }
        return httpx.Response(
            200,
            json={
                "model": DEFAULT_MODEL,
                "choices": [
                    {"message": {"role": "assistant", "content": "Teks saja."}}
                ],
            },
        )

    app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(vllm_handler))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/chat",
            json={
                "provider": "vllm",
                "messages": [MULTIMODAL_USER],
            },
        )
    await app.state.http.aclose()

    assert response.status_code == 200
    assert response.json()["message"]["content"] == "Teks saja."


@pytest.mark.asyncio
async def test_models_endpoint_lists_providers() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/api/models")

    assert response.status_code == 200
    payload = response.json()
    ids = [provider["id"] for provider in payload["providers"]]
    assert "vllm" in ids
    assert "wandb" in ids
    wandb = next(p for p in payload["providers"] if p["id"] == "wandb")
    assert wandb["supports_images"] is True
    vllm = next(p for p in payload["providers"] if p["id"] == "vllm")
    assert vllm["supports_images"] is False


@pytest.mark.asyncio
async def test_unknown_provider_rejected() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/chat",
            json={
                "provider": "does-not-exist",
                "messages": [{"role": "user", "content": "Halo"}],
            },
        )

    assert response.status_code == 400
    assert "Unknown provider" in response.json()["detail"]


def test_load_providers_from_env_json() -> None:
    custom = json.dumps(
        [
            {
                "id": "my-model",
                "name": "My Custom Model",
                "model": "org/My-Model",
                "base_url": "http://example.test",
                "kind": "wandb",
                "supports_images": True,
                "api_key_env": "MY_API_KEY",
            }
        ]
    )
    os.environ["MODEL_PROVIDERS"] = custom
    try:
        providers = load_providers()
    finally:
        teardown_provider_env()

    assert len(providers) == 1
    assert providers[0].id == "my-model"
    assert providers[0].name == "My Custom Model"
    assert providers[0].supports_images is True


def test_extract_pdf_text_from_data_url() -> None:
    data_url = make_test_pdf("Putusan Nomor 123 TPPO")
    text = extract_pdf_text(data_url)
    assert "Putusan Nomor 123 TPPO" in text


def test_extract_pdf_text_handles_garbage() -> None:
    assert extract_pdf_text("not-a-real-pdf") == ""
    assert extract_pdf_text("data:application/pdf;base64,!!invalid!!") == ""


@pytest.mark.asyncio
async def test_wandb_provider_extracts_pdf_content() -> None:
    pdf = make_test_pdf("Kronologi kasus perdagangan orang")

    async def wandb_handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        user_content = payload["messages"][1]["content"]
        assert isinstance(user_content, list)
        pdf_text = next(
            part["text"] for part in user_content if part["type"] == "text"
        )
        assert "Kronologi kasus perdagangan orang" in pdf_text
        return httpx.Response(
            200,
            json={
                "model": WANDB_MODEL_ID,
                "choices": [
                    {"message": {"role": "assistant", "content": "Tersedia."}}
                ],
            },
        )

    app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(wandb_handler))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/chat",
            json={
                "provider": "wandb",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "pdf", "name": "dokumen.pdf", "data": pdf},
                            {"type": "text", "text": "Ringkas dokumen ini."},
                        ],
                    }
                ],
            },
        )
    await app.state.http.aclose()

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_vllm_provider_flattens_pdf_content() -> None:
    pdf = make_test_pdf("Pasal 2 ayat 1 UU TPPO")

    async def vllm_handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        user_content = payload["messages"][1]["content"]
        assert isinstance(user_content, str)
        assert "Pasal 2 ayat 1 UU TPPO" in user_content
        return httpx.Response(
            200,
            json={
                "model": DEFAULT_MODEL,
                "choices": [
                    {"message": {"role": "assistant", "content": "Teks saja."}}
                ],
            },
        )

    app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(vllm_handler))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/chat",
            json={
                "provider": "vllm",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "pdf", "name": "dokumen.pdf", "data": pdf},
                        ],
                    }
                ],
            },
        )
    await app.state.http.aclose()

    assert response.status_code == 200


def test_flatten_content_with_pdf() -> None:
    pdf = make_test_pdf("Isi surat")
    flattened = flatten_content(
        [
            {"type": "pdf", "name": "surat.pdf", "data": pdf},
            {"type": "text", "text": "Ringkas."},
        ]
    )
    assert isinstance(flattened, str)
    assert "Isi surat" in flattened
    assert "Ringkas." in flattened


LEGAL_PDF_TEXT = (
    "P U T U S A N\nNomor 123/Pid.B/2026/PN.JKT\nDEMI KEADILAN "
    "BERDASARKAN KETUHANAN YANG MAHA ESA\nM E N G A D I L I:\n"
    "1. Menyatakan Terdakwa bersalah melakukan tindak pidana penggelapan;"
)


@pytest.mark.asyncio
async def test_pdf_extract_endpoint_returns_text() -> None:
    pdf = make_test_pdf("Putusan Nomor 123/Pid.B/2026/PN.JKT")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/pdf/extract",
            json={"name": "putusan.pdf", "data": pdf},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["name"] == "putusan.pdf"
    assert "Putusan Nomor 123/Pid.B/2026/PN.JKT" in payload["text"]
    assert payload["char_count"] > 0


@pytest.mark.asyncio
async def test_pdf_extract_endpoint_reports_empty_pdf() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/pdf/extract",
            json={"name": "blank.pdf", "data": "not-a-real-pdf"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["text"] == ""
    assert payload["char_count"] == 0


@pytest.mark.asyncio
async def test_rag_ingest_sectionizes_pdf() -> None:
    pdf = make_test_pdf(LEGAL_PDF_TEXT)
    app.state.rag_docs = {}
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/rag/ingest",
            json={"name": "putusan.pdf", "data": pdf},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["name"] == "putusan.pdf"
    assert payload["char_count"] > 0
    keys = [section["key"] for section in payload["sections"]]
    assert "nomor_putusan" in keys
    assert "amar_putusan" in keys


@pytest.mark.asyncio
async def test_rag_query_retrieves_relevant_section() -> None:
    pdf = make_test_pdf(LEGAL_PDF_TEXT)
    app.state.rag_docs = {}
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        ingest = await client.post(
            "/api/rag/ingest",
            json={"name": "putusan.pdf", "data": pdf},
        )
        doc_id = ingest.json()["id"]
        query = await client.post(
            "/api/rag/query",
            json={"question": "Apa amar putusannya?", "document_ids": [doc_id]},
        )

    assert query.status_code == 200
    payload = query.json()
    assert payload["hits"]
    assert any(hit["key"] == "amar_putusan" for hit in payload["hits"])


@pytest.mark.asyncio
async def test_rag_query_inline_text() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/rag/query",
            json={"question": "Siapa yang memutus?", "text": LEGAL_PDF_TEXT},
        )

    assert response.status_code == 200
    assert response.json()["hits"]


@pytest.mark.asyncio
async def test_rag_query_unknown_document_rejected() -> None:
    app.state.rag_docs = {}
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/rag/query",
            json={"question": "Apa amar putusannya?", "document_ids": ["nope"]},
        )

    assert response.status_code == 404
    assert "Unknown RAG document" in response.json()["detail"]
