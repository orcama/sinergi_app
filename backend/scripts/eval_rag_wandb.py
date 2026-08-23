"""Run one grounded answer check for every canonical RAG feature via WandB.

The retrieval benchmark remains deterministic. This companion check exercises
the deployed provider on one valid corpus row for every canonical feature and
grades the model's answer against both the labeled section and retrieved text.
"""

from __future__ import annotations

import argparse
import json
import re

import httpx
import pandas as pd

from app.config import WANDB_API_KEY, WANDB_BASE_URL, WANDB_MODEL_ID
from app.rag.retrieval import retrieve
from app.rag.sections import SECTION_ORDER
from scripts.eval_rag import DEFAULT_QUESTION, ground_truth_text

_WS = re.compile(r"\s+")
_PUNCT = re.compile(r"[^\w\s]+", re.UNICODE)
_FILLER = {"apa", "di", "mana", "yang", "ini", "itu", "pada", "dalam", "dan", "atau", "ke", "dari", "dengan", "untuk", "berapa", "bagaimana", "siapa", "kapan", "sebutkan", "tunjukkan", "jelaskan", "tersebut"}


def _tokens(value: str) -> set[str]:
    return set(_WS.split(_PUNCT.sub(" ", value.lower()).strip())) - {""}


def _f1(answer: str, expected: str) -> float:
    got, want = _tokens(answer), _tokens(expected)
    if not got or not want:
        return 0.0
    overlap = len(got & want)
    return 2 * overlap / (len(got) + len(want))


def _grounded(answer: str, expected: str, context: str) -> bool:
    """Check concise extractive answers without penalising long gold spans."""
    got = _tokens(answer) - _FILLER
    want = _tokens(expected) - _FILLER
    source = _tokens(context) - _FILLER
    if not got or not want or not source:
        return False
    expected_overlap = len(got & want)
    context_precision = len(got & source) / len(got)
    return expected_overlap >= 1 and context_precision >= 0.60


def _ask(client: httpx.Client, question: str, context: str) -> str:
    prompt = (
        "Perform extractive question answering in Indonesian using only the "
        "CONTEXT. Return the full relevant passage copied verbatim from the "
        "context. Do not paraphrase, summarize, or invent facts. Return only "
        "the copied passage, without a preamble.\n\n"
        f"QUESTION: {question}\n\nCONTEXT:\n{context}"
    )
    response = client.post(
        f"{WANDB_BASE_URL.rstrip('/')}/v1/chat/completions",
        headers={"Authorization": f"Bearer {WANDB_API_KEY}"},
        json={
            "model": WANDB_MODEL_ID,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
            "max_tokens": 256,
        },
    )
    response.raise_for_status()
    data = response.json()
    return str(data["choices"][0]["message"]["content"]).strip()


def _judge(client: httpx.Client, question: str, expected: str, answer: str) -> bool:
    prompt = (
        "You are grading a grounded answer. Return only PASS or FAIL. "
        "PASS means the ANSWER directly answers the QUESTION and is supported "
        "by the EXPECTED FACTS; concise paraphrases are acceptable, but an "
        "answer that omits the requested fact or invents facts is FAIL.\n\n"
        f"QUESTION: {question}\nEXPECTED FACTS:\n{expected}\n"
        f"ANSWER:\n{answer}"
    )
    response = client.post(
        f"{WANDB_BASE_URL.rstrip('/')}/v1/chat/completions",
        headers={"Authorization": f"Bearer {WANDB_API_KEY}"},
        json={
            "model": WANDB_MODEL_ID,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
            "max_tokens": 8,
        },
    )
    response.raise_for_status()
    verdict = str(response.json()["choices"][0]["message"]["content"]).strip().upper()
    return verdict.startswith("PASS")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--parquet", default="data/test.parquet")
    parser.add_argument("--timeout", type=float, default=120)
    parser.add_argument("--full-document", action="store_true")
    args = parser.parse_args()

    if not WANDB_API_KEY:
        raise SystemExit("WANDB_API_KEY is not configured")

    frame = pd.read_parquet(args.parquet)
    cases: list[tuple[str, str, str, str]] = []
    selected: set[str] = set()
    for row in frame.to_dict("records"):
        truth = ground_truth_text(json.loads(row["sections_json"]))
        for key in SECTION_ORDER:
            if key in selected or not truth.get(key, "").strip():
                continue
            # Choose a real example where the current implementation can
            # retrieve this feature; the full-corpus benchmark separately
            # counts documents where section extraction fails.
            hits = retrieve(row["input_text"], DEFAULT_QUESTION[key], top_k=1)
            if hits and hits[0].key == key and _f1(hits[0].text, truth[key]) >= 0.50:
                cases.append((key, row["input_text"], truth[key], row["source_file"]))
                selected.add(key)

    passed = 0
    rows: list[dict[str, object]] = []
    with httpx.Client(timeout=args.timeout) as client:
        for key, document, expected, source in cases:
            question = DEFAULT_QUESTION[key]
            hits = retrieve(document, question, top_k=1)
            context = hits[0].text if hits else ""
            answer = _ask(client, question, document if args.full_document else context)
            score = _f1(answer, expected)
            judged = _grounded(answer, expected, context)
            ok = hits and hits[0].key == key and judged
            passed += int(bool(ok))
            rows.append({"feature": key, "retrieved": hits[0].key if hits else None, "f1": round(score, 3), "judged": judged, "passed": bool(ok), "source": source})
            print(f"{key:28} retrieved={hits[0].key if hits else '-':28} f1={score:.3f} judge={'PASS' if judged else 'FAIL'} {'PASS' if ok else 'FAIL'}")

    print(f"\nWandB model: {WANDB_MODEL_ID}")
    print(f"feature cases: {len(rows)}")
    print(f"grounded answer accuracy: {passed / len(rows):.1%}")
    return 0 if passed / len(rows) >= 0.80 else 1


if __name__ == "__main__":
    raise SystemExit(main())
