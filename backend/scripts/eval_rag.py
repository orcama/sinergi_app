"""Evaluation harness for the section-aware RAG.

Loads data/test.parquet and measures retrieval accuracy against the
ground-truth sections_json:

  For each document and each non-empty feature:
    * synthesise a natural user question about that feature,
    * run retrieval (map_query_to_sections -> retrieve),
    * the hit is "correct" if the top-1 retrieved key equals the feature AND
      the retrieved span overlaps the ground-truth span (token F1 >= threshold).

Reports per-feature and overall accuracy so we can drive the sectionizer /
synonym tables toward the 80-90% target.
"""

from __future__ import annotations

import argparse
import json
import re

import pandas as pd

from app.rag import retrieve, sectionize
from app.rag.retrieval import map_query_to_sections
from app.rag.sections import SECTION_ORDER

_WS = re.compile(r"\s+")


def _tokens(text: str) -> set[str]:
    return set(_WS.split(text.lower()))


def _tok_f1(a: str, b: str) -> float:
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    inter = len(ta & tb)
    if inter == 0:
        return 0.0
    return 2 * inter / (len(ta) + len(tb))


# Natural user questions for each feature (Indonesian). These exercise the
# query->feature mapping as well as the section span location.
QUESTION_TEMPLATES: dict[str, list[str]] = {
    "judul": [
        "Apa judul putusan ini?",
        "Tunjukkan judul dari putusan tersebut.",
        "Berapa nomor dan judul perkara ini?",
    ],
    "nomor_putusan": [
        "Berapa nomor putusan perkara ini?",
        "Sebutkan nomor putusannya.",
        "Nomor perkara berapa ya?",
    ],
    "irah_irah": [
        "Apa bunyi irah-irah putusan?",
        "Tunjukkan irah-irah dari putusan ini.",
        "Bagaimana kalimat irah-irah pada putusan?",
    ],
    "nama_pengadilan_negeri": [
        "Pengadilan negeri mana yang mengadili perkara ini?",
        "Sebutkan nama pengadilan negeri yang memutus perkara tersebut.",
        "Perkara ini diadili di pengadilan mana?",
    ],
    "keterangan_perkara": [
        "Apa keterangan perkara dalam putusan ini?",
        "Jelaskan keterangan perkaranya.",
        "Tunjukkan keterangan perkara pada putusan.",
    ],
    "nama_lengkap": [
        "Siapa nama lengkap terdakwa dalam perkara ini?",
        "Sebutkan nama lengkap anak yang berhadapan dengan hukum.",
        "Apa identitas nama terdakwa pada putusan ini?",
    ],
    "tempat_lahir": [
        "Di mana tempat lahir terdakwa?",
        "Sebutkan tempat lahir anak tersebut.",
        "Apa tempat lahir terdakwa pada putusan?",
    ],
    "umur_tanggal_lahir": [
        "Berapa umur terdakwa?",
        "Sebutkan umur dan tanggal lahir anak.",
        "Berapa usia terdakwa saat ini?",
    ],
    "jenis_kelamin": [
        "Apa jenis kelamin terdakwa?",
        "Laki-laki atau perempuan terdakwanya?",
        "Sebutkan jenis kelamin anak tersebut.",
    ],
    "kebangsaan": [
        "Apa kebangsaan terdakwa?",
        "Warga negara mana terdakwa?",
        "Sebutkan kebangsaan anak tersebut.",
    ],
    "tempat_tinggal": [
        "Di mana tempat tinggal terdakwa?",
        "Sebutkan alamat tempat tinggal anak tersebut.",
        "Apa domisili terdakwa pada putusan ini?",
    ],
    "agama": [
        "Apa agama terdakwa?",
        "Sebutkan agama anak tersebut.",
        "Apa agama yang dianut terdakwa?",
    ],
    "pekerjaan": [
        "Apa pekerjaan terdakwa?",
        "Sebutkan pekerjaan anak tersebut.",
        "Terdakwa bekerja sebagai apa?",
    ],
    "penangkapan": [
        "Bagaimana proses penangkapan terdakwa?",
        "Jelaskan penangkapan terhadap anak tersebut.",
        "Tunjukkan bagian penangkapan pada putusan.",
    ],
    "penahanan": [
        "Bagaimana proses penahanan terdakwa?",
        "Jelaskan penahanan terhadap anak tersebut.",
        "Tunjukkan bagian penahanan dalam putusan.",
    ],
    "tuntutan": [
        "Apa isi tuntutan jaksa?",
        "Berapa lamakah tuntutan pidana yang diajukan jaksa?",
        "Tunjukkan tuntutan pidana dari penuntut umum.",
    ],
    "dakwaan": [
        "Apa isi dakwaan terhadap terdakwa?",
        "Sebutkan dakwaan penuntut umum pada perkara ini.",
        "Bagaimana surat dakwaan dalam putusan tersebut?",
    ],
    "saksi": [
        "Siapa saja saksi yang diajukan dalam perkara ini?",
        "Apa keterangan saksi-saksi dalam persidangan?",
        "Tunjukkan bagian saksi pada putusan.",
    ],
    "ahli": [
        "Siapa ahli yang didengar dalam perkara ini?",
        "Apa keterangan saksi ahli pada persidangan?",
        "Tunjukkan bagian ahli pada putusan ini.",
    ],
    "terdakwa": [
        "Apa keterangan terdakwa di persidangan?",
        "Jelaskan keterangan anak dalam persidangan.",
        "Tunjukkan bagian keterangan terdakwa pada putusan.",
    ],
    "surat": [
        "Apa saja surat atau bukti surat dalam perkara ini?",
        "Tunjukkan berkas perkara dan surat-surat yang digunakan.",
        "Bagaimana bagian surat pada putusan?",
    ],
    "petunjuk_barang_bukti": [
        "Apa saja barang bukti dalam perkara ini?",
        "Tunjukkan alat bukti dan petunjuk dalam putusan.",
        "Sebutkan barang bukti yang diajukan jaksa.",
    ],
    "fakta_hukum": [
        "Apa fakta hukum yang terungkap di persidangan?",
        "Tunjukkan fakta-fakta hukum pada putusan ini.",
        "Jelaskan fakta hukum dalam perkara tersebut.",
    ],
    "pertimbangan_hukum": [
        "Apa pertimbangan hukum hakim?",
        "Bagaimana pertimbangan majelis hakim dalam putusan?",
        "Tunjukkan bagian pertimbangan hukum pada putusan ini.",
    ],
    "amar_putusan": [
        "Apa amar putusan hakim?",
        "Tunjukkan amar putusan atau vonis dalam perkara ini.",
        "Bagaimana isi putusan (amar) hakim?",
    ],
    "hari": [
        "Pada hari apa putusan ini dijatuhkan?",
        "Putusan diucapkan pada hari apa?",
        "Hari apa sidang putusan dilaksanakan?",
    ],
    "tanggal": [
        "Tanggal berapa putusan ini dijatuhkan?",
        "Pada tanggal berapa vonis diucapkan?",
        "Tanggal berapa penetapan ini ditetapkan?",
    ],
    "tahun": [
        "Putusan ini dijatuhkan pada tahun berapa?",
        "Tahun berapa perkara ini diputus?",
        "Sebutkan tahun putusan.",
    ],
    "siapa_yang_memutus": [
        "Siapa yang memutus perkara ini?",
        "Siapa hakim ketua dalam perkara ini?",
        "Sebutkan majelis hakim yang mengadili perkara tersebut.",
    ],
    "panitera_pengganti": [
        "Siapa panitera pengganti dalam perkara ini?",
        "Sebutkan panitera pengganti pada putusan.",
        "Siapa panitera yang membantu sidang?",
    ],
    "tanda_tangan_majelis": [
        "Apa isi bagian tanda tangan majelis?",
        "Tunjukkan tanda tangan majelis pada putusan.",
        "Bagaimana bagian ttd hakim pada putusan?",
    ],
}

