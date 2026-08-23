from __future__ import annotations

import base64
import io
import re

from pypdf import PdfReader

from app.schemas import ContentPart, ImageUrlPart, PdfPart, TextPart


def extract_pdf_text(data: str, max_chars: int = 32_000, collapse: bool = True) -> str:
    if data.startswith("data:") and "," in data:
        data = data.split(",", 1)[1]
    try:
        raw = base64.b64decode(data)
        text = "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(raw)).pages)
    except Exception:
        return ""
    return (" ".join(text.split()) if collapse else text)[:max_chars]


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    count = 0
    for word in re.split(r"\s+", text.strip()):
        if word:
            count += max(1, -(-len(re.sub(r"[^\w]", "", word)) // 4))
            count += len(re.findall(r"[^\w\s]+", word))
    return max(1, count)


def expand_content(content: str | list[ContentPart] | list[dict]) -> str | list[dict]:
    if isinstance(content, str):
        return content
    parts: list[dict] = []
    for part in content:
        if isinstance(part, TextPart):
            parts.append({"type": "text", "text": part.text})
        elif isinstance(part, ImageUrlPart):
            parts.append({"type": "image_url", "image_url": part.image_url})
        elif isinstance(part, PdfPart):
            text = extract_pdf_text(part.data)
            parts.append({"type": "text", "text": f"Konteks:\n{text}" if text else f"[PDF tidak terbaca: {part.name}]"})
        elif isinstance(part, dict):
            if part.get("type") == "pdf":
                text = extract_pdf_text(part.get("data", ""))
                parts.append({"type": "text", "text": f"Konteks:\n{text}" if text else f"[PDF tidak terbaca: {part.get('name', 'dokumen.pdf')}]"})
            elif part.get("type") in {"text", "image_url"}:
                parts.append({"type": part["type"], part["type"]: part.get(part["type"], "")})
    return parts[0]["text"] if len(parts) == 1 and parts[0]["type"] == "text" else parts


def flatten_content(content: str | list[ContentPart]) -> str:
    expanded = expand_content(content)
    if isinstance(expanded, str):
        return expanded
    return "\n".join(part.get("text", "") for part in expanded if part.get("type") == "text")
