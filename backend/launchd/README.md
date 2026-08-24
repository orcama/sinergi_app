# launchd service

`com.sinergi.gateway.plist` keeps the lightweight FastAPI gateway listening on
port 8001. It does **not** keep vLLM loaded; the gateway starts and stops vLLM
according to the `VLLM_ON_DEMAND` settings in `backend/.env`.

`com.sinergi.tunnel.plist` keeps the named Cloudflare Tunnel connected for
public HTTPS access at `https://api.legal-verse.id`. Show the URL and health
status with:

```bash
zsh backend/launchd/show-access.sh
```

Install or refresh it for the current macOS user:

```bash
zsh backend/launchd/deploy.sh --managed
```

`--managed` is the recommended on-demand deployment. It keeps the lightweight
FastAPI gateway and named Cloudflare tunnel under `launchd`; vLLM is started by
the gateway only when a model request arrives and is stopped after the idle
timeout. The public URL remains `https://api.legal-verse.id` across restarts.

For interactive troubleshooting, omit `--managed`. This stops the managed
FastAPI gateway and opens three separate Terminal windows for the frontend
(`npm run dev`), FastAPI (`uv run --env-file .env fastapi dev ...`), and the
documented Metal vLLM command. Use `Ctrl-C` in a window to stop that process.

```bash
zsh backend/launchd/deploy.sh
```

The deployment prints `Public API URL: https://api.legal-verse.id` before it
exits. FastAPI also writes the URL to `gateway.log` during application startup.

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

Restart the gateway without changing the public URL:

```bash
launchctl kickstart -k "gui/$(id -u)/com.sinergi.gateway"
```

Terminate the gateway so it does not immediately restart:

```bash
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.sinergi.gateway.plist"
```

Restart or terminate the public tunnel with the corresponding service label:

```bash
launchctl kickstart -k "gui/$(id -u)/com.sinergi.tunnel"
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.sinergi.tunnel.plist"
```

Remove it with:

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.sinergi.gateway.plist
rm ~/Library/LaunchAgents/com.sinergi.gateway.plist
```
