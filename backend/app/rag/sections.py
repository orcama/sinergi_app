"""Canonical sections of an Indonesian court decision (putusan/penetapan).

The 31 canonical section keys, their Indonesian labels, the synonyms that map a
user question to the section, and the anchor regexes used to locate the section
span inside the raw document text.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

SECTION_ORDER: list[str] = [
    "judul",
    "nomor_putusan",
    "irah_irah",
    "nama_pengadilan_negeri",
    "keterangan_perkara",
    "nama_lengkap",
    "tempat_lahir",
    "umur_tanggal_lahir",
    "jenis_kelamin",
    "kebangsaan",
    "tempat_tinggal",
    "agama",
    "pekerjaan",
    "penangkapan",
    "penahanan",
    "tuntutan",
    "dakwaan",
    "saksi",
    "ahli",
    "terdakwa",
    "surat",
    "petunjuk_barang_bukti",
    "fakta_hukum",
    "pertimbangan_hukum",
    "amar_putusan",
    "hari",
    "tanggal",
    "tahun",
    "siapa_yang_memutus",
    "panitera_pengganti",
    "tanda_tangan_majelis",
]

SECTION_INDEX = {key: i for i, key in enumerate(SECTION_ORDER)}

# Indonesian display labels used when serving text back to the user.
SECTION_LABELS: dict[str, str] = {
    "judul": "Judul Putusan",
    "nomor_putusan": "Nomor Putusan",
    "irah_irah": "Irah-irah",
    "nama_pengadilan_negeri": "Nama Pengadilan Negeri",
    "keterangan_perkara": "Keterangan Perkara",
    "nama_lengkap": "Nama Lengkap",
    "tempat_lahir": "Tempat Lahir",
    "umur_tanggal_lahir": "Umur / Tanggal Lahir",
    "jenis_kelamin": "Jenis Kelamin",
    "kebangsaan": "Kebangsaan",
    "tempat_tinggal": "Tempat Tinggal",
    "agama": "Agama",
    "pekerjaan": "Pekerjaan",
    "penangkapan": "Penangkapan",
    "penahanan": "Penahanan",
    "tuntutan": "Tuntutan",
    "dakwaan": "Dakwaan",
    "saksi": "Saksi",
    "ahli": "Ahli",
    "terdakwa": "Keterangan Terdakwa",
    "surat": "Surat / Bukti Surat",
    "petunjuk_barang_bukti": "Petunjuk / Barang Bukti",
    "fakta_hukum": "Fakta Hukum",
    "pertimbangan_hukum": "Pertimbangan Hukum",
    "amar_putusan": "Amar Putusan",
    "hari": "Hari",
    "tanggal": "Tanggal",
    "tahun": "Tahun",
    "siapa_yang_memutus": "Siapa yang Memutus",
    "panitera_pengganti": "Panitera Pengganti",
    "tanda_tangan_majelis": "Tanda Tangan Majelis",
}

# Synonym/feature keywords used to map a user question to the correct section.
SECTION_SYNONYMS: dict[str, list[str]] = {
    "judul": ["judul", "judul putusan", "kepala putusan", "header putusan"],
    "nomor_putusan": [
        "nomor putusan",
        "nomor perkara",
        "no putusan",
        "nomor",
        "nomor penetapan",
    ],
    "irah_irah": ["irah irah", "irah-irah", "demi keadilan", "ketuhanan yang maha esa"],
    "nama_pengadilan_negeri": [
        "nama pengadilan",
        "pengadilan negeri",
        "pengadilan anak",
        "nama pengadilan negeri",
        "nama pengadilan anak",
        "pengadilan",
    ],
    "keterangan_perkara": [
        "keterangan perkara",
        "perkara pidana",
        "acara pemeriksaan",
        "tingkat pertama",
        "perkara terdakwa",
        "perkara anak",
    ],
    "nama_lengkap": [
        "nama lengkap",
        "nama terdakwa",
        "nama anak",
        "nama para terdakwa",
        "identitas terdakwa",
        "identitas anak",
        "identitas",
        "nama para anak",
    ],
    "tempat_lahir": ["tempat lahir", "lahir di", "dilahirkan di"],
    "umur_tanggal_lahir": [
        "umur",
        "tanggal lahir",
        "umur tanggal lahir",
        "usia",
        "tahun umur",
        "usia terdakwa",
    ],
    "jenis_kelamin": ["jenis kelamin", "kelamin", "laki laki", "perempuan", "gender"],
    "kebangsaan": ["kebangsaan", "kewarganegaraan", "bangsa", "wni", "warga negara"],
    "tempat_tinggal": ["tempat tinggal", "alamat", "domisili", "tinggal", "bertempat tinggal"],
    "agama": ["agama"],
    "pekerjaan": ["pekerjaan", "profesi", "pekerjaannya"],
    "penangkapan": ["penangkapan", "ditangkap", "penangkapan terdakwa", "surat perintah penangkapan"],
    "penahanan": ["penahanan", "ditahan", "tahanan", "tahanan rumah tahanan", "masa penahanan"],
    "tuntutan": ["tuntutan", "tuntutan pidana", "pembacaan tuntutan", "rekuisitor", "tuntutan jaksa"],
    "dakwaan": ["dakwaan", "surat dakwaan", "didakwa", "dakwaan alternatif", "dakwaan tunggal"],
    "saksi": ["saksi", "saksi saksi", "keterangan saksi", "saksi yang diajukan", "para saksi", "saksi korban"],
    "ahli": ["ahli", "saksi ahli", "keterangan ahli", "pendapat ahli"],
    "terdakwa": [
        "keterangan terdakwa",
        "terdakwa di persidangan",
        "keterangan anak",
        "anak di persidangan",
        "pembelaan terdakwa",
        "keterangan para terdakwa",
    ],
    "surat": ["surat", "bukti surat", "berkas perkara", "surat surat", "alat bukti surat"],
    "petunjuk_barang_bukti": [
        "barang bukti",
        "petunjuk",
        "alat bukti",
        "petunjuk barang bukti",
        "barang bukti berupa",
    ],
    "fakta_hukum": ["fakta hukum", "fakta fakta hukum", "fakta", "fakta di persidangan"],
    "pertimbangan_hukum": [
        "pertimbangan hukum",
        "pertimbangan hakim",
        "menimbang",
        "pertimbangan majelis",
        "ratio decidendi",
        "konsiderans",
        "alasan hakim",
    ],
    "amar_putusan": [
        "amar putusan",
        "amar penetapan",
        "amar",
        "mengadili",
        "menetapkan",
        "diktum",
        "isi putusan",
        "putusan",
    ],
    "hari": ["hari putusan", "hari apa", "diputus pada hari"],
    "tanggal": ["tanggal putusan", "tanggal diputus", "tanggal", "tanggal penetapan"],
    "tahun": ["tahun putusan", "tahun"],
    "siapa_yang_memutus": [
        "siapa yang memutus",
        "siapa yang mengadili",
        "hakim ketua",
        "hakim anggota",
        "majelis hakim",
        "nama hakim",
        "hakim yang memutus",
        "diputuskan oleh",
        "yang memutus",
    ],
    "panitera_pengganti": ["panitera pengganti", "panitera", "sekretaris persidangan"],
    "tanda_tangan_majelis": [
        "tanda tangan",
        "ttd",
        "tanda tangan majelis",
        "ttd hakim",
        "tanda tangan hakim",
    ],
}

# Anchor regexes per section (compiled lazily). Each regex matches the START of
# the section's text in a whitespace-normalised document. Patterns are tried in
# order and the first match at/after the previous section boundary is used.
SECTION_ANCHORS: dict[str, list[str]] = {
    "judul": [
        r"^p\s*u\s*t\s*u\s*s\s*a\s*n",
        r"^p\s*e\s*n\s*e\s*t\s*a\s*p\s*a\s*n",
        r"^penetapan",
        r"^putusan",
        r"^verstek",
    ],
    "nomor_putusan": [r"^nomor\s+[\w./\-–—]+\s*(?:pid|pdt|ptk|perkara|pns)"],
    "irah_irah": [r"^demi\s+keadilan\s+berdasarkan"],
    "nama_pengadilan_negeri": [
        r"^pengadilan\s+negeri\s+[a-z]",
        r"^pengadilan\s+anak\s+",
        r"^hakim\s+pengadilan\s+negeri",
    ],
    "keterangan_perkara": [
        r"^(?:pengadilan\s+negeri|pengadilan\s+anak|hakim).*?(?:yang\s+mengadili|mengadili)",
        r"^membaca\b",
        r"^berikut\s+dalam\s+perkara\b",
        r"^dalam\s+perkara\b",
    ],
    "nama_lengkap": [
        r"^(?:1\.\s*)?nama\s+lengkap\s*:",
        r"^nama\s*:\s*",
        r"^nama\s+lengkap",
        r"^[\w .,;'\/\-()]+?\b(?:bin|binti|als|alias|alm\.?)\b[\w .,;'\/\-()]*$",
        r"^(?!pengadilan\s|hakim\s|panitera\s|menimbang\b|membaca\b|memperhatikan\b|mengadili\b|menetapkan\b|menyatakan\b|presiden\b)[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$",
        r"^(?!pengadilan\s|hakim\s|panitera\s|menimbang\b|membaca\b|memperhatikan\b|mengadili\b|menetapkan\b|menyatakan\b|presiden\b)[A-Z0-9][A-Z0-9.]*(?:\s+[A-Z0-9][A-Z0-9.]*){1,3}$",
        r"^anak\b",
        r"^terdakwa\b",
        r"^para\s+terdakwa\b",
        r"^(?:1\.\s*)?terdakwa\b",
        r"^terdakwa\s+\(",
    ],
    "tempat_lahir": [
        r"^(?:2\.\s*)?tempat\s+lahir\s*:",
        r"^tempat\s+lahir\b",
    ],
    "umur_tanggal_lahir": [
        r"^(?:3\.\s*)?umur\s*/\s*tanggal\s+lahir\s*:",
        r"^umur\s*/\s*tanggal\s+lahir",
        r"^umur\s*tanggal\s+lahir",
    ],
    "jenis_kelamin": [
        r"^(?:4\.\s*)?jenis\s+kelamin\s*:",
        r"^jenis\s+kelamin\b",
    ],
    "kebangsaan": [
        r"^(?:5\.\s*)?kebangsaan\s*:",
        r"^kebangsaan\b",
        r"^warga\s+negara\s+indonesia\b",
    ],
    "tempat_tinggal": [
        r"^(?:6\.\s*)?tempat\s+tinggal\s*:",
        r"^alamat\s*:",
    ],
    "agama": [
        r"^(?:7\.\s*)?agama\s*:",
        r"^agama\b",
    ],
    "pekerjaan": [
        r"^(?:8\.\s*)?pekerjaan\s*:",
        r"^pekerjaan\b",
    ],
    "penangkapan": [
        r"^(?:terdakwa|anak|para\s+terdakwa)\b(?:(?!\n\n).)*?ditangkap",
        r"^penangkapan\b",
        r"^menangkap\b",
        r"^telah\s+ditangkap\b",
        r"^dilakukan\s+penangkapan\b",
    ],
    "penahanan": [
        r"^(?:terdakwa|anak|para\s+terdakwa)\b(?:(?!\n\n).)*?ditahan",
        r"^penahanan\b",
        r"^tahanan\b",
        r"^rumah\s+tahanan\b",
    ],
    "tuntutan": [
        r"^setelah\s+mendengar\s+pembacaan\s+tuntutan",
        r"^tuntutan\b",
        r"^tuntutan\s+pidana\b",
        r"^mendengar\s+pembacaan\s+tuntutan",
    ],
    # Body sections open with "Menimbang, bahwa ...". The keyword must appear
    # within the same logical paragraph, i.e. before the next line that starts
    # with "Menimbang" (these paragraphs are NOT always blank-line separated).
    # The tempered dot stops at the next "Menimbang" line so the generic
    # "^menimbang" cannot swallow the whole document with DOTALL.
    "dakwaan": [
        r"^menimbang\b(?:(?!\n\s*menimbang\b).)*?\bdakwaan\b",
        r"^surat\s+dakwaan\b",
        r"^dakwaan\b",
        r"^didakwa\b",
        r"^bahwa\s+ia\s+terdakwa\b",
    ],
    "saksi": [
        r"^menimbang\b(?:(?!\n\s*menimbang\b).)*?\b(?:mengajukan\s+saksi|saksi\s*-\s*saksi)\b",
        r"^saksi\s*-\s*saksi\b",
        r"^untuk\s+membuktikan\s+dakwaannya\b",
        r"^mengajukan\s+saksi\b",
    ],
    "ahli": [
        r"^menimbang\b(?:(?!\n\s*menimbang\b).)*?\b(?:mengajukan\s+ahli|saksi\s+ahli|pendapat\s+ahli)\b",
        r"^menimbang\b(?:(?!\n\s*menimbang\b).)*?\b(?:keterangan\s+ahli|tenaga\s+ahli|ahli\s+kedokteran)\b",
        r"^saksi\s+ahli\b",
        r"^mengajukan\s+ahli\b",
    ],
    "terdakwa": [
        r"^menimbang\b(?:(?!\n\s*menimbang\b).)*?\b(?:terdakwa|anak)\s+di\s+persidangan\b",
        r"^menimbang\b(?:(?!\n\s*menimbang\b).)*?\b(?:terdakwa|anak)\s+memberikan\s+keterangan\b",
        r"^menimbang\b(?:(?!\n\s*menimbang\b).)*?\b(?:terdakwa|anak)\b.*?\bpada\s+pokoknya\s+menerangkan\b",
        r"^keterangan\s+(?:terdakwa|anak)\b",
    ],
    "surat": [
        r"^-\s*berkas\s+perkara\b",
        r"^berkas\s+perkara\s+dan\s+surat",
        r"^menimbang\b(?:(?!\n\s*menimbang\b).)*?\bbukti\s+surat\b",
        r"^menimbang\b(?:(?!\n\s*menimbang\b).)*?\b(?:mengajukan\s+surat|dibacakan\s+visum)\b",
        r"^bukti\s+surat\b",
        r"^surat\s*:\b",
        r"^menimbang\b(?:(?!\n\s*menimbang\b).)*?\bsurat\s*-\s*surat\b",
        r"^menimbang\b(?:(?!\n\s*menimbang\b).)*?\bberdasarkan\s+berita\s+acara\b",
        r"^menimbang\b(?:(?!\n\s*menimbang\b).)*?\bdi\s+persidangan\s+telah\s+pula\b",
        r"^(?:bahwa\s+)?berdasarkan\s+laporan\s+sosial\b",
        r"^setelah\s+membaca\b",
        r"^menimbang\b(?:(?!\n\s*menimbang\b).)*?\bpenuntut\s+umum\s+(?:telah\s+)?mengajukan\b(?:(?!\n\s*menimbang\b).)*?\bsurat\b",
    ],
"petunjuk_barang_bukti": [
        r"^menimbang\b(?:(?!\n\s*menimbang\b).)*?\bmengajukan\s+barang\s+bukti\b",
        r"^menimbang\b(?:(?!\n\s*menimbang\b).)*?\bmenetapkan\s+barang\s+bukti\b",
    ],
    "fakta_hukum": [
        r"^menimbang\b(?:(?!\n\s*menimbang\b).)*?\bfakta\s*-\s*fakta\s+hukum\b",
        r"^menimbang\b(?:(?!\n\s*menimbang\b).)*?\bfakta\s+hukum\b",
        r"^fakta\s*-\s*fakta\s+hukum\b",
        r"^fakta\s+hukum\b",
        r"^berdasarkan\s+alat\s+bukti\b(?:(?!\n\s*menimbang\b).)*?\bfakta\b",
    ],
    "pertimbangan_hukum": [
        r"^menimbang\b(?:(?!\n\s*menimbang\b).)*?\b(?:selanjutnya|majelis\s+hakim|hakim\s+akan)\b",
        r"^menimbang\b(?:(?!\n\s*menimbang\b).)*?\bmempertimbangkan\b",
        r"^menimbang\b",
        r"^mengambil\s+alih\b",
    ],
    "amar_putusan": [
        r"^m\s*e\s*n\s*g\s*a\s*d\s*i\s*l\s*i\s*:",
        r"^mengadili\s*:",
        r"^m\s*e\s*n\s*e\s*t\s*a\s*p\s*k\s*a\s*n\s*:",
        r"^menetapkan\s*:",
        r"^mengadili\b",
        r"^menetapkan\b",
    ],
    "hari": [
        r"^(?:senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|juma’at)\b",
    ],
    "tanggal": [
        r"^\d{1,2}\s+(?:januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+\d{4}\b",
        r"^\d{1,2}\s*[-/]\s*\d{1,2}\s*[-/]\s*\d{4}\b",
    ],
    "tahun": [r"^(?:19|20)\d{2}\b"],
    "siapa_yang_memutus": [
        r"^demikianlah\s+diputuskan\b",
        r"^demikian\s+diputuskan\b",
        r"^diputuskan\b",
        r"^oleh\s+kami\b",
        r"^demikianlah\b",
    ],
    "panitera_pengganti": [
        r"^panitera\s+pengganti\b",
        r"^panitera\s+pengganti\s*,",
    ],
    "tanda_tangan_majelis": [
        r"^hakim\s+anggota\s*,\s*hakim\s+ketua\b",
        r"^hakim\s*-\s*hakim\s+anggota\b",
        r"^hakim\s+anggota\b",
        r"^ttd\b",
        r"^panitera\s+pengganti\s*,\s*hakim\b",
    ],
}

_COMPILED_ANCHORS: dict[str, list[re.Pattern[str]]] | None = None


def _compile_anchors() -> dict[str, list[re.Pattern[str]]]:
    global _COMPILED_ANCHORS
    if _COMPILED_ANCHORS is None:
        _COMPILED_ANCHORS = {
            key: [
                re.compile(pat, re.IGNORECASE | re.MULTILINE | re.DOTALL)
                for pat in patterns
            ]
            for key, patterns in SECTION_ANCHORS.items()
        }
    return _COMPILED_ANCHORS


def get_anchor_patterns() -> dict[str, list[re.Pattern[str]]]:
    return _compile_anchors()
