# Repository Guidelines

## Project Structure & Module Organization

This repository contains the Sinergi backend, a FastAPI service. Application code lives in `app/`: HTTP endpoints are in `app/routes/`, request handling and persistence logic in `app/controllers/`, shared validation models in `app/schemas.py`, Firebase setup in `app/core/`, and RAG/model integrations in `app/rag/`, `app/services/`, and `app/vllm_on_demand.py`. Tests are under `tests/`. `data/` contains local evaluation documents; `scripts/` contains utility commands. `rag-anything/` is a vendored dependency project and should be changed only when explicitly required.

## Build, Test, and Development Commands

- `uv sync` — install or synchronize Python dependencies from `pyproject.toml` and `uv.lock`.
- `uv run uvicorn app.main:app --reload` — run the API locally with auto-reload.
- `uv run pytest -q` — run the backend test suite.
- `python -m compileall app` — perform a quick syntax check across application modules.
- `uv run python scripts/eval_rag.py` — run the repository’s RAG evaluation utility when its required configuration is available.

## Coding Style & Naming Conventions

Use Python 3.12-compatible syntax, four-space indentation, type hints, and `snake_case` for modules, functions, variables, and JSON fields. Use `PascalCase` for Pydantic models. Keep route definitions thin; put validation in schemas and business or Firestore logic in controllers/services. Format new code consistently with the surrounding modules and avoid unrelated rewrites.

## Testing Guidelines

Tests use `pytest` and `pytest-asyncio`; files are named `test_*.py` and test functions use `test_*`. Add focused tests for new routes, authentication/ownership checks, validation failures, and persistence behavior. Mock Firebase, model servers, and external services rather than requiring live credentials or downloaded models.

## Commit & Pull Request Guidelines

Use short, imperative commit subjects such as `Add project CRUD endpoints` or `Fix library ownership check`. Keep commits focused. Pull requests should describe the behavior change, identify API or schema changes, include test commands and results, link the relevant issue when available, and attach screenshots only when a frontend/API documentation change needs visual proof.

## Security & Configuration Tips

Copy `.env.example` to `.env` and provide Firebase service-account and storage settings locally. Never commit `.env`, service-account JSON files, tokens, or model API keys. Preserve bearer-token authentication on protected routes and verify the authenticated user owns every Firestore resource before reading or mutating it.
