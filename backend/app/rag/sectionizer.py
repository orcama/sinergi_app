"""Sectionizer: locate the 31 canonical sections inside a raw court-decision text.

Strategy (rule-based, no ML dependencies):
  1. Normalise whitespace: collapse runs of spaces/tabs to one space but keep
     single newlines (so `^` line anchors still work in MULTILINE mode).
  2. Scan the sections in canonical order; for each, take the FIRST anchor
     match at/after the previous section's start. Because the document layout
     is (mostly) canonical, the first match in order is the correct boundary.
  3. A section's span runs from its own start to the next section's start.
  4. Fallbacks: if an anchor is not found, the section is left empty and the
     scan continues from the previous boundary; structural parsers rebuild the
     identity block (labelled vs bare) and the tail after the amar putusan.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .sections import SECTION_INDEX, SECTION_ORDER, get_anchor_patterns

IDENTITY_KEYS = [
    "nama_lengkap",
    "tempat_lahir",
    "umur_tanggal_lahir",
    "jenis_kelamin",
    "kebangsaan",
    "tempat_tinggal",
    "agama",
    "pekerjaan",
]

TAIL_KEYS = [
    "hari",
    "tanggal",
    "tahun",
    "siapa_yang_memutus",
    "panitera_pengganti",
    "tanda_tangan_majelis",
]

_DAY_RE = re.compile(
    r"\b(senin|selasa|rabu|kamis|jumat|jum'at|juma’at|sabtu|minggu)\b",
    re.IGNORECASE,
)
_MONTHS = "januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember"
_DATE_RE = re.compile(
    rf"\b\d{{1,2}}\s+(?:{_MONTHS})(?:\s+\d{{4}})?\b|\b\d{{1,2}}\s*[-/]\s*\d{{1,2}}\s*[-/]\s*\d{{4}}\b",
    re.IGNORECASE,
)
_YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")
_DAY_NUM_RE = re.compile(r"^\d{1,2}$")
# A standalone name line (judge / clerk) between the year and the signature
# block, e.g. "MAHENDRA WIRASAKTI, S.H." or "Rini Ariani Said, S.H., M.H."
_NAME_LINE_RE = re.compile(
    r"^[\"'“”‘’a-z ,\.]+(?:s\.h\.|m\.h\.|s\.h|m\.h|s\.m\.|s\.m|m\.k\.n\.|m\.k\.n)[\"'“”‘’a-z ,\.]*$",
    re.IGNORECASE,
)
_NAME_LINE_RE = re.compile(
    r"^[a-z ,\.'“”‘’]*(?:s\.h\.|m\.h\.|s\.h|m\.h|s\.m\.|s\.m|m\.k\.n\.|m\.k\.n|s\.i\.p|s\.e\.)[a-z ,\.'“”‘’]*$",
    re.IGNORECASE,
)

# Tail components in document order (after the amar putusan).
_TAIL_DEMIKIAN = re.compile(
    r"demikianlah\s+(?:diputuskan|ditetapkan)|demikian\s+(?:diputuskan|ditetapkan)|diputuskan\b|ditetapkan\b",
    re.IGNORECASE,
)
_TAIL_JUDGE = re.compile(
    r"sebagai\s+hakim\b|hakim\s+(?:anak|ketua|pengadilan|yang)\b|panitera\s+pengganti\b",
    re.IGNORECASE,
)
_TAIL_TTD = re.compile(r"^ttd\.?$|^t\s*t\s*d\b|ttd\s+ttd|tanda\s+tangan|^ttd\b", re.IGNORECASE)
_TAIL_SIG = re.compile(
    r"^panitera\s+pengganti\s*,?\s*hakim|^panitera\s*,?\s*hakim|^panitera\s+pengganti\s*,$|^hakim\s+ketua\s*,?\s*hakim\s+anggota|"
    r"^hakim\s+pengadilan\s+negeri\b|^hakim\s+pengadilan\s+tinggi\b|^hakim\s+anak\b|^ketua\s+pengadilan\b|^panitera\s+pengadilan\b|"
    r"^panitera\s*,?\s*$|^panitera\s+pengganti\s*$|^hakim\s*-\s*hakim\s+anggota\b|^hakim\s+ketua\s*$|^hakim\s+anggota\s*$",
    re.IGNORECASE,
)

# Identity block layout A: labelled fields, e.g. "1. Nama lengkap : ...".
_LABELLED_FIELDS = [
    ("nama_lengkap", r"(?:\d+\.\s*)?nama\s+lengkap\s*:"),
    ("tempat_lahir", r"(?:\d+\.\s*)?tempat\s+lahir\s*:"),
    ("umur_tanggal_lahir", r"(?:\d+\.\s*)?umur\s*/\s*tanggal\s+lahir\s*:"),
    ("jenis_kelamin", r"(?:\d+\.\s*)?jenis\s+kelamin\s*:"),
    ("kebangsaan", r"(?:\d+\.\s*)?kebangsaan\s*:"),
    ("tempat_tinggal", r"(?:\d+\.\s*)?tempat\s+tinggal\s*:"),
    ("agama", r"(?:\d+\.\s*)?agama\s*:"),
    ("pekerjaan", r"(?:\d+\.\s*)?pekerjaan\s*:"),
]

# Identity block layout B (Anak/TPPO/Asusila without field labels): values are
# laid out on consecutive lines in canonical field order, one line per
# defendant per field (a value may wrap across several lines).
_IDENTITY_FIELDS = [
    "nama_lengkap",
    "tempat_lahir",
    "umur_tanggal_lahir",
    "jenis_kelamin",
    "kebangsaan",
    "tempat_tinggal",
    "agama",
    "pekerjaan",
]

# Content hints used to disambiguate bare-identity lines when a document has
# unusual line grouping. Each pattern is tested against a candidate line; the
# first field (in canonical order) whose pattern matches wins.
_BARE_HINTS: dict[str, re.Pattern[str]] = {
    "umur_tanggal_lahir": re.compile(
        r"\d+\s*tahun|\d+\s*tahun\s*\d+\s*bulan|\d{1,2}\s*[-/]\s*\d{1,2}\s*[-/]\s*\d{4}",
        re.IGNORECASE,
    ),
    "jenis_kelamin": re.compile(r"laki\s*-?\s*laki|perempuan", re.IGNORECASE),
    "kebangsaan": re.compile(r"^indonesia\b", re.IGNORECASE),
    "tempat_tinggal": re.compile(
        r"kota|kabupaten|kecamatan|kelurahan|desa|dusun|jalan|jl\.|gang|rt\.?\s|rw\.?\s|kampung",
        re.IGNORECASE,
    ),
    "agama": re.compile(r"islam|kristen|katholik|katolik|protestan|hindu|budha|buddha", re.IGNORECASE),
    "pekerjaan": re.compile(
        r"pelajar|mahasiswa|belum/tidak bekerja|belum bekerja|tidak bekerja|wiraswasta|swasta|buruh|ibu rumah tangga|petani|karyawan",
        re.IGNORECASE,
    ),
}

# Line that clearly does not belong to the identity block (start of the next
# logical part of the document).
_POST_IDENTITY_LINE = re.compile(
    r"^(?:setelah\s+)?mendengar\b|^menimbang\b|^membaca\b|^memperhatikan\b|^anak\s+(?:sedang|dalam|tidak|i\s+sedang|ii\s+sedang|ditahan)\b"
    r"|^terdakwa\s+(?:sedang|dalam|tidak|ditahan)\b|^bahwa\s+anak\b|^terdakwa\s+ditahan\b|^para\s+terdakwa\b"
    r"|^bahwa\s+terdakwa\b|^untuk\s+menjunjung\b|^menyatakan\s+terdakwa\b|^:\s*$",
    re.IGNORECASE,
)

_RECOVERY_CUES: dict[str, tuple[re.Pattern[str], ...]] = {
    "penangkapan": (re.compile(r"\bpenangkapan\b|\bditangkap\b", re.I),),
    "penahanan": (re.compile(r"\bpenahanan\b|\bditahan\b", re.I),),
    "tuntutan": (re.compile(r"pembacaan\s+tuntutan|tuntutan\s+pidana", re.I),),
    "dakwaan": (re.compile(r"surat\s+dakwaan|\bdidakwa\b", re.I),),
    "saksi": (re.compile(r"mengajukan\s+saksi|saksi\s*-\s*saksi|keterangan\s+saksi", re.I),),
    "ahli": (re.compile(r"saksi\s+ahli|keterangan\s+ahli|tenaga\s+ahli|ahli\s+kedokteran", re.I),),
    "terdakwa": (re.compile(r"(?:memberikan\s+)?keterangan\s+(?:terdakwa|anak)|(?:anak|terdakwa).{0,120}(?:memberikan\s+keterangan|menerangkan)", re.I),),
    "surat": (re.compile(r"bukti\s+surat|alat\s+bukti\s+surat|berkas\s+perkara\s+dan\s+surat|mengajukan\s+surat|dibacakan\s+visum", re.I),),
    "petunjuk_barang_bukti": (re.compile(r"mengajukan\s+barang\s+bukti|barang\s+bukti\s+berupa|menetapkan\s+barang\s+bukti", re.I),),
    "fakta_hukum": (re.compile(r"fakta\s*-\s*fakta\s+hukum|fakta\s+hukum", re.I),),
    "pertimbangan_hukum": (re.compile(r"mempertimbangkan|selanjutnya.{0,100}(?:hakim|majelis)", re.I),),
}
_RECOVERY_BOUNDARY = re.compile(
    r"^(?:menimbang|mengingat|mengadili|menetapkan|demikian(?:lah)?\b|panitera\b|ttd\.?$|setelah\s+membaca)\b",
    re.I,
)


@dataclass
class SectionSpan:
    key: str
    start: int
    end: int
    text: str


def _normalise(text: str) -> str:
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    lines = text.splitlines()
    deduped: list[str] = []
    for line in lines:
        if deduped and line.strip() and line.strip() == deduped[-1].strip():
            continue
        deduped.append(line)
    text = "\n".join(deduped)
    return text.strip()


def locate_first_anchor(text: str, key: str, search_from: int = 0) -> int | None:
    """Earliest anchor match of ``key`` at/after ``search_from``.

    All patterns for a section are tried and the earliest match wins. This is
    important for sections whose generic pattern (e.g. ``^pengadilan negeri``)
    would otherwise skip an earlier, more specific form such as
    "Pengadilan Anak pada Pengadilan Negeri X" and match a body mention instead.
    """
    if key == "ahli":
        for pat in get_anchor_patterns().get(key, []):
            m = pat.search(text, search_from)
            if m:
                return m.start()
        return None

    best: int | None = None
    for pat in get_anchor_patterns().get(key, []):
        m = pat.search(text, search_from)
        if m and (best is None or m.start() < best):
            best = m.start()
    return best


def _find_identity(text: str, start: int, end: int) -> dict[str, int]:
    """Split identity block [start, end) into per-field starts. Layout-agnostic."""
    block = text[start:end]
    found: dict[str, int] = {}

    labelled = re.search(
        r"(?:\d+\.\s*)?nama\s+lengkap\s*:", block, re.IGNORECASE
    ) is not None

    if labelled:
        for key, pat in _LABELLED_FIELDS:
            m = re.search(pat, block, re.IGNORECASE)
            if m:
                found[key] = start + m.start()
        return found

    # Bare layout: the block is a sequence of lines. Values appear in canonical
    # field order; a value may occupy several consecutive lines (multi-line
    # value) or repeat per defendant. We walk lines, deciding when to advance
    # to the next field.
    lines = block.split("\n")
    non_empty = [(i, l) for i, l in enumerate(lines) if l.strip()]
    if not non_empty:
        return found

    def line_offset(i: int) -> int:
        return start + sum(len(l) + 1 for l in lines[:i])

    # First line: nama_lengkap (skips any leading ":" or "Anak" headings).
    first_idx, first_line = non_empty[0]
    found["nama_lengkap"] = line_offset(first_idx)

    # A bare heading line (e.g. "Anak I" in a multi-defendant doc) is part of
    # keterangan_perkara; the real name values follow it after a blank line and
    # themselves start with a name pattern. Detect and skip such headings.
    def _is_label(line: str) -> bool:
        return bool(
            re.fullmatch(
                r"(?:anak|terdakwa|para\s+(?:anak|terdakwa))(?:\s+[IVXivx0-9]+)?",
                line.strip(),
                re.IGNORECASE,
            )
        )

    if _is_label(first_line) and len(non_empty) >= 3:
        next_idx = non_empty[1][0]
        # separated from the next non-empty line by a blank?
        separated = any(not lines[j].strip() for j in range(first_idx + 1, next_idx))
        if separated and _is_label(non_empty[1][1]):
            # heading line -> nama_lengkap actually starts at second line
            found["nama_lengkap"] = line_offset(next_idx)
            first_idx = next_idx

    # start the walk from the line after the (possibly skipped) name value
    start_pos = 1
    for q in range(len(non_empty)):
        if non_empty[q][0] == first_idx:
            start_pos = q + 1
            break

    field_idx = 1  # next field after nama_lengkap

    def hint_matches(line: str) -> tuple[int, str] | None:
        for j, fk in enumerate(_IDENTITY_FIELDS[field_idx:]):
            h = _BARE_HINTS.get(fk)
            if h and h.search(line):
                return field_idx + j, fk
        return None

    for pos in range(start_pos, len(non_empty)):
        i, l = non_empty[pos]
        prev_i = non_empty[pos - 1][0]
        separated = any(not lines[j].strip() for j in range(prev_i + 1, i))
        hint = hint_matches(l)

        if separated:
            if hint is not None:
                # skip to the hinted field (consume it so the next separated
                # line cannot re-assign the same field)
                field_idx = hint[0] + 1
                found[hint[1]] = line_offset(i)
            elif field_idx < len(_IDENTITY_FIELDS):
                fk = _IDENTITY_FIELDS[field_idx]
                found[fk] = line_offset(i)
                field_idx += 1
            else:
                break

    return found


def _find_tail(text: str, start: int, end: int) -> dict[str, int]:
    """Parse the tail after amar putusan (hari, tanggal, tahun, ...).

    The tail is a small sequence of short fields then one or two long
    paragraphs. Returns {key: start_offset} for keys found inside [start, end).
    """
    tail = text[start:end]
    lines = tail.split("\n")
    nlines = len(lines)
    found: dict[str, int] = {}

    def line_off(i: int) -> int:
        return start + sum(len(l) + 1 for l in lines[:i])

    def non_empty_line(i: int) -> bool:
        return 0 <= i < nlines and lines[i].strip() != ""

    # ---- walk lines sequentially -------------------------------------
    # The tail has two layouts:
    #   PUTUSAN:  <hari>\n<tanggal>\n<tahun>\n<Demikianlah diputuskan ...>
    #             \n<panitera name>\n<Panitera Pengganti, Hakim,>\n<ttd ...>
    #   PENETAPAN (diversi, some TPPO): <tanggal>\n<tahun>\n<judge name>
    #             \n<Hakim>\n<ttd>\n<judge name>
    i = 0

    # day of week (only in PUTUSAN layout). If absent, leave i at 0 so the
    # date loop below still finds the tanggal/tahun lines.
    day_idx: int | None = None
    for j in range(i, nlines):
        if _DAY_RE.search(lines[j]):
            day_idx = j
            break
    if day_idx is not None:
        found["hari"] = line_off(day_idx)
        i = day_idx + 1

    # tanggal: first standalone date line (or bare day number)
    while i < nlines:
        ln = lines[i].strip()
        if _DATE_RE.fullmatch(ln) or _DAY_NUM_RE.fullmatch(ln):
            found["tanggal"] = line_off(i)
            i += 1
            break
        i += 1

    # tahun: first standalone 4-digit year line after tanggal
    while i < nlines:
        ln = lines[i].strip()
        if _YEAR_RE.fullmatch(ln):
            found["tahun"] = line_off(i)
            i += 1
            break
        i += 1

    # siapa_yang_memutus: the paragraph with "Demikianlah diputuskan ..."
    # or "diputuskan" / "sebagai Hakim" / "Panitera Pengganti", or the
    # standalone judge-name line in the PENETAPAN layout.
    #
    # Walk order: prefer the "Demikianlah ... diputuskan ..." paragraph (the
    # long PUTUSAN tail) or a standalone judge-name line; do NOT accept the
    # signature header like "HAKIM PENGADILAN NEGERI X," which also contains
    # the word "Hakim".
    while i < nlines:
        ln = lines[i]
        if _TAIL_DEMIKIAN.search(ln):
            found["siapa_yang_memutus"] = line_off(i)
            i += 1
            break
        stripped = ln.strip()
        if (
            stripped
            and _NAME_LINE_RE.match(stripped)
            and re.search(r"\bhakim\b|memutus|mengadili|mempersidangkan|sebagai\s+", stripped, re.IGNORECASE) is None
        ):
            # standalone name line, likely the judge who decided
            found["siapa_yang_memutus"] = line_off(i)
            i += 1
            break
        if _TAIL_JUDGE.search(ln) and "sebagai" in ln.lower():
            found["siapa_yang_memutus"] = line_off(i)
            i += 1
            break
        i += 1

    # panitera_pengganti / tanda_tangan_majelis: scan the rest of the tail for
    # the signature block. It starts at the first short signature-header line
    # ("Panitera Pengganti, Hakim," / "Panitera," / "Hakim-Hakim Anggota" /
    # "HAKIM PENGADILAN NEGERI X,"). The panitera name is the name line tied to
    # a "Panitera ..." header: usually the name line right before it (standard
    # layout), but when the header is a bare "Panitera"/"Panitera Pengganti"
    # followed by a standalone name, the name comes after it.
    ttd_idx: int | None = None
    pp_idx: int | None = None
    while i < nlines:
        ln = lines[i].strip()
        if _TAIL_TTD.search(ln) and ttd_idx is None:
            ttd_idx = i
        elif ln and len(ln) < 60:
            if _TAIL_SIG.match(ln) and ttd_idx is None:
                ttd_idx = i
            if ln.lower().startswith("panitera") and pp_idx is None:
                pp_idx = i
        i += 1

    if pp_idx is not None:
        header = lines[pp_idx].strip().lower()
        name_off: int | None = None
        if "hakim" not in header:
            # bare "Panitera"/"Panitera Pengganti" header: the panitera name
            # follows it (e.g. "Panitera Pengganti\nYayan Sulendro, S.H., M.H.")
            j = pp_idx + 1
            while j < nlines and not lines[j].strip():
                j += 1
            if j < nlines and _NAME_LINE_RE.match(lines[j].strip()) and _TAIL_TTD.search(lines[j]) is None:
                name_off = line_off(j)
        if name_off is None:
            # standard layout: the panitera name precedes the header
            j = pp_idx - 1
            while j >= 0 and not lines[j].strip():
                j -= 1
            if j >= 0 and _NAME_LINE_RE.match(lines[j].strip()) and _TAIL_TTD.search(lines[j]) is None:
                name_off = line_off(j)
        if name_off is not None:
            found["panitera_pengganti"] = name_off

    if ttd_idx is not None:
        found["tanda_tangan_majelis"] = line_off(ttd_idx)

    # Fallbacks when the walk above failed.
    if "tanda_tangan_majelis" not in found:
        m = _TAIL_SIG.search(tail)
        if not m:
            m = _TAIL_TTD.search(tail)
        if m:
            found["tanda_tangan_majelis"] = start + m.start()

    if "panitera_pengganti" not in found:
        m = re.search(r"panitera\s+pengganti\b", tail, re.IGNORECASE)
        if m:
            found["panitera_pengganti"] = start + m.start()

    if "siapa_yang_memutus" not in found:
        m = _TAIL_DEMIKIAN.search(tail)
        if not m:
            m = _TAIL_JUDGE.search(tail)
        if m:
            found["siapa_yang_memutus"] = start + m.start()

    # PENETAPAN layout: after the year, a standalone judge-name line followed
    # by the signature block. The name line itself is siapa_yang_memutus.
    if "siapa_yang_memutus" not in found:
        year_off = found.get("tahun")
        if year_off is not None:
            sub = tail[year_off - start:]
            for ln in sub.split("\n"):
                if _NAME_LINE_RE.match(ln.strip()):
                    found["siapa_yang_memutus"] = year_off + sub.find(ln)
                    break

    return found


def _recover_body_span(text: str, key: str) -> str:
    """Recover one cue-bearing paragraph when ordered anchors collapsed."""
    cues = _RECOVERY_CUES.get(key, ())
    if not cues:
        return ""
    lines = text.splitlines(keepends=True)
    offset = 0
    for index, raw_line in enumerate(lines):
        line = raw_line.strip()
        if not line or not any(cue.search(line) for cue in cues):
            offset += len(raw_line)
            continue
        # Avoid treating a mention in the title/identity block as a body
        # section; body evidence normally starts with a legal paragraph cue.
        if index < 10 and not re.match(r"^(?:menimbang|setelah|membaca|[-•]|d\.)", line, re.I):
            offset += len(raw_line)
            continue
        end = offset + len(raw_line)
        for next_line in lines[index + 1 :]:
            stripped = next_line.strip()
            if stripped and _RECOVERY_BOUNDARY.match(stripped):
                break
            if not stripped:
                break
            end += len(next_line)
        return text[offset:end].strip()
    return ""


def _recover_signature_span(text: str, key: str) -> str:
    """Recover tail metadata when the amar boundary is absent in OCR text."""
    lines = text.splitlines(keepends=True)
    if key == "panitera_pengganti":
        pattern = re.compile(r"panitera\s+pengganti", re.I)
    else:
        pattern = re.compile(r"^(?:ttd\.?|hakim\s+anggota|panitera\s+pengganti)", re.I)
    offsets: list[int] = []
    offset = 0
    for line in lines:
        if pattern.search(line.strip()):
            offsets.append(offset)
        offset += len(line)
    if not offsets:
        return ""
    start = offsets[-1]
    index = 0
    running = 0
    for i, line in enumerate(lines):
        if running == start:
            index = i
            break
        running += len(line)
    if key == "panitera_pengganti":
        # Prefer the adjacent name line over a procedural sentence containing
        # the words "panitera pengganti".
        for direction in (1, -1):
            candidate = index + direction
            steps = 0
            while 0 <= candidate < len(lines) and steps < 5:
                value = lines[candidate].strip()
                if value and not re.match(r"^(?:panitera|hakim|ttd\.?|t\s*t\s*d)\b", value, re.I) and len(value) < 100:
                    return value
                candidate += direction
                steps += 1
    return "".join(lines[index : min(index + 5, len(lines))]).strip()


def _refine_defendant_boundary(text: str, boundaries: dict[str, int]) -> None:
    """Prefer defendant testimony inside the evidence interval."""
    lower = boundaries.get("dakwaan", 0)
    upper_candidates = [boundaries[k] for k in ("surat", "petunjuk_barang_bukti", "fakta_hukum", "pertimbangan_hukum", "amar_putusan") if k in boundaries and boundaries[k] > lower]
    upper = min(upper_candidates, default=len(text))
    patterns = get_anchor_patterns().get("terdakwa", [])[:3]
    candidates: list[int] = []
    for pattern in patterns:
        for match in pattern.finditer(text, lower):
            if match.start() < upper:
                candidates.append(match.start())
    if candidates:
        boundaries["terdakwa"] = max(candidates)


def _refine_body_boundaries(text: str, boundaries: dict[str, int]) -> None:
    """Use canonical neighboring sections to constrain specific body cues."""
    keys = ["saksi", "ahli", "terdakwa", "surat", "petunjuk_barang_bukti", "fakta_hukum", "pertimbangan_hukum"]
    for index, key in enumerate(keys):
        lower = boundaries.get(keys[index - 1], boundaries.get("dakwaan", 0)) if index else boundaries.get("dakwaan", 0)
        upper_values = [boundaries[k] for k in keys[index + 1 :] if k in boundaries and boundaries[k] > lower]
        upper = min(upper_values, default=boundaries.get("amar_putusan", len(text)))
        patterns = get_anchor_patterns().get(key, [])
        # The last pattern(s) are generic fallbacks; only use them if no
        # feature-specific cue exists in the constrained interval.
        candidates: list[int] = []
        for pattern in patterns:
            matches = [m.start() for m in pattern.finditer(text, lower) if m.start() < upper]
            if matches:
                candidates = matches
                break
        if candidates:
            boundaries[key] = min(candidates)


def _refine_pretrial_boundaries(text: str, boundaries: dict[str, int]) -> None:
    keys = ["penangkapan", "penahanan", "tuntutan", "dakwaan"]
    lower = boundaries.get("pekerjaan", 0)
    for index, key in enumerate(keys):
        upper_values = [boundaries[k] for k in keys[index + 1 :] if k in boundaries and boundaries[k] > lower]
        upper = min(upper_values, default=boundaries.get("saksi", len(text)))
        for pattern in get_anchor_patterns().get(key, []):
            matches = [m.start() for m in pattern.finditer(text, lower) if m.start() < upper]
            if matches:
                boundaries[key] = min(matches)
                lower = boundaries[key]
                break


def sectionize(text: str) -> dict[str, str]:
    """Extract all 31 sections from ``text``. Returns {key: span_text}."""
    text = _normalise(text)
    n = len(text)

# ---- Phase 1: ordered anchor scan -------------------------------
    boundaries: dict[str, int] = {}
    scan_from = 0
    for key in SECTION_ORDER:
        start = locate_first_anchor(text, key, scan_from)
        if start is not None:
            boundaries[key] = start
            scan_from = start

    _refine_pretrial_boundaries(text, boundaries)
    _refine_body_boundaries(text, boundaries)
    _refine_defendant_boundary(text, boundaries)

    # ---- Phase 2: derive spans ----------------------------------------

    # Coincident boundaries: if a body section's earliest anchor sits exactly
    # on the previous section's boundary, its generic fallback pattern matched
    # the previous section's own paragraph (e.g. pertimbangan's ``^menimbang``
    # matching the fakta_hukum paragraph). Re-scan it strictly after the
    # shared offset. Identity fields are excluded - their spans are rebuilt by
    # the Phase 3a walk and must keep the Phase 1 anchor.
    for i, key in enumerate(SECTION_ORDER):
        prev = SECTION_ORDER[i - 1] if i > 0 else None
        if (
            key in boundaries
            and prev in boundaries
            and boundaries[key] == boundaries[prev]
            and key not in IDENTITY_KEYS
        ):
            rescan = locate_first_anchor(text, key, boundaries[key] + 1)
            if rescan is not None:
                boundaries[key] = rescan
            else:
                del boundaries[key]
    found_keys = [k for k in SECTION_ORDER if k in boundaries]
    spans: dict[str, SectionSpan] = {}

    # Tail short fields and the court name are single standalone lines; their
    # span must not bleed into the following paragraph.
    _SHORT_LINE_KEYS = {"hari", "tanggal", "tahun", "nama_pengadilan_negeri", *IDENTITY_KEYS}

    def _span_end(start: int) -> int:
        nl = text.find("\n", start)
        return nl + 1 if nl != -1 else n

    def _derive_spans() -> None:
        for i, key in enumerate(SECTION_ORDER):
            if key not in boundaries:
                spans[key] = SectionSpan(key=key, start=-1, end=-1, text="")
                continue
            start = boundaries[key]
            end = n
            for nk in SECTION_ORDER:
                if (
                    nk in boundaries
                    and boundaries[nk] > start
                    and SECTION_INDEX[nk] > i
                ):
                    end = boundaries[nk]
                    break
            if key in _SHORT_LINE_KEYS:
                end = min(end, _span_end(start))
            spans[key] = SectionSpan(key=key, start=start, end=end, text=text[start:end])

    _derive_spans()

    # ---- Phase 3: structural refinements ------------------------------
    # 3a. Identity block: always refine the identity fields structurally. The
    #     anchor scan alone is unreliable for bare (Anak) layouts, where field
    #     values are unlabelled lines in canonical order.
    if "nama_lengkap" in boundaries:
        block_start = boundaries["nama_lengkap"]
        block_end = n
        for k in found_keys:
            if boundaries[k] > block_start and k not in IDENTITY_KEYS:
                block_end = boundaries[k]
                break
        parsed = _find_identity(text, block_start, block_end)
        if parsed:
            for k, pos in parsed.items():
                boundaries[k] = pos
            _derive_spans()

    # 3b. Tail: hari/tanggal/tahun/siapa/panitera/ttd after amar putusan.
    if "amar_putusan" in boundaries:
        tail_start = boundaries["amar_putusan"]
        tail_end = n
        for k in found_keys:
            if boundaries[k] > tail_start and k not in TAIL_KEYS:
                tail_end = boundaries[k]
                break
        tail = _find_tail(text, tail_start, tail_end)
        if tail:
            for k, pos in tail.items():
                boundaries[k] = pos
            _derive_spans()

    # 3c. OCR/plain-text recovery: when the ordered scan assigned a generic
    # paragraph to a body key (or found no span), use a bounded paragraph that
    # actually contains that feature's cue.
    for key, cues in _RECOVERY_CUES.items():
        current = spans.get(key)
        if current is not None and current.text.strip() and any(cue.search(current.text) for cue in cues):
            continue
        recovered = _recover_body_span(text, key)
        if recovered:
            spans[key] = SectionSpan(key=key, start=-1, end=-1, text=recovered)

    for key in ("panitera_pengganti", "tanda_tangan_majelis"):
        current = spans.get(key)
        recovered = _recover_signature_span(text, key)
        if key == "panitera_pengganti":
            current_bad = True
        else:
            current_bad = current is None or not current.text.strip()
        if recovered and current_bad:
            spans[key] = SectionSpan(key=key, start=-1, end=-1, text=recovered)

    return {k: v.text for k, v in spans.items()}

