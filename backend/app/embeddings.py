"""Small, lazy-loaded multilingual embedding service.

The default model is 384-dimensional and supports Indonesian. Loading is lazy
so ordinary chat, PDF extraction, and the test suite do not download a model.
"""

from __future__ import annotations

import os
from functools import lru_cache

EMBEDDING_MODEL_ID = os.getenv(
    "EMBEDDING_MODEL_ID", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
)
EMBEDDING_DIMENSION = int(os.getenv("EMBEDDING_DIMENSION", "384"))


@lru_cache(maxsize=1)
def _model():
    from fastembed import TextEmbedding

    return TextEmbedding(model_name=EMBEDDING_MODEL_ID)


def _encode(texts: list[str], prefix: str) -> list[list[float]]:
    if not texts:
        return []
    model = _model()
    if prefix == "query":
        vectors = model.query_embed(texts)
    else:
        vectors = model.passage_embed(texts)
    result = [vector.astype("float32").tolist() for vector in vectors]
    if any(len(vector) != EMBEDDING_DIMENSION for vector in result):
        raise RuntimeError(
            f"Embedding model returned {len(result[0]) if result else 0} dimensions; "
            f"expected {EMBEDDING_DIMENSION}."
        )
    return result


def embed_documents(texts: list[str]) -> list[list[float]]:
    return _encode(texts, "passage")


def embed_query(text: str) -> list[float]:
    vectors = _encode([text], "query")
    return vectors[0]
