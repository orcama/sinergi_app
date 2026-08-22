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

launchctl bootout "$user_domain" "$gateway_target" 2>/dev/null || true
launchctl bootstrap "$user_domain" "$gateway_target"
launchctl enable "$user_domain/com.sinergi.gateway"
launchctl kickstart -k "$user_domain/com.sinergi.gateway"

launchctl bootout "$user_domain" "$tunnel_target" 2>/dev/null || true
launchctl bootstrap "$user_domain" "$tunnel_target"
launchctl enable "$user_domain/com.sinergi.tunnel"
launchctl kickstart -k "$user_domain/com.sinergi.tunnel"

echo "Sinergi gateway deployed to: $runtime_dir"
echo "Service: $user_domain/com.sinergi.gateway"
echo "Tunnel: $user_domain/com.sinergi.tunnel"