# A single stable question per feature for reproducibility of the headline
# metric; the template list above is used for per-template breakdowns.
DEFAULT_QUESTION: dict[str, str] = {
    k: v[0] for k, v in QUESTION_TEMPLATES.items()
}


def _retrieve_from_sections(sections: dict, query: str, top_k: int = 1):
    """Top-k retrieved section as a RetrievedSection (avoids re-sectionizing)."""
    from app.rag.retrieval import map_query_to_sections
    from app.rag.sections import SECTION_LABELS, SECTION_ORDER

    candidates = map_query_to_sections(query)
    out = []
    for key, score, reason in candidates:
        span = sections.get(key, "")
        if span and span.strip():
            out.append(
                {
                    "key": key,
                    "label": SECTION_LABELS.get(key, key),
                    "text": span.strip(),
                    "score": score,
                    "reason": reason,
                }
            )
        if len(out) >= top_k:
            break
    if not out:
        for key in SECTION_ORDER:
            span = sections.get(key, "")
            if span and span.strip():
                out.append(
                    {
                        "key": key,
                        "label": SECTION_LABELS.get(key, key),
                        "text": span.strip(),
                        "score": 0.0,
                        "reason": "fallback",
                    }
                )
                break
    return out[0]


def _retrieve_candidates(sections: dict, query: str, top_k: int = 3) -> list[dict]:
    """Return all available ranked section candidates for recall@K scoring."""
    candidates = map_query_to_sections(query)
    out = []
    from app.rag.sections import SECTION_LABELS, SECTION_ORDER
    for key, score, reason in candidates:
        span = sections.get(key, "")
        if span and span.strip():
            out.append({"key": key, "label": SECTION_LABELS.get(key, key), "text": span.strip(), "score": score, "reason": reason})
        if len(out) >= top_k:
            break
    if not out:
        for key in SECTION_ORDER:
            span = sections.get(key, "")
            if span and span.strip():
                out.append({"key": key, "label": SECTION_LABELS.get(key, key), "text": span.strip(), "score": 0.0, "reason": "fallback"})
                break
    return out


