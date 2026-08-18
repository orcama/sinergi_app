# RAG Documentation — Sinergi App

Dokumentasi teknis sistem Retrieval-Augmented Generation (RAG) pada aplikasi
Sinergi untuk dokumen putusan pengadilan berbahasa Indonesia.

---

## 1. Konsep

Sistem ini memisahkan dua hal yang sering digabung pada RAG standar:

1. **Lokalisasi bagian (sectionizing)** — membagi putusan menjadi 31 fitur
   kanonik (irah-irah, judul, identitas terdakwa, dakwaan, saksi, fakta hukum,
   pertimbangan hukum, amar putusan, dst.) berdasarkan **anchor regex** dari
   struktur hukum yang kaku dan predictable.
2. **Retrieval (pemetaan pertanyaan → fitur)** — diberikan pertanyaan user,
   sistem memberi skor pada tiap fitur lalu mengembalikan bagian teratas sebagai
   konteks untuk LLM.

Karena putusan pengadilan memiliki struktur yang tetap, langkah (1) diselesaikan
dengan aturan, bukan dengan model. LLM hanya digunakan pada langkah terakhir
untuk merangkai jawaban yang grounded pada bagian yang terambil.

---

## 2. Arsitektur / Alur End-to-End

```
User ──> attach PDF(s) ──> handleAddFiles (page.tsx)
  │                          file disimpan pada Attachment (status done)
  ▼
handleSend: mode "rag" + ada attachment?
  │   ya
  ▼
requestRagResponse (page.tsx)
  │  1) ingestPdf(file)   ──> POST /api/rag/ingest
  │  2) queryRag(...)     ──> POST /api/rag/query
  ▼
POST /api/rag/ingest (main.py)
  │  extract_pdf_text(base64, max_chars=1M, collapse=False)
  │  sectionize(text) ──> {key: span}
  │  simpan in-memory: app.state.rag_docs[uuid] = {name, text}
  ▼
POST /api/rag/query (main.py)
  │  gabung teks dokumen → retrieve(text, question, top_k=3)
  ▼
retrieve / map_query_to_sections (retrieval.py)
  │  skor tiap fitur (lihat §4)
  │  → top-3 {key, label, text, score, reason}
  ▼
hitsToContext(hits)  ──> blob "[Label | relevansi 1.15]\n...teks..."
  │  disisipkan ke user message: "\n\n[Konteks dokumen]\n..."
  ▼
POST /api/chat (provider vllm | wandb)  ──> LLM menyusun jawaban
  ▼
hitsToSources(hits) ──> Source[] → ditampilkan di SourcesSidebar
      tiap sumber menampilkan skor relevansi + reason
```

Catatan:
- Dokumen hasil ingest disimpan **in-memory** di `app.state.rag_docs`; hilang
  jika backend restart.
- RAG hanya aktif bila **mode = "rag"** dan ada attachment PDF. Mode "sft"
  memanggil `/api/chat` tanpa konteks dokumen.

---

## 3. Prompt / Pertanyaan untuk Mengekstrak Fitur

Ada 3 cara mengambil satu fitur:

**A. Programatik (tanpa prompt)** — ekstraksi sebenarnya dilakukan oleh regex:
```python
from app.rag.sectionizer import sectionize
sections = sectionize(text)          # baca satu putusan
amar = sections.get("amar_putusan")  # fitur yang diinginkan
```

**B. Via `POST /api/rag/query`** — "prompt" yang tetap diproses secara leksikal:
```json
POST /api/rag/query
{
  "document_ids": ["..."],
  "question": "Apa amar putusan hakim?",
  "top_k": 1
}
```

**C. Via chat UI (mode RAG)** — bahasa Indonesia natural, LLM yang merangkai:
> "Apa amar putusan hakim dalam perkara ini?"

dengan PDF di-attach. Pertanyaan dipetakan ke fitur `amar_putusan`, bagian
tersebut disuntikkan sebagai konteks, dan jawaban disusun LLM.

**Penting:** karena retrieval bersifat leksikal (bukan semantik), pertanyaan
harus memuat kata kunci/sinonim dari fitur yang dimaksud. Daftar pertanyaan
terbukti bekerja ada di `backend/scripts/eval_rag.py` (`QUESTION_TEMPLATES`).
Contoh:
- `amar_putusan` → "amar putusan", "vonis", "mengadili", "pidana yang dijatuhkan"
- `terdakwa` → "keterangan terdakwa di persidangan"
- `petunjuk_barang_bukti` → "barang bukti", "mengajukan barang bukti"

---

## 4. Pengukuran Skor Relevansi

Skor relevansi **bukan** cosine similarity. Ini adalah **heuristik leksikal**
buatan di `map_query_to_sections()` (retrieval.py) dengan 3 tingkatan; skor
tertinggi per fitur yang dipakai:

