# Ollama on Coolify + Backend Connection

This setup lets your backend use Ollama from Coolify, so you do not need to run Ollama on your local machine.

## 1) Deploy Ollama in Coolify

Use the Coolify screen you shared:

1. Go to `New Resource`.
2. Choose `Docker Compose Empty`.
3. Paste the compose file from:
   - `deploy/coolify/ollama/docker-compose.yml`
4. Deploy.
5. In Coolify networking/domain settings, assign a domain for Ollama, for example:
   - `https://ollama.your-domain.com`

## 2) Pull the model once on server

After deployment, open terminal for the Ollama resource in Coolify and run:

```bash
ollama pull llama3
```

You can change model name later (example: `llama3.1`, `qwen2.5`, etc.).

## 3) Point backend to Coolify Ollama

Update backend env (your real `.env`, not `.env.example`):

```env
OLLAMA_BASE_URL=https://ollama.your-domain.com
OLLAMA_MODEL=llama3
OLLAMA_TIMEOUT_MS=120000
```

If backend is running on your local machine (not inside Coolify), do not use `http://ollama:11434`.
Use SSH tunnel and localhost:

```env
OLLAMA_BASE_URL=http://localhost:11434
```

Create tunnel from your local machine:

```bash
ssh -L 11434:127.0.0.1:11434 <your-server-user>@140.245.229.141
```

Keep this SSH session open while testing locally.

Optional if your Ollama endpoint is protected:

```env
OLLAMA_API_KEY=your_secret_key
OLLAMA_AUTH_HEADER=Authorization
OLLAMA_AUTH_SCHEME=Bearer
```

Notes:

- If `OLLAMA_URL` is set, it overrides `OLLAMA_BASE_URL`.
- If only `OLLAMA_BASE_URL` is set, backend auto-uses `/api/chat`.

## 4) Restart backend

After env update, restart backend service so new env values are applied.

## 5) Verify connection

Quick check from backend host:

```bash
curl -sS https://ollama.your-domain.com/api/tags
```

For local backend with tunnel, use:

```bash
curl -sS http://localhost:11434/api/tags
```

Then test app chat route from your backend host:

```bash
curl -sS -X POST http://localhost:3002/api/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt":"hello"}'
```

## Troubleshooting

- Error says model not installed:
  - Run `ollama pull <model>` on the Ollama server/container, then retry.
- Timeout:
  - Increase `OLLAMA_TIMEOUT_MS`.
- Connection error:
  - Confirm Coolify Ollama app is up and domain is reachable from backend.
  - Re-check `OLLAMA_BASE_URL` (no extra spaces).