def ground_truth_text(sections_json: dict) -> dict[str, str]:
    """Flatten ground truth (a section may hold several quotes) to plain text."""
    out: dict[str, str] = {}
    for key, val in sections_json.items():
        if isinstance(val, list):
            out[key] = " ".join(str(x) for x in val)
        elif isinstance(val, str):
            out[key] = val
    return out


def evaluate(
    df: pd.DataFrame,
    threshold: float = 0.5,
    use_all_templates: bool = False,
    verbose: bool = False,
    top_k: int = 1,
) -> dict:
    per_feature: dict[str, dict] = {
        k: {"total": 0, "mapped": 0, "correct": 0, "f1_sum": 0.0}
        for k in SECTION_ORDER
    }
    totals = {"total": 0, "mapped": 0, "correct": 0, "f1_sum": 0.0}
    details: list[dict] = []

    for _, row in df.iterrows():
        text = row["input_text"]
        gt = ground_truth_text(json.loads(row["sections_json"]))
        # Sectionize once per document, then reuse for every query.
        sections = sectionize(text)
        retrieved_cache: dict[str, dict] = {}

        for key in SECTION_ORDER:
            gt_text = gt.get(key, "")
            if not gt_text or not gt_text.strip():
                continue  # empty feature in ground truth -> skip

            questions = (
                QUESTION_TEMPLATES.get(key, [DEFAULT_QUESTION[key]])
                if use_all_templates
                else [DEFAULT_QUESTION[key]]
            )
            for q in questions:
                per_feature[key]["total"] += 1
                totals["total"] += 1

                cands = map_query_to_sections(q)
                mapped = any(cand[0] == key for cand in cands[:3])
                if mapped:
                    per_feature[key]["mapped"] += 1
                    totals["mapped"] += 1

                tops = retrieved_cache.get(q)
                if tops is None:
                    tops = _retrieve_candidates(sections, q, top_k=top_k)
                    retrieved_cache[q] = tops
                top = tops[0]
                correct = False
                f1 = 0.0
                matching = [candidate for candidate in tops if candidate["key"] == key]
                if matching:
                    f1 = max(_tok_f1(candidate["text"], gt_text) for candidate in matching)
                    correct = f1 >= threshold
                per_feature[key]["correct"] += int(correct)
                totals["correct"] += int(correct)
                per_feature[key]["f1_sum"] += f1
                totals["f1_sum"] += f1
                details.append(
                    {
                        "source": row["source_file"],
                        "key": key,
                        "question": q,
                        "top_key": top["key"],
                        "mapped": mapped,
                        "correct": correct,
                        "f1": round(f1, 3),
                        "retrieved_len": len(top["text"]),
                        "gt_len": len(gt_text),
                    }
                )

    result = {
        "total": totals["total"],
        "mapped": round(totals["mapped"] / totals["total"], 4),
        "accuracy": round(totals["correct"] / totals["total"], 4),
        "mean_f1": round(totals["f1_sum"] / totals["total"], 4),
        "per_feature": {},
    }
    for key, s in per_feature.items():
        result["per_feature"][key] = {
            "total": s["total"],
            "mapped": round(s["mapped"] / s["total"], 4) if s["total"] else 0.0,
            "accuracy": round(s["correct"] / s["total"], 4) if s["total"] else 0.0,
            "mean_f1": round(s["f1_sum"] / s["total"], 4) if s["total"] else 0.0,
        }
    if verbose:
        result["details"] = details
    return result


