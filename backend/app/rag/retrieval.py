"""Retrieval: map a user question to one or more of the 31 canonical features
and return the located section text from the document.

The index is a sectionised document ({key: span_text}). Retrieval scores each
section by how strongly the query matches its synonym set and (for the top
candidate) verifies against the anchor text itself.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .sectionizer import sectionize
from .sections import SECTION_LABELS, SECTION_ORDER, SECTION_SYNONYMS

_WS = re.compile(r"\s+")
_PUNCT = re.compile(r"[^a-z0-9\s]+")

# Question words and filler that should not inflate token coverage.
_STOPWORDS = {
    "apa",
    "di",
    "mana",
    "yang",
    "ini",
    "itu",
    "pada",
    "dalam",
    "dan",
    "atau",
    "ke",
    "dari",
    "dengan",
    "untuk",
    "berapa",
    "bagaimana",
    "siapa",
    "kapan",
    "dimana",
    "sebutkan",
    "tunjukkan",
    "jelaskan",
    "tolong",
    "saya",
    "berikan",
    "apakah",
    "tentang",
    "perkara",
    "ini",
    "tersebut",
    "tersebut",
}


def _norm_tokens(text: str) -> list[str]:
    text = _PUNCT.sub(" ", text.lower())
    return [t for t in _WS.split(text) if t]


def _query_tokens(query: str) -> list[str]:
    return [t for t in _norm_tokens(query) if t not in _STOPWORDS]


# Generic single-word synonyms that are too vague to pin down a section on
# their own ("putusan" alone could be almost any section). A verbatim phrase
# hit on one of these scores like a weak token match instead of a strong hit,
# so that specific keywords (e.g. "tahun", "tanggal") win ties.
_WEAK_WORDS = {
    "putusan",
    "perkara",
    "anak",
    "terdakwa",
    "hakim",
    "pengadilan",
    "sidang",
    "persidangan",
    "berkas",
    "pemeriksaan",
    "pidana",
}


# Question-word disambiguation: turns short/indirect questions into the right
# feature even when the synonym list does not mention the word literally.
_QWORD_RULES: list[tuple[str, list[str]]] = [
    ("siapa_yang_memutus", ["siapa", "hakim", "majelis", "memutus", "mengadili", "ketua", "anggota"]),
    ("hari", ["kapan", "hari", "tanggal berapa", "kapan diputus"]),
    ("tanggal", ["kapan", "tanggal", "tanggal berapa", "diputus"]),
    ("tahun", ["tahun berapa", "tahun"]),
    ("nomor_putusan", ["nomor", "no", "perkara nomor", "no. perkara"]),
    ("nama_pengadilan_negeri", ["pengadilan", "di mana", "dimana", "pengadilan mana"]),
    ("pekerjaan", ["kerja", "profesi", "bekerja"]),
    ("umur_tanggal_lahir", ["umur", "usia", "berapa tahun", "lahir"]),
    ("nama_lengkap", ["siapa", "nama", "identitas", "terdakwa", "anak"]),
    ("agama", ["agama apa", "agamanya"]),
    ("kebangsaan", ["bangsa", "warganegara", "kewarganegaraan"]),
    ("jenis_kelamin", ["laki-laki", "laki laki", "perempuan", "kelamin"]),
    ("tempat_tinggal", ["alamat", "tinggal", "domisili"]),
    ("penangkapan", ["tangkap", "penangkapan", "kapan ditangkap"]),
    ("penahanan", ["tahan", "penahanan", "tahanan"]),
    ("tuntutan", ["tuntut", "jaksa menuntut", "tuntutan"]),
    ("dakwaan", ["dakwa", "surat dakwaan"]),
    ("saksi", ["saksi", "saksi-saksi"]),
    ("ahli", ["ahli", "saksi ahli"]),
    ("terdakwa", ["keterangan terdakwa", "keterangan anak", "keterangan"]),
    ("surat", ["bukti surat", "surat"]),
    ("petunjuk_barang_bukti", ["barang bukti", "petunjuk", "bukti"]),
    ("fakta_hukum", ["fakta"]),
    ("pertimbangan_hukum", ["pertimbangan", "menimbang", "pertimbangan hakim"]),
    ("amar_putusan", ["amar", "mengadili", "menetapkan", "diktum", "putusannya", "vonis", "pidana yang dijatuhkan", "hukuman"]),
    ("irah_irah", ["demi keadilan", "irah"]),
    ("keterangan_perkara", ["perkara", "acara pemeriksaan"]),
    ("judul", ["judul", "kepala"]),
    ("panitera_pengganti", ["panitera"]),
    ("tanda_tangan_majelis", ["ttd", "tanda tangan"]),
]


@dataclass
class RetrievedSection:
    key: str
    label: str
    text: str
    score: float
    reason: str


def map_query_to_sections(query: str) -> list[tuple[str, float, str]]:
    """Return candidate (key, score, reason) pairs for ``query``.

    Scoring model:
      * phrase hits (a synonym phrase verbatim in the query) score highest;
      * token coverage (how many non-stopword query tokens appear across the
        section's synonym set) breaks ties;
      * question-word rules are a fallback for keys with no direct hits.
    """
    q_norm = _WS.sub(" ", query.lower()).strip()
    q_tokens = set(_query_tokens(q_norm))
    if not q_tokens:
        return []

    results: dict[str, tuple[float, str]] = {}

    def add(key: str, score: float, reason: str) -> None:
        cur, _ = results.get(key, (0.0, ""))
        if score > cur:
            results[key] = (score, reason)

    # 1) verbatim phrase hits (highest priority). Longer phrases are more
    #    specific and win ties over generic single words like "terdakwa".
    phrase_hits: dict[str, list[str]] = {}
    for key, syns in SECTION_SYNONYMS.items():
        for syn in syns:
            if syn and syn in q_norm:
                phrase_hits.setdefault(key, []).append(syn)

    def _phrase_score(key: str, hits: list[str]) -> float:
        best_len = max(len(_norm_tokens(h)) for h in hits)
        # A hit on a generic single word (e.g. "putusan") is ambiguous: it
        # could indicate amar, judul, pertimbangan, etc. Score it low so more
        # specific keywords win ties.
        if best_len == 1 and _norm_tokens(hits[0])[0] in _WEAK_WORDS:
            return 0.5
        return 1.0 + 0.15 * (best_len - 1)

    for key, hits in phrase_hits.items():
        add(key, _phrase_score(key, hits), f"phrase:{','.join(hits)}")

    # 2) token coverage across synonym phrases
    for key, syns in SECTION_SYNONYMS.items():
        hit_tokens = set()
        for syn in syns:
            hit_tokens.update(_norm_tokens(syn))
        covered = q_tokens & hit_tokens
        if covered:
            if key in phrase_hits:
                score = _phrase_score(key, phrase_hits[key])
            else:
                weak_only = covered and covered.issubset(_WEAK_WORDS)
                score = 0.5 + 0.5 * len(covered) / len(q_tokens)
                if weak_only:
                    score = min(score, 0.5)
            add(key, score, f"tokens:{','.join(sorted(covered))}")

    # 3) question-word rules for keys with zero phrase/token hits
    covered_keys = set(results)
    for key, words in _QWORD_RULES:
        if key in covered_keys:
            continue
        overlap = sum(
            1 for w in words if _norm_tokens(w) and _norm_tokens(w)[0] in q_tokens
        )
        if overlap:
            add(key, 0.3 + 0.15 * overlap, "qword")

    ranked = sorted(results.items(), key=lambda kv: kv[1][0], reverse=True)
    return [(k, s, r) for k, (s, r) in ranked]


def retrieve(text: str, query: str, top_k: int = 3) -> list[RetrievedSection]:
    """Retrieve the located sections for ``query`` from document ``text``."""
    sections = sectionize(text)
    candidates = map_query_to_sections(query)
    out: list[RetrievedSection] = []
    for key, score, reason in candidates:
        span = sections.get(key, "")
        if span and span.strip():
            out.append(
                RetrievedSection(
                    key=key,
                    label=SECTION_LABELS.get(key, key),
                    text=span.strip(),
                    score=score,
                    reason=reason,
                )
            )
        if len(out) >= top_k:
            break
    if not out:
        # Fallback: return whole document's first substantial section.
        for key in SECTION_ORDER:
            span = sections.get(key, "")
            if span and span.strip():
                out.append(
                    RetrievedSection(
                        key=key,
                        label=SECTION_LABELS.get(key, key),
                        text=span.strip(),
                        score=0.0,
                        reason="fallback",
                    )
                )
                break
    return out