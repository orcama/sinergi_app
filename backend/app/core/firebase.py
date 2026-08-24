from __future__ import annotations

import json
import os
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore, storage
from dotenv import load_dotenv

load_dotenv()


def _json_object(raw: str, variable: str) -> dict[str, object]:
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{variable} must contain valid service-account JSON") from exc
    if not isinstance(value, dict):
        raise RuntimeError(f"{variable} must contain a JSON object")
    return value


def _path_candidates(value: str) -> list[Path]:
    path = Path(value).expanduser()
    if path.is_absolute():
        return [path]
    backend_root = Path(__file__).resolve().parents[2]
    return [Path.cwd() / path, backend_root / path]


def _service_account_credential():
    raw_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    if raw_json:
        return credentials.Certificate(_json_object(raw_json, "FIREBASE_SERVICE_ACCOUNT_JSON"))

    path_value = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "").strip()
    if path_value:
        for path in _path_candidates(path_value):
            if path.is_file():
                return credentials.Certificate(str(path))
        searched = ", ".join(str(path) for path in _path_candidates(path_value))
        raise RuntimeError(
            "FIREBASE_SERVICE_ACCOUNT_PATH does not point to an existing file. "
            f"Searched: {searched}. Use FIREBASE_SERVICE_ACCOUNT_JSON or Google "
            "Application Default Credentials in production."
        )

    # Cloud Run/App Hosting and other Google-managed runtimes provide ADC via
    # the runtime service account. No private key file is needed there.
    return credentials.ApplicationDefault()


def _firebase_options() -> dict[str, str]:
    options: dict[str, str] = {}
    raw_config = os.getenv("FIREBASE_CONFIG", "").strip()
    config: dict[str, object] = {}
    if raw_config:
        if raw_config.startswith("{"):
            config = _json_object(raw_config, "FIREBASE_CONFIG")
        else:
            for path in _path_candidates(raw_config):
                if path.is_file():
                    config = _json_object(path.read_text(encoding="utf-8"), "FIREBASE_CONFIG")
                    break
            if not config:
                raise RuntimeError(f"FIREBASE_CONFIG file was not found: {raw_config}")

    storage_bucket = os.getenv("FIREBASE_STORAGE_BUCKET", "").strip()
    if not storage_bucket:
        configured_bucket = config.get("storageBucket")
        if isinstance(configured_bucket, str):
            storage_bucket = configured_bucket.strip()
    if storage_bucket:
        options["storageBucket"] = storage_bucket
    return options


try:
    firebase_app = firebase_admin.get_app()
except ValueError:
    firebase_app = firebase_admin.initialize_app(_service_account_credential(), _firebase_options())

db = firestore.client(
    app=firebase_app,
    database_id=os.getenv("FIRESTORE_DATABASE_ID", "(default)").strip() or "(default)",
)