def _print_report(result: dict) -> None:
    print(f"\n=== OVERALL (threshold-based accuracy) ===")
    print(f"total pairs        : {result['total']}")
    print(f"query->feature map : {result['mapped']:.1%}")
    print(f"retrieval accuracy : {result['accuracy']:.1%}")
    print(f"mean token F1      : {result['mean_f1']:.3f}")
    print("\n=== PER FEATURE ===")
    rows = sorted(
        result["per_feature"].items(),
        key=lambda kv: kv[1]["accuracy"],
        reverse=True,
    )
    for key, s in rows:
        print(
            f"{key:26s} n={s['total']:4d} map={s['mapped']:5.1%} "
            f"acc={s['accuracy']:5.1%} f1={s['mean_f1']:.3f}"
        )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--parquet", default="data/test.parquet")
    ap.add_argument("--threshold", type=float, default=0.5)
    ap.add_argument("--all-templates", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--top-k", type=int, default=1)
    args = ap.parse_args()

    df = pd.read_parquet(args.parquet)
    if args.limit:
        df = df.head(args.limit)
    result = evaluate(
        df,
        threshold=args.threshold,
        use_all_templates=args.all_templates,
        verbose=args.verbose,
        top_k=max(1, args.top_k),
    )
    _print_report(result)
    if args.verbose:
        import collections

        wrong = [
            d for d in result.get("details", []) if not d["correct"]
        ]
        by_key = collections.Counter(d["key"] for d in wrong)
        print("\n=== WRONG BY KEY ===")
        for key, cnt in by_key.most_common():
            print(f"{key:26s} {cnt}")
        print("\n=== WRONG DETAILS (first 60) ===")
        for d in wrong[:60]:
            print(
                f"{d['key']:26s} -> {d['top_key']:26s} f1={d['f1']:.2f} "
                f"q='{d['question']}' src={d['source']}"
            )


if __name__ == "__main__":
    main()
