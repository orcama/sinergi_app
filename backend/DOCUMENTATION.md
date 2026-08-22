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

## Running locally in two terminals

This manual mode is useful for development and troubleshooting. For the
always-reachable, scale-to-zero Mac server, use **On-demand Mac server** below.

### Terminal 1: start vLLM Metal manually

```bash
source ~/.venv-vllm-metal/bin/activate

vllm serve Legal-verse/InaVerdict-gemma-v2 \
  --served-model-name Legal-verse/InaVerdict-gemma-v2 \
  --host 127.0.0.1 \
  --port 8000 \
  --max-model-len 12000 \
  --max-num-seqs 2 \
  --default-chat-template-kwargs '{"enable_thinking": true}' \
  --reasoning-parser gemma4
```

> `--default-chat-template-kwargs '{"enable_thinking": true}'` turns on Gemma's
> built-in thinking mode: the chat template injects `<|think|>` at the start of
> the first system turn so the model emits a
> `<|channel>thought\n...<channel|>` reasoning block.
>
> `--reasoning-parser gemma4` makes vLLM split that block out of the answer and
> surface it as `reasoning_content` instead of leaking it into `content`. The
> FastAPI gateway already forwards `reasoning_content` to the frontend as
> `thinking` events. Omit the parser flag (or the kwargs flag) to disable.

The first execution of `vllm serve` downloads the model from Hugging Face.
Later executions reuse the cached model.

### Terminal 2: start FastAPI manually

From the repository root:
a

```bash
cd backend
uv run --env-file .env fastapi dev app/main.py \
  --host 127.0.0.1 \
  --port 8001
```

FastAPI automatically reloads when backend Python files change.

> On Windows, vLLM Metal cannot run. Start only the FastAPI gateway and use the
> `wandb` provider for development and testing.

## On-demand Mac server (recommended)

In this mode, the lightweight FastAPI gateway is always listening on port
`8001`, while the memory-heavy vLLM process scales to zero:

1. A request using `provider: "vllm"` arrives at the gateway.
2. The gateway starts vLLM and waits for `/health` to become ready. The first
   request therefore has a cold-start delay while the model loads.
3. All active local-model requests share that vLLM process.
4. Five minutes after the final local request completes, the gateway stops
   vLLM and releases its model memory.

WandB requests do not wake vLLM. A manually started vLLM process is detected
but is never stopped by the gateway.

Configure `backend/.env`:

```dotenv
VLLM_ON_DEMAND=true
VLLM_EXECUTABLE=~/.venv-vllm-metal/bin/vllm
VLLM_SERVE_MODEL=Legal-verse/InaVerdict-gemma-v2
VLLM_IDLE_TIMEOUT_SECONDS=300
VLLM_STARTUP_TIMEOUT_SECONDS=600
CORS_ORIGINS=*
```

The checked-in launchd agent starts FastAPI at login, restarts it if it exits,
and binds it to all network interfaces. The deployment script installs a
runtime copy outside `Documents` because macOS privacy controls restrict
background services there. Install it for the current Mac user:

```bash
cd /Users/galihmac/Documents/sinergi_app
zsh backend/launchd/deploy.sh
```

Check the gateway and vLLM state:

```bash
curl http://127.0.0.1:8001/health
launchctl print gui/$(id -u)/com.sinergi.gateway
tail -f ~/Library/Application\ Support/SinergiServer/logs/gateway-error.log \
  ~/Library/Application\ Support/SinergiServer/logs/gateway.log \
  ~/Library/Application\ Support/SinergiServer/logs/vllm.log
```

When vLLM is asleep, `/health` still returns HTTP 200 because the gateway can
accept and cold-start a request. Inspect `vllm_ready` and
`vllm_on_demand.status` in its JSON response to distinguish `stopped`,
`starting`, `ready`, and `external` states.

### Requesting from a phone or another device

The device must be on the same Wi-Fi/LAN as the Mac. The Mac is reachable by
Bonjour hostname as `Galih-Mac-mini.local`; test from the other device with:

```bash
curl http://Galih-Mac-mini.local:8001/health

curl http://Galih-Mac-mini.local:8001/api/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "vllm",
    "messages": [{"role": "user", "content": "Jelaskan unsur TPPO."}]
  }'
```

If Bonjour names are unavailable on the client, find the Mac's LAN IP in
**System Settings → Network → Wi-Fi/Ethernet → Details** and replace the
hostname with that address, for example `http://192.168.1.20:8001`.

The Mac must be awake and connected to the network. This machine is currently
configured not to sleep while connected to AC power. If the macOS firewall
asks whether Python/FastAPI may accept incoming connections, allow it for the
trusted local network.

### Access from any network (public HTTPS test URL)

The deployment also runs a domainless Cloudflare Quick Tunnel. It exposes the
gateway through a public HTTPS URL with no authentication. It is intended only
for testing.

Show the current URL on the Mac:

```bash
zsh backend/launchd/show-access.sh
```

Use it from a phone or any other network:

```bash
PUBLIC_URL=https://<current-url>.trycloudflare.com

# Cold-start vLLM without holding a public request open.
curl -X POST "$PUBLIC_URL/api/vllm/wake"

# Poll until the JSON response contains: "vllm_ready": true
curl "$PUBLIC_URL/health"

# Then send the chat request.
curl "$PUBLIC_URL/api/chat" \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "vllm",
    "messages": [{"role": "user", "content": "Jelaskan unsur TPPO."}]
  }'
```

Because no domain is configured, this uses Cloudflare's development Quick
Tunnel service. The random URL can change after the tunnel or Mac restarts, has
no uptime guarantee, and does not support SSE. Use the non-streaming
`POST /api/chat` endpoint remotely. Its proxy timeout can also be shorter than
the model cold start, which is why remote clients should call
`POST /api/vllm/wake`, poll `/health`, and then call `/api/chat`. Run
`show-access.sh` again to retrieve the new URL after a restart.

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
