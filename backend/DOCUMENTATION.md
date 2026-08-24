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
| `vllm` | vLLM (Local) | `Legal-verse/InaVerdict-gemma-v2` (Gemma 4 E2B-derived checkpoint) | No | Apple Silicon Mac + vLLM Metal |
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

The local vLLM model is the trained legal checkpoint:

```text
Legal-verse/InaVerdict-gemma-v2
```

It follows the Gemma 4 E2B architecture; the checkpoint's training and legal
behavior remain specific to Legal-verse.

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
Gemma 4 checkpoint.

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
MODEL_ID=Legal-verse/InaVerdict-gemma-v2
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

### Firebase credentials in production

The service-account JSON is only a backend credential. It must never be placed
in the Next.js `NEXT_PUBLIC_*` environment or committed to the repository.
The backend accepts these deployment patterns:

- On Google Cloud, leave `FIREBASE_SERVICE_ACCOUNT_PATH` and
  `FIREBASE_SERVICE_ACCOUNT_JSON` unset and grant the runtime service account
  access to Firebase Authentication, Firestore, and Storage. The Admin SDK
  uses Application Default Credentials.
- On a platform that provides secrets as environment variables, store the
  complete JSON object in a secret named `FIREBASE_SERVICE_ACCOUNT_JSON`.
- For local development, keep using `FIREBASE_SERVICE_ACCOUNT_PATH` and the
  ignored JSON file.

`FIREBASE_STORAGE_BUCKET` should be set to the project's current bucket name,
for example `sinergi-app-89eed.firebasestorage.app`. `FIRESTORE_DATABASE_ID`
defaults to `(default)`.

Firebase App Hosting deploys this repository's Next.js app. The Python gateway
under `backend/` is a separate service; its public URL must be supplied to the
frontend through `NEXT_PUBLIC_BACKEND_URL`. A Cloudflare Quick Tunnel URL is
temporary and changes after restarts, so it is suitable for testing only.

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
  --max-model-len 65536 \
  --max-num-seqs 1 \
  --max-num-batched-tokens 512 \
  --default-chat-template-kwargs '{"enable_thinking": true}' \
  --reasoning-parser gemma4
```

`Legal-verse/InaVerdict-gemma-v2` is the application checkpoint based on
the Gemma 4 E2B architecture reported by the checkpoint configuration; it is
not a DeepSeek or Gemma 3 deployment. Its config reports
`max_position_embeddings: 131072`, so 128,000 is within the model-native limit.

For a 16 GB M4, the serving profile deliberately uses one sequence, a 512-token
scheduler batch, and a 65,536-token context. This trades prefill throughput and
maximum context for a KV-cache budget that fits alongside the model in unified
memory. Set
`VLLM_METAL_USE_PAGED_ATTENTION=1` and
`VLLM_METAL_MEMORY_FRACTION=0.90` in the vLLM shell. On current Metal paged
attention, the generic `--gpu-memory-utilization` flag is not the controlling
KV-cache setting; the Metal-specific environment variable is.

The checkpoint is an approximately 10.25 GB FP16 file and supports 128K
natively, but the available KV-cache budget depends on the other processes
using unified memory. If vLLM rejects startup with an insufficient Metal
KV-cache budget, reduce `VLLM_MAX_MODEL_LEN` further before considering a
quantized checkpoint or compressed KV cache.

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

To verify the actual target machine rather than only the command configuration,
run this on the native arm64 16 GB M4 Mac after installing vLLM Metal:

```bash
zsh backend/scripts/smoke_vllm_metal_128k.zsh
```

The smoke script defaults to the safe 65,536-token profile. Set
`VLLM_SMOKE_MAX_MODEL_LEN=128000` only when the Mac has enough free unified
memory for the full native context. Add `VLLM_SMOKE_PROBE=1` to send a real
near-limit request with one output token. This is slower and more
memory-intensive, but it is the strongest available smoke check for
long-context acceptance.

The smoke test starts the exact checkpoint on port 18000, waits for `/health`,
checks `/v1/models`, and prints the startup log path. It terminates only the
process it started. A successful repository test run cannot substitute for
this hardware check because Metal KV allocation depends on free unified memory
at launch.

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
VLLM_MAX_MODEL_LEN=65536
CORS_ORIGINS=*
```

The checked-in launchd agent starts FastAPI at login, restarts it if it exits,
and binds it to all network interfaces. The deployment script installs a
runtime copy outside `Documents` because macOS privacy controls restrict
background services there. Install it for the current Mac user:

```bash
cd /Users/galihmac/Documents/sinergi_app_deploy
zsh backend/launchd/deploy.sh --managed
```

`--managed` is the recommended on-demand setup: it keeps only the FastAPI
gateway and Cloudflare tunnel under LaunchAgent, while vLLM starts on the first
model request and is stopped after the idle timeout. The source `backend/.env`
is copied into the runtime directory during deployment.

For interactive troubleshooting only, use the default deployment mode. It
keeps the Cloudflare tunnel under `launchd`, then opens separate Terminal
windows for the frontend, FastAPI dev server, and vLLM so each process can be
traced live. It stops the managed gateway first to avoid a second process
binding port 8001:

```bash
zsh backend/launchd/deploy.sh
```

Check the gateway and vLLM state:

tail -f ~/Library/Application\ Support/SinergiServer/logs/gateway-error.log \
  ~/Library/Application\ Support/SinergiServer/logs/gateway.log \

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

`zsh backend/launchd/deploy.sh` also prints the newly allocated URL every time
it starts/restarts the public tunnel. The FastAPI startup log repeats the URL.

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

### PDF cleanup and Firestore vector search

When a PDF is uploaded to the library, the backend normalizes common PDF
extraction artifacts, removes repeated page headers and page numbers, keeps
legal section boundaries, and stores the cleaned text. It then sectionizes the
document using the canonical features in `app/rag/sections.py`, chunks long
sections, and stores 384-dimensional normalized vectors in the
`document_chunks` collection.

The original PDF and the complete cleaned text are retained in Cloud Storage;
the browser preview is not the source of truth and is never used to replace a
longer server-side extraction. Chat turns keep the document ID and retrieve
relevant chunks again on every question, so the model does not depend on the
previous prompt still containing the entire PDF. A finite model context cannot
literally hold an unlimited document in every prompt; persistent storage plus
retrieval is what preserves access without silently cutting the source.

The default embedder is `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`,
a multilingual model with Indonesian support and an approximately 0.22 GB model
package. FastEmbed handles query and document encoding through
its supported model interface. Override
`EMBEDDING_MODEL_ID` only with a model that returns the configured
`EMBEDDING_DIMENSION`.

Create a Firestore vector index for the `embedding` field and the
`user_id`/`file_id` filters used by the backend. Firestore will also return a
CLI command for the required composite vector index when the first vector
query is attempted. The backend falls back to the existing deterministic
section-aware retrieval if the model or index is temporarily unavailable.

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
