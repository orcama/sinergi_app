#!/bin/zsh
set -eu

public_url="https://api.legal-verse.id"

echo "Public URL: $public_url"
curl -fsS "$public_url/health"
echo
