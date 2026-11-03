# Mosaic AI Studio — Execution Guide

This guide explains how to unpack, configure, run, and verify the current local MVP on Windows. The same npm commands work on macOS and Linux.

## 1. Requirements

- Node.js 20.9 or newer
- npm (included with Node.js)
- LiteLLM proxy credentials and a reachable guard-model alias to run text generation

The UI, sign-in, prompt library, and local activity store can be explored before a model provider is configured. Generation stays unavailable until LiteLLM is configured.

## 2. Unpack the project

Extract `mosaic-ai-studio-complete.zip` to a folder you can edit, then open a terminal in that folder. The folder should contain `package.json`, `app/`, `lib/`, and `docs/`.

In PowerShell, for example:

```powershell
Expand-Archive .\mosaic-ai-studio-complete.zip -DestinationPath .\mosaic-ai-studio
Set-Location .\mosaic-ai-studio
```

## 3. Configure local sign-in

Create a private environment file from the template:

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

Set these values in `.env.local`:

```dotenv
STUDIO_LOGIN_EMAIL=you@example.com
STUDIO_LOGIN_PASSWORD=choose-a-unique-strong-password
STUDIO_SESSION_SECRET=paste-a-random-secret-of-at-least-32-characters
STUDIO_WORKSPACE_ID=northstar
```

Generate a session secret in PowerShell:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

The app has one environment-configured account, not public registration. The session cookie is HTTP-only, signed, and lasts 12 hours. `.env.local` is excluded from the project bundle and ignored by Git. Never commit it. If you rotate the session secret, existing browser sessions become invalid.

## 4. Configure LiteLLM for text generation (local Windows demo)

The recommended demo path uses Ollama for local models and LiteLLM as the gateway. It does not need a paid model-provider key. Install [Ollama for Windows](https://ollama.com/download/windows) and [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/), start both, then open PowerShell in the project folder.

Download one small chat model and one Llama Guard model:

```powershell
ollama pull qwen2.5:3b
ollama pull llama-guard3:1b
ollama list
```

The included `litellm_config.yaml` registers the public aliases `studio-text` and `studio-guard` and points Docker at Ollama on the Windows host. Generate a private gateway key and save it in an ignored local file:

```powershell
$gatewayKey = 'sk-' + (node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")
Set-Content -NoNewline .env.litellm "LITELLM_MASTER_KEY=$gatewayKey"
Remove-Variable gatewayKey
```

Start LiteLLM; keep this PowerShell window open while using the app:

```powershell
docker run --rm --name mosaic-litellm `
  -p 4000:4000 `
  -v "$((Get-Location).Path)\litellm_config.yaml:/app/config.yaml:ro" `
  --env-file .env.litellm `
  docker.litellm.ai/berriai/litellm:latest `
  --config /app/config.yaml
```

In another PowerShell window, open `.env.litellm` and copy its `LITELLM_MASTER_KEY` value into `.env.local` as `LITELLM_API_KEY`. Set the remaining app values as follows:

```dotenv
LITELLM_BASE_URL=http://localhost:4000
LITELLM_TEXT_MODEL=studio-text
LITELLM_GUARD_MODEL=studio-guard
```

Keep all other `.env.local` values. Never commit either local environment file or put secrets in `NEXT_PUBLIC_*` variables. Restart `npm.cmd run dev` after changing `.env.local`.

Verify that LiteLLM is serving the aliases:

```powershell
$gatewayKey = (Get-Content .env.litellm | Where-Object { $_ -like 'LITELLM_MASTER_KEY=*' }) -replace '^LITELLM_MASTER_KEY=', ''
Invoke-RestMethod http://localhost:4000/v1/models -Headers @{ Authorization = "Bearer $gatewayKey" }
Remove-Variable gatewayKey
```

The app sends requests to `/v1/chat/completions`. Input and output are checked by the configured guard alias; a missing verdict or a verdict beginning with `unsafe` withholds the response. LiteLLM aliases must exactly match the configured `model_name` values. For hosted providers, keep provider API keys in LiteLLM's configuration and continue to give the app only the LiteLLM key.

The current API returns a clear unavailable response if a provider is missing. Image, audio, and video tabs are interface prototypes and do not call media services yet. `COMFYUI_BASE_URL`, `WHISPER_BASE_URL`, and `XTTS_BASE_URL` are reserved setup values, not connected integrations.

## 5. Install and run

```powershell
npm.cmd install
npm.cmd run dev
```

Open [http://localhost:3000](http://localhost:3000), then sign in with the email and password you set in `.env.local`.

If PowerShell blocks `npm`, use `npm.cmd` as shown. If port 3000 is already occupied, run:

```powershell
npm.cmd run dev -- -p 3001
```

Then open [http://localhost:3001](http://localhost:3001).

## 6. Use the app

1. Use the Text, Image, Audio, and Video tabs to switch workspaces. Only Text is connected to a provider.
2. Type a prompt, then choose **Save prompt** to add it to the prompt library. Loading a saved prompt and saving changes creates the next numbered version.
3. Choose **Generate text** to invoke the configured LiteLLM and guard aliases. The result is labeled AI-generated after the output guard passes.
4. Sign out from the account control at the bottom of the navigation.
5. Check the dashboard for locally recorded generation counts and latency. Spend remains blank until provider cost reporting is implemented.

Saved prompts and safety-cleared generation metadata are stored in `.data/workspace.json`. This local JSON store is meant for a single-process demo. It is not suitable for concurrent, serverless, or production deployments. The prompt store seeds three example prompts on first use.

## 7. Verify the project

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd audit
```

`lint` currently runs TypeScript type checking. Before presenting the project, also verify text generation with your own staging gateway using safe prompts, blocked prompts, guard timeouts, and output moderation. Record measured latency and cost only from provider responses.

## 8. Production run

After configuring the environment and reviewing the limitations:

```powershell
npm.cmd run build
npm.cmd run start
```

This does not make the current MVP production-ready. Before deployment, replace the single-account environment login and JSON storage with a managed identity provider, workspace roles, and a durable database. Add rate limits, real budget enforcement, Langfuse traces, image moderation, media provenance labels, and deployment-safe secret management.

## What's in the bundle

- `app/`: Next.js studio UI and API routes
- `lib/`: signed session helpers and local prompt/activity store
- `docs/architecture.md`: current and planned system flow
- `docs/governance-policy.md`: acceptable use, data handling, and incident reporting
- `README.md`: feature status, API notes, and remaining work
- `.env.example`: configuration template without credentials

The archive intentionally excludes `.env.local`, `.data/`, `node_modules/`, `.next/`, and test scratch files. Configure your own account and secrets after extracting it.
