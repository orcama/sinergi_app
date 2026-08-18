"""Section-aware RAG for Indonesian court decisions.

Usage:
    from app.rag import retrieve, sectionize
    sections = sectionize(raw_text)
    hits = retrieve(raw_text, "Apa amar putusannya?")
"""

from .retrieval import RetrievedSection, retrieve
from .sectionizer import sectionize
from .sections import SECTION_LABELS, SECTION_ORDER, SECTION_SYNONYMS

__all__ = [
    "retrieve",
    "sectionize",
    "RetrievedSection",
    "SECTION_LABELS",
    "SECTION_ORDER",
    "SECTION_SYNONYMS",
]