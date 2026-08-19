# Backend Setup and Usage

The backend has two Python services and two model providers:

| Service | Port | Purpose |
| --- | --- | --- |
| vLLM Metal | `8000` | Loads and serves the local language model (Mac only) |
| FastAPI gateway | `8001` | Validates chat requests and forwards them to a model provider |

## Model providers

The gateway can use any number of providers, defined by environment
variables — no code changes needed. The frontend switch is populated from
`GET /api/models`, which mirrors this configuration.

The default configuration provides two providers:

| Provider id | Name | Model | Supports images | Requires |
| --- | --- | --- | --- | --- |
| `vllm` | vLLM (Local) | `mlx-community/DeepSeek-R1-Distill-Qwen-1.5B-4bit` | No | Apple Silicon Mac + vLLM Metal |
| `wandb` | WandB (MiniMax M3) | `MiniMaxAI/MiniMax-M3` (hosted, multimodal) | Yes | `WANDB_API_KEY` |

The WandB provider serves the multimodal model documented in `backend/models.md`
(MiniMax M3, text + image input, 23B active / 428B total parameters). It works
on any platform with an internet connection, so it is the practical choice on
the Windows development machine where vLLM Metal cannot run.

### Customizing providers via env

Set `MODEL_PROVIDERS` to a JSON array to fully replace the provider list. Each
entry:

```json
{
  "id": "unique-provider-id",
  "name": "Display name shown in the frontend switch",
  "model": "Model identifier sent to the inference endpoint",
  "base_url": "http://host:port (vllm) or https://api.inference.wandb.ai (wandb)",
  "kind": "vllm or wandb (controls auth + text vs multimodal handling)",
  "supports_images": true,
  "api_key_env": "WANDB_API_KEY"
}
```

- `kind: "wandb"` sends `Authorization: Bearer <key>` using the env var named by
  `api_key_env`, and forwards multimodal content parts unchanged.
- `kind: "vllm"` sends no auth header and flattens multimodal content to text.
- `DEFAULT_PROVIDER` selects the default when the frontend does not pick one; if
  it is not among the configured ids, the first provider is used.

The local vLLM model is:

```text
mlx-community/DeepSeek-R1-Distill-Qwen-1.5B-4bit
```

It is an MLX 4-bit conversion of
`deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B`.

## Requirements

- Apple Silicon Mac (for the vLLM provider)
- Native arm64 shell
- Python 3.12
- `uv`

vLLM Metal cannot run on the Windows development machine, but the WandB
provider can.

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

WANDB_BASE_URL=https://api.inference.wandb.ai
WANDB_MODEL_ID=MiniMaxAI/MiniMax-M3
WANDB_API_KEY=
DEFAULT_PROVIDER=vllm

# Optional: MODEL_PROVIDERS=[] JSON array to fully customize the provider list
```

If `WANDB_API_KEY` is left empty, the gateway falls back to the API key
embedded in `backend/models.md`. That file is git-ignored, so it only exists on
machines that have it.

## Starting the backend

Run the two backend processes in separate terminals.

### Terminal 1: start vLLM Metal

```bash
source ~/.venv-vllm-metal/bin/activate

vllm serve Legal-verse/gemma-4-e2b-merged-mlx-4bit \
  --served-model-name Legal-verse/gemma-4-e2b-merged-mlx-4bit \
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

> On Windows, vLLM Metal cannot run. Start only the FastAPI gateway and use the
> `wandb` provider for development and testing.

## Backend endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET http://127.0.0.1:8001/health` | Checks whether FastAPI can reach vLLM |
| `GET http://127.0.0.1:8001/api/models` | Lists the configured providers (vLLM and WandB) |
| `POST http://127.0.0.1:8001/api/chat` | Sends a conversation to a model provider |
| `GET http://127.0.0.1:8001/docs` | Interactive FastAPI documentation |
| `GET http://127.0.0.1:8000/health` | Direct vLLM health check |

Example request using the WandB (hosted) provider:

```bash
curl http://127.0.0.1:8001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "wandb",
    "messages": [
      {"role": "user", "content": "Jelaskan unsur-unsur TPPO."}
    ]
  }'
```

Example multimodal request (text + image) to the WandB provider:

```bash
curl http://127.0.0.1:8001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "wandb",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "image_url",
            "image_url": {"url": "data:image/png;base64,<base64-encoded-image>"}
          },
          {"type": "text", "text": "Analisis gambar ini."}
        ]
      }
    ]
  }'
```

### PDF extraction

The gateway supports a `pdf` content part (base64-encoded PDF in the `data`
field, optionally with a `data:` prefix). It extracts the document text with
`pypdf` and sends it to the provider as plain text, since the hosted models are
text + image only. The extracted text is framed with `Konteks:` so the model
treats it as pasted document content rather than an unreadable attachment.

```bash
curl http://127.0.0.1:8001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "wandb",
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "pdf", "name": "putusan.pdf", "data": "data:application/pdf;base64,<base64>"},
          {"type": "text", "text": "Rangkum dokumen ini."}
        ]
      }
    ]
  }'
```

PDFs, images, and text can be combined freely in a single message.

## Backend tests

```bash
cd backend
uv run pytest
```

The tests mock the model servers. They do not start or download any model.

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
