# Backend Setup and Usage

The backend has two Python services:

| Service | Port | Purpose |
| --- | --- | --- |
| vLLM Metal | `8000` | Loads and serves the local language model |
| FastAPI gateway | `8001` | Validates chat requests and forwards them to vLLM |

The configured runtime model is:

```text
mlx-community/DeepSeek-R1-Distill-Qwen-1.5B-4bit
```

It is an MLX 4-bit conversion of
`deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B`.

## Requirements

- Apple Silicon Mac
- Native arm64 shell
- Python 3.12
- `uv`

vLLM Metal cannot run on the Windows development machine.

## One-time backend setup

### 1. Install vLLM Metal

Run this on the Mac mini:

```bash
curl -fsSL https://raw.githubusercontent.com/vllm-project/vllm-metal/main/install.sh | bash
```

The official installer uses `uv` and creates `~/.venv-vllm-metal`. It installs
vLLM, the Metal plugin, MLX, and their dependencies. It does not download the
DeepSeek model.

### 2. Install the FastAPI dependencies

From the repository root:

```bash
cd backend
uv sync
```

`uv sync` is the backend equivalent of `npm install`. It creates
`backend/.venv` and installs the locked dependencies from `uv.lock`. It does not
download the model.

### 3. Create the backend environment file

While inside `backend`:

```bash
cp .env.example .env
```

Default configuration:

```dotenv
MODEL_ID=mlx-community/DeepSeek-R1-Distill-Qwen-1.5B-4bit
VLLM_BASE_URL=http://127.0.0.1:8000
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
REQUEST_TIMEOUT_SECONDS=300
```

## Starting the backend

Run the two backend processes in separate terminals.

### Terminal 1: start vLLM Metal

```bash
source ~/.venv-vllm-metal/bin/activate

vllm serve mlx-community/DeepSeek-R1-Distill-Qwen-1.5B-4bit \
  --served-model-name mlx-community/DeepSeek-R1-Distill-Qwen-1.5B-4bit \
  --host 127.0.0.1 \
  --port 8000 \
  --max-model-len 4096 \
  --max-num-seqs 2
```

The first execution of `vllm serve` downloads the model from Hugging Face.
Later executions reuse the cached model.

### Terminal 2: start FastAPI

From the repository root:

```bash
cd backend
uv run --env-file .env fastapi dev app/main.py \
  --host 127.0.0.1 \
  --port 8001
```

FastAPI automatically reloads when backend Python files change.

## Backend endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET http://127.0.0.1:8001/health` | Checks whether FastAPI can reach vLLM |
| `POST http://127.0.0.1:8001/api/chat` | Sends a conversation to the model |
| `GET http://127.0.0.1:8001/docs` | Interactive FastAPI documentation |
| `GET http://127.0.0.1:8000/health` | Direct vLLM health check |

Example request:

```bash
curl http://127.0.0.1:8001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Jelaskan unsur-unsur TPPO."}
    ]
  }'
```

## Backend tests

```bash
cd backend
uv run pytest
```

The tests mock vLLM. They do not start or download the model.

## Troubleshooting

### FastAPI health returns HTTP 503

The vLLM server is not running or has not finished loading the model. Check:

```text
http://127.0.0.1:8000/health
```

### `vllm` command not found

Activate the vLLM Metal environment:

```bash
source ~/.venv-vllm-metal/bin/activate
```

### Unsupported platform or Rosetta error

Verify that the shell and Python installation are native arm64:

```bash
uname -m
python --version
```

Expected results are `arm64` and Python `3.12.x`.

### Restore backend dependencies

```bash
cd backend
uv sync
```
