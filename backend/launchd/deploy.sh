#!/bin/zsh
set -eu

mode="interactive"
if [[ "${1:-}" == "--managed" ]]; then
  mode="managed"
elif [[ "${1:-}" != "" ]]; then
  echo "Usage: zsh backend/launchd/deploy.sh [--managed]" >&2
  exit 2
fi

source_dir="${0:A:h:h}"
frontend_dir="${source_dir:h}"
runtime_dir="$HOME/Library/Application Support/SinergiServer"
gateway_source="$source_dir/launchd/com.sinergi.gateway.plist"
gateway_target="$HOME/Library/LaunchAgents/com.sinergi.gateway.plist"
tunnel_source="$source_dir/launchd/com.sinergi.tunnel.plist"
tunnel_target="$HOME/Library/LaunchAgents/com.sinergi.tunnel.plist"
user_domain="gui/$(id -u)"

mkdir -p "$runtime_dir" "$runtime_dir/logs" "$HOME/Library/LaunchAgents"
rsync -a \
  --exclude '.venv' \
  --exclude '.pytest_cache' \
  --exclude '__pycache__' \
  --exclude 'logs' \
  --exclude 'data' \
  --exclude 'rag-anything' \
  --exclude '*.pdf' \
  "$source_dir/" "$runtime_dir/"

cd "$runtime_dir"
"$HOME/.local/bin/uv" sync --frozen --no-dev
cp "$gateway_source" "$gateway_target"
cp "$tunnel_source" "$tunnel_target"

tunnel_log="$runtime_dir/logs/tunnel-error.log"
public_url=""
tunnel_needs_start=1
if launchctl print "$user_domain/com.sinergi.tunnel" >/dev/null 2>&1; then
  if [[ -f "$tunnel_log" ]]; then
    public_url=$(sed -nE 's/.*(https:\/\/[a-z-]+\.trycloudflare\.com).*/\1/p' "$tunnel_log" | tail -1)
  fi
  [[ -n "$public_url" ]] && tunnel_needs_start=0
fi

if [[ "$tunnel_needs_start" -eq 1 ]]; then
  previous_lines=0
  if [[ -f "$tunnel_log" ]]; then
    previous_lines=$(wc -l < "$tunnel_log")
  fi
  first_new_line=$((previous_lines + 1))

  launchctl bootout "$user_domain" "$tunnel_target" 2>/dev/null || true
  launchctl bootstrap "$user_domain" "$tunnel_target"
  launchctl enable "$user_domain/com.sinergi.tunnel"
  launchctl kickstart -k "$user_domain/com.sinergi.tunnel"

  for attempt in {1..30}; do
    if [[ -f "$tunnel_log" ]]; then
      public_url=$(tail -n +$first_new_line "$tunnel_log" \
        | sed -nE 's/.*(https:\/\/[a-z-]+\.trycloudflare\.com).*/\1/p' \
        | tail -1)
    fi
    [[ -n "$public_url" ]] && break
    sleep 1
  done
fi

if [[ "$mode" == "managed" ]]; then
  launchctl bootout "$user_domain" "$gateway_target" 2>/dev/null || true
  launchctl bootstrap "$user_domain" "$gateway_target"
  launchctl enable "$user_domain/com.sinergi.gateway"
  launchctl kickstart -k "$user_domain/com.sinergi.gateway"
else
  # The FastAPI dev terminal below owns port 8001 in interactive mode.
  launchctl bootout "$user_domain" "$gateway_target" 2>/dev/null || true
fi

open_terminal() {
  local title="$1"
  local command="$2"

  osascript - "$title" "$command" <<'APPLESCRIPT'
on run argv
  set windowTitle to item 1 of argv
  set shellCommand to item 2 of argv
  tell application "Terminal"
    activate
    do script shellCommand
    delay 0.2
    set custom title of front window to windowTitle
  end tell
end run
APPLESCRIPT
}

if [[ "$mode" == "interactive" ]]; then
  frontend_command="cd ${(q)frontend_dir}; echo 'Sinergi frontend'; npm run dev; echo; echo 'Frontend stopped. Press Ctrl-D to close.'; exec zsh"
  backend_command="cd ${(q)source_dir}; echo 'Sinergi FastAPI backend'; uv run --env-file .env fastapi dev app/main.py --host 127.0.0.1 --port 8001; echo; echo 'Backend stopped. Press Ctrl-D to close.'; exec zsh"
  vllm_command="source ${(q)HOME}/.venv-vllm-metal/bin/activate; export VLLM_METAL_USE_PAGED_ATTENTION=1 VLLM_METAL_MEMORY_FRACTION=0.90 VLLM_MLX_DEVICE=gpu; echo 'Sinergi vLLM'; vllm serve Legal-verse/InaVerdict-gemma-v2 --served-model-name Legal-verse/InaVerdict-gemma-v2 --host 127.0.0.1 --port 8000 --max-model-len 128000 --max-num-seqs 1 --max-num-batched-tokens 512 --default-chat-template-kwargs '{\"enable_thinking\": true}' --reasoning-parser gemma4; echo; echo 'vLLM stopped. Press Ctrl-D to close.'; exec zsh"

  open_terminal "Sinergi Frontend" "$frontend_command"
  open_terminal "Sinergi FastAPI" "$backend_command"
  open_terminal "Sinergi vLLM" "$vllm_command"
fi

echo "Sinergi services started in $mode mode"
if [[ "$mode" == "interactive" ]]; then
  echo "Frontend terminal: npm run dev (project root, port 3000)"
  echo "Backend terminal: uv run --env-file .env fastapi dev app/main.py --host 127.0.0.1 --port 8001"
  echo "vLLM terminal: vllm serve Legal-verse/InaVerdict-gemma-v2 (port 8000)"
else
  echo "Service: $user_domain/com.sinergi.gateway"
fi
echo "Tunnel: $user_domain/com.sinergi.tunnel"
if [[ -n "$public_url" ]]; then
  echo "Public API URL: $public_url"
else
  echo "Public API URL is not ready; run: zsh backend/launchd/show-access.sh"
fi
