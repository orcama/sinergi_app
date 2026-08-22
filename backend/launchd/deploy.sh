#!/bin/zsh
set -eu

source_dir="${0:A:h:h}"
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

launchctl bootout "$user_domain" "$tunnel_target" 2>/dev/null || true
tunnel_log="$runtime_dir/logs/tunnel-error.log"
previous_lines=0
if [[ -f "$tunnel_log" ]]; then
  previous_lines=$(wc -l < "$tunnel_log")
fi
first_new_line=$((previous_lines + 1))

launchctl bootstrap "$user_domain" "$tunnel_target"
launchctl enable "$user_domain/com.sinergi.tunnel"
launchctl kickstart -k "$user_domain/com.sinergi.tunnel"

public_url=""
for attempt in {1..30}; do
  if [[ -f "$tunnel_log" ]]; then
    public_url=$(tail -n +$first_new_line "$tunnel_log" \
      | sed -nE 's/.*(https:\/\/[a-z-]+\.trycloudflare\.com).*/\1/p' \
      | tail -1)
  fi
  [[ -n "$public_url" ]] && break
  sleep 1
done

launchctl bootout "$user_domain" "$gateway_target" 2>/dev/null || true
launchctl bootstrap "$user_domain" "$gateway_target"
launchctl enable "$user_domain/com.sinergi.gateway"
launchctl kickstart -k "$user_domain/com.sinergi.gateway"

echo "Sinergi gateway deployed to: $runtime_dir"
echo "Service: $user_domain/com.sinergi.gateway"
echo "Tunnel: $user_domain/com.sinergi.tunnel"
if [[ -n "$public_url" ]]; then
  echo "Public API URL: $public_url"
else
  echo "Public API URL is not ready; run: zsh backend/launchd/show-access.sh"
fi
