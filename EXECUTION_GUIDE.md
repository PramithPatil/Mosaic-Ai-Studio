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

## 5. Connect image, video, and audio services

The media tabs now call server-side adapters. They need local services in addition to LiteLLM. Start with the modality you want to try; leave other service URLs blank until you have those services running.

### Image and video with ComfyUI

Install [ComfyUI Desktop](https://github.com/Comfy-Org/ComfyUI) and load a model/workflow that works in ComfyUI first. For each workflow, choose **Save (API Format)** and save its JSON under the project’s `workflows/` folder. The image workflow must output a PNG/JPEG/WebP image; the video workflow must output MP4/WebM/MOV (or GIF). Find the positive text prompt node ID in that API JSON.

Set in `.env.local`:

```dotenv
COMFYUI_BASE_URL=http://localhost:8188
COMFYUI_IMAGE_WORKFLOW_PATH=workflows/image.api.json
COMFYUI_IMAGE_PROMPT_NODE_ID=the-image-prompt-node-id
COMFYUI_VIDEO_WORKFLOW_PATH=workflows/video.api.json
COMFYUI_VIDEO_PROMPT_NODE_ID=the-video-prompt-node-id
COMFYUI_TIMEOUT_MS=180000
LITELLM_IMAGE_GUARD_MODEL=studio-image-guard
```

Image results are withheld unless the configured vision model returns a clear `safe` verdict. The included LiteLLM config has a `studio-image-guard` alias for Ollama’s Qwen2.5-VL. Download it with `ollama pull qwen2.5vl:3b`, then restart LiteLLM so it loads the added alias. Video prompt safety is enabled, but sampled-frame video moderation is still future work.

### Speech-to-text with Whisper

The app expects an OpenAI-compatible `POST /v1/audio/transcriptions` endpoint. [Speaches](https://github.com/speaches-ai/speaches) provides one with faster-whisper and can run on CPU or CUDA. For a CPU demo, run:

```cmd
docker run --rm --name speaches -p 8000:8000 -v speaches-cache:/home/ubuntu/.cache/huggingface/hub ghcr.io/speaches-ai/speaches:latest-cpu
```

Set `WHISPER_BASE_URL=http://localhost:8000` and `WHISPER_MODEL=Systran/faster-whisper-small` in `.env.local`. The Audio tab’s **Transcribe audio** action accepts files up to 25 MB; the transcript is checked by the text guard before it appears.

### Text-to-speech with XTTS

Review and accept the [Coqui Public Model License](https://coqui.ai/cpml) before running its XTTS model. The official XTTS streaming server exposes the `/studio_speakers` and `/tts` endpoints used by this app. A CPU demo (slower than GPU) can run with:

```cmd
docker run --rm --name xtts -p 8002:80 -e COQUI_TOS_AGREED=1 ghcr.io/coqui-ai/xtts-streaming-server:latest-cpu
```

Only run this after agreeing to the model terms; the environment flag records that agreement. Set `XTTS_BASE_URL=http://localhost:8002` and optionally `XTTS_VOICE` to a speaker name returned by that server. The Audio tab’s **Create speech** action checks the input text before synthesis.

After editing `.env.local`, restart the Next.js server. Keep each media service’s terminal/container running during use. Generated media is stored under `.data/media/` and served only to signed-in users. The `.data/` directory is ignored by Git.

## 6. Install and run

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

## 7. Use the app

1. Use the Text, Image, Audio, and Video tabs. Image/video need ComfyUI workflows; Audio offers Whisper transcription and XTTS speech.
2. Type a prompt, then choose **Save prompt** to add it to the prompt library. Loading a saved prompt and saving changes creates the next numbered version.
3. Generate text through LiteLLM, images/video through ComfyUI, transcriptions through Whisper, or speech through XTTS. Successful media previews carry a visible AI-generated label.
4. Sign out from the account control at the bottom of the navigation.
5. Check the dashboard for locally recorded generation counts and latency. Spend remains blank until a provider reports cost data.

Saved prompts and safety-cleared generation metadata are stored in `.data/workspace.json`. This local JSON store is meant for a single-process demo. It is not suitable for concurrent, serverless, or production deployments. The prompt store seeds three example prompts on first use.

## 8. Verify the project

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd audit
```

`lint` currently runs TypeScript type checking. Before presenting the project, also verify text generation with your own staging gateway using safe prompts, blocked prompts, guard timeouts, and output moderation. Record measured latency and cost only from provider responses.

## 9. Production run

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
