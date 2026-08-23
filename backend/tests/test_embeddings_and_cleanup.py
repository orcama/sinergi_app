from app.embeddings import EMBEDDING_DIMENSION
from app.rag.vector_store import cosine_score, make_chunks
from app.services.content_service import clean_pdf_text


def test_clean_pdf_text_removes_common_pdf_artifacts() -> None:
    cleaned = clean_pdf_text(
        "Judul Dokumen\n"
        "Halaman 1\n"
        "Pengadaan Barang\n"
        "Pengadaan Barang\n"
        "Pengadaan Barang\n"
        "perjan-\njian berlaku\n"
        "1\n"
    )

    assert "Halaman 1" not in cleaned
    assert "Pengadaan Barang" not in cleaned
    assert "perjanjian berlaku" in cleaned
    assert not cleaned.endswith("1")


def test_make_chunks_returns_non_empty_chunks() -> None:
    chunks = make_chunks(
        "P U T U S A N\nNomor 123/Pid.B/2026/PN.JKT\n"
        "DEMI KEADILAN BERDASARKAN KETUHANAN YANG MAHA ESA\n"
        "M E N G A D I L I:\n1. Mengabulkan permohonan pemohon."
    )

    assert chunks
    assert all(chunk.text for chunk in chunks)
    assert all(chunk.section_label for chunk in chunks)


def test_cosine_distance_is_mapped_to_similarity() -> None:
    assert cosine_score(0) == 1.0
    assert cosine_score(2) == 0.0
    assert 0.0 < cosine_score(0.4) < 1.0
    assert EMBEDDING_DIMENSION == 384
