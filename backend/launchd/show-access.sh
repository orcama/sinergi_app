#!/bin/zsh
set -eu

runtime_dir="$HOME/Library/Application Support/SinergiServer"
log_file="$runtime_dir/logs/tunnel-error.log"

public_url=$(sed -nE 's/.*(https:\/\/[a-z-]+\.trycloudflare\.com).*/\1/p' "$log_file" | tail -1)
if [[ -z "$public_url" ]]; then
  echo "No public tunnel URL found. Check: $log_file" >&2
  exit 1
fi

echo "Public URL: $public_url"
