#!/bin/zsh
set -euo pipefail

# Start the exact production checkpoint on an isolated port, wait for the
# OpenAI-compatible server, and verify the live model metadata. This must run
# on the target native arm64 M4 Mac; it is intentionally not part of pytest.

model="${VLLM_SERVE_MODEL:-Legal-verse/InaVerdict-gemma-v2}"
port="${VLLM_SMOKE_PORT:-18000}"
log_path="${VLLM_SMOKE_LOG:-${TMPDIR:-/tmp}/sinergi-vllm-metal.log}"
executable="${VLLM_EXECUTABLE:-$HOME/.venv-vllm-metal/bin/vllm}"
max_model_len="${VLLM_SMOKE_MAX_MODEL_LEN:-65536}"

if [[ "$(uname -m)" != "arm64" ]]; then
  print -u2 "vLLM Metal smoke test requires native arm64 macOS."
  exit 2
fi

mem_bytes="$(sysctl -n hw.memsize)"
mem_gib="$(( mem_bytes / 1024 / 1024 / 1024 ))"
if (( mem_gib != 16 )); then
  print -u2 "warning: target profile is for 16 GiB; detected ${mem_gib} GiB"
fi

command=(
  "$executable" serve "$model"
  --served-model-name "$model"
  --host 127.0.0.1
  --port "$port"
  --max-model-len "$max_model_len"
  --max-num-seqs 1
  --max-num-batched-tokens 512
)

export VLLM_METAL_USE_PAGED_ATTENTION=1
export VLLM_METAL_MEMORY_FRACTION="${VLLM_METAL_MEMORY_FRACTION:-0.90}"
export VLLM_MLX_DEVICE="${VLLM_MLX_DEVICE:-gpu}"

rm -f "$log_path"
"${command[@]}" >"$log_path" 2>&1 &
server_pid=$!
cleanup() {
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for attempt in {1..180}; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    print -u2 "vLLM exited before becoming ready; log: $log_path"
    tail -80 "$log_path" >&2 || true
    exit 1
  fi
  if curl -fsS "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if (( attempt == 180 )); then
    print -u2 "vLLM did not become ready in 180s; log: $log_path"
    tail -80 "$log_path" >&2 || true
    exit 1
  fi
done

metadata="$(curl -fsS "http://127.0.0.1:${port}/v1/models")"
metadata_path="${log_path}.metadata.json"
print "$metadata" >"$metadata_path"
MODEL_EXPECTED="$model" MAX_MODEL_LEN="$max_model_len" python3 - "$metadata_path" <<'PY'
import json, sys
import os
with open(sys.argv[1], encoding="utf-8") as stream:
    payload = json.load(stream)
models = payload.get("data") or []
assert models, "vLLM returned no models"
model = models[0]
expected = os.environ["MODEL_EXPECTED"]
expected_max_len = int(os.environ["MAX_MODEL_LEN"])
if model.get("id") != expected:
    raise SystemExit(f"live server returned {model.get('id')!r}, expected {expected!r}")
reported = model.get("max_model_len") or model.get("max_context_length")
if reported is not None and int(reported) < expected_max_len:
    raise SystemExit(f"live server reports only {reported} tokens")
print(f"live model: {model.get('id')}")
print(f"reported max context: {reported or f'not exposed by endpoint; startup succeeded with --max-model-len {expected_max_len}'}")
PY
rm -f "$metadata_path"

if [[ "${VLLM_SMOKE_PROBE:-0}" == "1" ]]; then
  request_path="${log_path}.probe.json"
  MODEL_EXPECTED="$model" MAX_MODEL_LEN="$max_model_len" python3 - "$request_path" <<'PY'
import json
import os
import sys

# A repeated short word is approximately one token on the Gemma tokenizer.
# Leave headroom for the chat template and the one-token response.
payload = {
    "model": os.environ["MODEL_EXPECTED"],
    "messages": [{"role": "user", "content": "probe " * max(1, int(int(os.environ["MAX_MODEL_LEN"]) * 0.95))}],
    "max_tokens": 1,
    "temperature": 0,
}
with open(sys.argv[1], "w", encoding="utf-8") as stream:
    json.dump(payload, stream)
PY
  curl -fsS "http://127.0.0.1:${port}/v1/chat/completions" \
    -H 'Content-Type: application/json' \
    --data-binary "@$request_path" \
    | MODEL_EXPECTED="$model" MAX_MODEL_LEN="$max_model_len" python3 -c 'import json, os, sys; payload=json.load(sys.stdin); assert payload.get("choices"), payload; print("{}-token probe returned from {}".format(os.environ["MAX_MODEL_LEN"], os.environ["MODEL_EXPECTED"]))'
  rm -f "$request_path"
fi

print "${max_model_len}-token Metal smoke test passed; startup log: $log_path"
