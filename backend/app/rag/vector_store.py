from __future__ import annotations

from dataclasses import dataclass

from google.cloud.firestore_v1.base_vector_query import DistanceMeasure
from google.cloud.firestore_v1.vector import Vector
from app.embeddings import EMBEDDING_DIMENSION, EMBEDDING_MODEL_ID, embed_documents, embed_query
from app.rag.sections import SECTION_LABELS
from app.rag.sectionizer import sectionize


@dataclass
class DocumentChunk:
    section_key: str
    section_label: str
    text: str
    chunk_index: int


def _split_text(text: str, max_chars: int = 1800, overlap: int = 240) -> list[str]:
    paragraphs = [part.strip() for part in text.split("\n\n") if part.strip()]
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs or [text.strip()]:
        if not paragraph:
            continue
        if len(paragraph) <= max_chars and len(current) + len(paragraph) + 2 <= max_chars:
            current = f"{current}\n\n{paragraph}".strip()
            continue
        if current:
            chunks.append(current)
        if len(paragraph) <= max_chars:
            current = paragraph
            continue
        start = 0
        while start < len(paragraph):
            end = min(len(paragraph), start + max_chars)
            if end < len(paragraph):
                boundary = max(paragraph.rfind(". ", start, end), paragraph.rfind("; ", start, end))
                if boundary > start + max_chars // 2:
                    end = boundary + 1
            chunks.append(paragraph[start:end].strip())
            if end >= len(paragraph):
                break
            start = max(0, end - overlap)
        current = ""
    if current:
        chunks.append(current)
    return [chunk for chunk in chunks if chunk]


def make_chunks(text: str) -> list[DocumentChunk]:
    chunks: list[DocumentChunk] = []
    for key, section_text in sectionize(text).items():
        for index, chunk in enumerate(_split_text(section_text)):
            chunks.append(DocumentChunk(key, SECTION_LABELS.get(key, key), chunk, index))
    if not chunks and text.strip():
        chunks = [
            DocumentChunk("document", "Dokumen", chunk, index)
            for index, chunk in enumerate(_split_text(text))
        ]
    return chunks


def chunk_payloads(text: str) -> list[tuple[DocumentChunk, list[float]]]:
    chunks = make_chunks(text)
    vectors = embed_documents([chunk.text for chunk in chunks]) if chunks else []
    return list(zip(chunks, vectors))


def query_vector(text: str) -> Vector:
    vector = embed_query(text)
    return Vector(vector)


def cosine_score(distance: float | int | None) -> float:
    if distance is None:
        return 0.0
    return max(0.0, min(1.0, 1.0 - float(distance) / 2.0))


__all__ = [
    "EMBEDDING_DIMENSION",
    "EMBEDDING_MODEL_ID",
    "chunk_payloads",
    "cosine_score",
    "make_chunks",
    "query_vector",
]
