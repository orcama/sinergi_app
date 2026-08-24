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
zsh backend/launchd/deploy.sh --managed
```

`--managed` is the recommended on-demand deployment. It keeps the lightweight
FastAPI gateway and Cloudflare tunnel under `launchd`; vLLM is started by the
gateway only when a model request arrives and is stopped after the idle
timeout. When the tunnel is already healthy, a managed redeploy keeps its
current Quick Tunnel URL instead of allocating a new one.

For interactive troubleshooting, omit `--managed`. This stops the managed
FastAPI gateway and opens three separate Terminal windows for the frontend
(`npm run dev`), FastAPI (`uv run --env-file .env fastapi dev ...`), and the
documented Metal vLLM command. Use `Ctrl-C` in a window to stop that process.

```bash
zsh backend/launchd/deploy.sh
```

The deployment prints `Public API URL: https://...trycloudflare.com` before it
exits. FastAPI also writes the current URL to `gateway.log` during application
startup. To intentionally allocate a new Quick Tunnel URL, stop the tunnel
LaunchAgent first and run the managed deployment again.

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
