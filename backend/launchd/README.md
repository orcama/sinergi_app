# launchd service

`com.sinergi.gateway.plist` keeps the lightweight FastAPI gateway listening on
port 8001. It does **not** keep vLLM loaded; the gateway starts and stops vLLM
according to the `VLLM_ON_DEMAND` settings in `backend/.env`.

`com.sinergi.tunnel.plist` keeps a domainless Cloudflare Quick Tunnel connected
for public HTTPS access. Show the current random URL with:

```bash
zsh backend/launchd/show-access.sh
```

Install or refresh it for the current macOS user:

```bash
zsh backend/launchd/deploy.sh
```

The deployment waits for Cloudflare to allocate the new random URL and prints
`Public API URL: https://...trycloudflare.com` before it exits. FastAPI also
writes the current URL to `gateway.log` during application startup.

The script copies only the backend runtime files (including the local `.env`
and Firebase credential) into
`~/Library/Application Support/SinergiServer`, installs its production Python
environment, and refreshes the LaunchAgent. The runtime copy is necessary
because macOS privacy controls prevent background LaunchAgents from reliably
reading a virtual environment located under `Documents`.

Inspect it with:

```bash
launchctl print gui/$(id -u)/com.sinergi.gateway
tail -f ~/Library/Application\ Support/SinergiServer/logs/gateway-error.log \
  ~/Library/Application\ Support/SinergiServer/logs/gateway.log \
  ~/Library/Application\ Support/SinergiServer/logs/vllm.log
```

Remove it with:

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.sinergi.gateway.plist
rm ~/Library/LaunchAgents/com.sinergi.gateway.plist
```
