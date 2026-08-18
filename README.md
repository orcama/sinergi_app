This is a Next.js frontend with a FastAPI gateway to a local vLLM Metal model server.

Backend installation, startup, environment, and troubleshooting instructions
are available in [backend/DOCUMENTATION.md](./backend/DOCUMENTATION.md).

## Local chat stack (Mac mini M4)

The configured model is `mlx-community/DeepSeek-R1-Distill-Qwen-1.5B-4bit`, an
MLX 4-bit conversion of `deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B`. The model is
not vendored in this repository. Hugging Face weights are downloaded only when
`vllm serve` is first started on the Mac.

Requirements: Apple Silicon macOS, native arm64 Python 3.12, Node.js, and `uv`.

Install vLLM Metal using its official installer (it uses `uv` and creates
`~/.venv-vllm-metal`):

```bash
curl -fsSL https://raw.githubusercontent.com/vllm-project/vllm-metal/main/install.sh | bash
```

Install the FastAPI gateway without starting or downloading the model:

```bash
cd backend
uv sync
cp .env.example .env
```

When you are ready to download and serve the model, run these in three terminals:

```bash
# Terminal 1: vLLM Metal (this is the command that downloads the model on first use)
source ~/.venv-vllm-metal/bin/activate
vllm serve mlx-community/DeepSeek-R1-Distill-Qwen-1.5B-4bit \
  --served-model-name mlx-community/DeepSeek-R1-Distill-Qwen-1.5B-4bit \
  --host 127.0.0.1 --port 8000 --max-model-len 4096 --max-num-seqs 2

# Terminal 2: FastAPI gateway
cd backend
uv run --env-file .env fastapi dev app/main.py --host 127.0.0.1 --port 8001

# Terminal 3: Next.js frontend
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000/chat`. Gateway health is available at
`http://127.0.0.1:8001/health`, and its OpenAPI docs are at
`http://127.0.0.1:8001/docs`.

### Model providers: configurable via env

The chat page has a switch between model providers, populated dynamically from
the backend's `GET /api/models` endpoint. The provider list itself is defined
by environment variables (`MODEL_PROVIDERS` JSON, `MODEL_ID`, `WANDB_MODEL_ID`,
etc.) — see `backend/.env.example` and `backend/DOCUMENTATION.md`. Change the
env file and restart the backend to alter the models without touching code.

Defaults:

- **vLLM (Local)** — `mlx-community/DeepSeek-R1-Distill-Qwen-1.5B-4bit` on the
  Mac mini. Text only.
- **MiniMax M3 (WandB)** — `MiniMaxAI/MiniMax-M3`, a hosted multimodal model
  (text + image). See `backend/models.md`. Works on any platform, including
  Windows.

On Windows, vLLM Metal cannot run, so use the **MiniMax M3** provider. The
`WANDB_API_KEY` is read from `backend/models.md` (git-ignored) or the
`WANDB_API_KEY` environment variable. The chat input accepts images and PDFs
(hybrid — both can be attached in one message); images go to the multimodal
model as `image_url` parts, and PDF text is extracted server-side with `pypdf`
and sent as plain text.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