**Tingkat 1 — phrase hit verbatim (skor ≥ 1.0)**
Sinonim fitur muncul persis di pertanyaan:
```
score = 1.0 + 0.15 × (panjang sinonim dalam token − 1)
```
- "vonis" (1 token) → 1.00
- "pidana yang dijatuhkan" (3 token) → 1.30
- Pengecualian: kata lemah/ambigu tunggal (`_WEAK_WORDS`: "putusan",
  "terdakwa", "hakim", "anak", …) hanya bernilai **0.5** karena tidak bisa
  menunjuk fitur secara spesifik.

**Tingkat 2 — token coverage (0.5–1.0)**
Jika fitur sudah punya phrase hit, skor phrase yang menang. Jika tidak:
```
score = 0.5 + 0.5 × (token tercover ÷ total token pertanyaan)
```
di-cap 0.5 bila hanya kata lemah yang cocok.

**Tingkat 3 — question-word fallback (0.30–0.45)**
Untuk fitur tanpa hit: `_QWORD_RULES` memetakan kata seperti "tanggal",
"vonis", "alamat", "umur" ke fitur:
```
score = 0.3 + 0.15 × (jumlah frasa qword yang cocok)
```

Kemudian:
- Fitur diurutkan menurun → top-3 dikembalikan beserta `score` dan `reason`
  (`phrase:...` / `tokens:...` / `qword`).
- Tanpa hit sama sekali → `score = 0.0`, `reason = "fallback"`.

Skor yang sama ditampilkan di UI sebagai "Skor relevansi".

---

## 5. Mengapa Bukan Cosine Similarity (vs RAG-Anything)

RAG standar — termasuk RAG-Anything (repo `backend/rag-anything/`, LightRAG
dengan `embedding_func`, `vector_storage`, `cosine_threshold`) — bekerja:
chunk → embed → vector DB → cosine(query_embedding, chunk_embedding) → top-k.

Sistem ini sengaja **tidak** memakai pendekatan itu, dengan alasan:

1. **Tugasnya bukan pencarian korpus.** Ini lokalisasi salah satu dari 31
   bagian *yang sudah diketahui dan tetap* di dalam satu dokumen terstruktur.
2. **Cosine similarity bersifat semantik, bukan struktural.** Ia tidak bisa
   menemukan *batas* bagian — chunk sering memotong "pertimbangan" di tengah,
   dan karena bahasa hukum berulang ("terdakwa", "hakim", "menimbang" muncul di
   hampir semua paragraf), chunk dengan cosine tertinggi sering keliru.
3. **Skor leksikal mengoptimalkan metrik eval secara langsung:** akurasi
   top-1 bagian + tumpang-tindih span (token F1 ≥ 0.5). Deterministik,
   explainable, tanpa biaya embedding/vector DB, dan mencapai target 80%.
4. `sectionize()` memecahkan presisi batas lewat struktur, bukan kemiripan.

**Di mana cosine lebih unggul:** fleksibilitas semantik. "Gimana hukumannya?"
tidak berbagi kata kunci dengan "amar putusan" dan luput di scorer leksikal,
tetapi tidak di embedding. Solusi baku adalah **hybrid**: pertahankan
sectionize + leksikal untuk struktur, lalu re-rank dengan kemiripan embedding.

---

## 6. Hasil Evaluasi

Harness: `backend/scripts/eval_rag.py` — 68 dokumen (34 perkara × 2 varian).

Metrik:
- Benar jika top-1 bagian == fitur ground truth **dan** token F1 span ≥ 0.5.
- Akurasi rata-rata (headline): **80.4%** (mean F1 0.795, map 100%).
- Fitur paling kuat: irah/tahun 100%, judul 98.5%, nomor/nama PN/nama lengkap
  97.1%. Fitur lemah: surat 50.0%, panitera pengganti 48.4%.

Perintah:
```
cd backend
$env:PYTHONPATH='.'
uv run python scripts\eval_rag.py
```

---

## 7. File Terkait

- `backend/app/rag/sectionizer.py` — lokasi batas bagian + `locate_first_anchor`.
- `backend/app/rag/sections.py` — 31 fitur, `SECTION_ORDER`, `SECTION_ANCHORS`,
  `SECTION_LABELS`, `SECTION_SYNONYMS`.
- `backend/app/rag/retrieval.py` — `retrieve`, `map_query_to_sections`, skor.
- `backend/app/main.py` — `POST /api/rag/ingest`, `POST /api/rag/query`.
- `backend/scripts/eval_rag.py` — harness evaluasi + template pertanyaan.
- `backend/data/test.parquet` — dataset evaluasi.
- `lib/rag.ts` — `ingestPdf`, `queryRag`, `hitsToContext` (frontend).
- `app/chat/page.tsx` — alur RAG, sumber + skor relevansi di sidebar.
