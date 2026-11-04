# Mosaic AI Studio — Windows Setup and Run Guide

This guide covers the local Windows setup and daily startup for text generation, image generation, speech transcription, and speech creation. Commands below are for **Command Prompt (CMD)**. Each long-running service needs its own CMD window unless noted.

## What runs locally

| Feature | Service | Address / model |
| --- | --- | --- |
| Text and text safety | Ollama through LiteLLM | Ollama `11434`; LiteLLM `4000` |
| Image generation | ComfyUI | `8188`; SD 1.5 checkpoint |
| Image safety | Qwen2.5-VL through LiteLLM | Alias `studio-image-guard` |
| Audio transcription | Speaches / faster-whisper | `8000`; `Systran/faster-whisper-small` |
| Speech creation | Coqui XTTS v2 | `8002`; CPU image |

The included video tab needs a separate ComfyUI video model and an exported `workflows/video.api.json`. That workflow is not included, so video generation is not ready from this setup guide.

## 1. One-time prerequisites

Install Node.js 20.9+, Ollama for Windows, Docker Desktop, and ComfyUI Portable. Start Docker Desktop and Ollama. Keep ComfyUI extracted here, as in the commands below:

```text
C:\Users\patil\Downloads\ComfyUI_windows_portable
```

Open CMD in the project folder:

```cmd
cd /d "C:\Users\patil\Documents\Codex\2026-10-28\multimodal-ai-studio-with-safety-and"
```

Install the Node dependencies once:

```cmd
npm.cmd install
```

Create `.env.local` from the template only if you do not already have it:

```cmd
if not exist .env.local copy .env.example .env.local
notepad .env.local
```

Keep any existing settings in `.env.local`; add or update the values in section 4. This file contains secrets and must not be committed to Git.

## 2. Download the local Ollama models once

Open CMD and pull the three models used by the configured LiteLLM aliases:

```cmd
ollama pull qwen2.5:3b
ollama pull llama-guard3:1b
ollama pull qwen2.5vl:3b
ollama list
```

Ollama normally runs in the background after installing its Windows app. If `ollama list` says it cannot connect, start Ollama in a separate CMD window with `ollama serve` and leave that window open. Do not run a second Ollama server if the app is already serving on port 11434.

## 3. Download the ComfyUI image checkpoint once

The image workflow expects this exact file name in ComfyUI's checkpoints folder. You already downloaded it, so skip this step if the file is present.

```cmd
cd /d "C:\Users\patil\Downloads\ComfyUI_windows_portable\ComfyUI\models\checkpoints"
curl.exe -L -C - -o v1-5-pruned-emaonly-fp16.safetensors https://huggingface.co/Comfy-Org/stable-diffusion-1.5/resolve/main/v1-5-pruned-emaonly-fp16.safetensors
```

The file is about 2.13 GB. The `-C -` option lets curl continue a partial download. The checkpoint comes from [Comfy-Org on Hugging Face](https://huggingface.co/Comfy-Org/stable-diffusion-1.5/blob/main/v1-5-pruned-emaonly-fp16.safetensors).

## 4. Configure `.env.local` and the LiteLLM key once

Create a LiteLLM key in CMD:

```cmd
node -e "console.log('sk-' + require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the printed value. Open or create `.env.litellm` and set `LITELLM_MASTER_KEY` to that value. Set `LITELLM_API_KEY` in `.env.local` to the same value. Do not paste either key into chat or GitHub.

Create a separate session secret for the app:

```cmd
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

In `.env.local`, set `STUDIO_LOGIN_EMAIL`, choose a private `STUDIO_LOGIN_PASSWORD`, and paste the generated value into `STUDIO_SESSION_SECRET`. Keep `STUDIO_WORKSPACE_ID=northstar` or set another short workspace name. Use a unique password; these values configure the local sign-in screen.

Make sure `.env.local` has these settings. Keep the login settings already present in that file. Leave `XTTS_VOICE` blank to use the first available built-in voice.

```dotenv
LITELLM_BASE_URL=http://localhost:4000
LITELLM_API_KEY=your-generated-sk-key
LITELLM_TEXT_MODEL=studio-text
LITELLM_GUARD_MODEL=studio-guard
LITELLM_IMAGE_GUARD_MODEL=studio-image-guard

COMFYUI_BASE_URL=http://localhost:8188
COMFYUI_IMAGE_WORKFLOW_PATH=workflows/image.api.json
COMFYUI_IMAGE_PROMPT_NODE_ID=6
COMFYUI_TIMEOUT_MS=900000

WHISPER_BASE_URL=http://localhost:8000
WHISPER_MODEL=Systran/faster-whisper-small

XTTS_BASE_URL=http://localhost:8002
XTTS_VOICE=
XTTS_LANGUAGE=en
```

The project includes `litellm_config.yaml` with aliases for Qwen text, Llama Guard, and Qwen vision. Restart the Node app after changing `.env.local`.

### Optional — connect Langfuse observability

Create or open a Langfuse project, then copy its public and secret API keys into the server-side `.env.local`. Keep both keys private and out of GitHub. Use the base URL for your Langfuse region; the example below is the EU Cloud endpoint. The app sends operational traces (provider/model, modality, latency, reported token usage, and outcomes) but does not send prompts, transcripts, generated text, filenames, or media bytes. Langfuse is optional; leave the keys blank to disable it.

```dotenv
LANGFUSE_PUBLIC_KEY=pk-lf-your-project-public-key
LANGFUSE_SECRET_KEY=sk-lf-your-project-secret-key
LANGFUSE_BASE_URL=https://cloud.langfuse.com
LANGFUSE_TRACING_ENABLED=true
```

After adding keys, restart the Next.js app. Open Profile and settings to see whether Langfuse is configured. Generate text or media, then view Traces in the same Langfuse project. Cost is recorded only when the provider reports it; local Ollama and ComfyUI runs normally report none.

## 5. Start the whole app for daily use

Start only the services you need, or use all six CMD windows for the full local demo. First startup may download container images or models. Keep each foreground window open while using its feature.

### Window 1 — Ollama

Ollama usually starts automatically. Check it and make sure the three models are listed:

```cmd
ollama list
```

If it is not running, use `ollama serve` in this window and leave it open.

### Window 2 — LiteLLM gateway

From the project folder, create the container once. This runs LiteLLM in the background and keeps the named container available:

```cmd
cd /d "C:\Users\patil\Documents\Codex\2026-10-28\multimodal-ai-studio-with-safety-and"
docker run -d --name mosaic-litellm -p 4000:4000 --mount "type=bind,source=%cd%\litellm_config.yaml,target=/app/config.yaml,readonly" --env-file .env.litellm docker.litellm.ai/berriai/litellm:latest --config /app/config.yaml
```

On later days, if the container exists but is stopped, run `docker start mosaic-litellm`. If it is already **Up**, leave it alone. Check status or recent logs with:

```cmd
docker ps --filter "name=mosaic-litellm"
docker logs --tail 30 mosaic-litellm
```

### Window 3 — ComfyUI for image generation

Run the CPU version. Leave this window open; the ComfyUI page is at `http://localhost:8188`.

```cmd
cd /d "C:\Users\patil\Downloads\ComfyUI_windows_portable"
python_embeded\python.exe -s ComfyUI\main.py --cpu --windows-standalone-build
```

The image tab defaults to a higher-detail preset (512×512, 12 steps), with a balanced preset (384×384, 8 steps) and fast preview preset (320×320, 4 steps). A new random seed is used for each image. Higher-detail generation takes longer on a CPU. If ComfyUI reports its database is already in use, close the other ComfyUI process before starting another one.

### Window 4 — Speaches for transcription

This uses the CPU image. Keep the window open; Speaches is at `http://localhost:8000`.

```cmd
docker run --rm --name speaches -p 8000:8000 -v speaches-cache:/home/ubuntu/.cache/huggingface/hub ghcr.io/speaches-ai/speaches:latest-cpu
```

The app requests `Systran/faster-whisper-small`. Speaches can download a model automatically when requested. To download it explicitly after Speaches starts, use another CMD window:

```cmd
curl.exe -X POST http://localhost:8000/v1/models/Systran/faster-whisper-small
```

You can check loaded models with `http://localhost:8000/v1/models` in a browser.

### Window 5 — XTTS for speech creation

Read and agree to the [Coqui Public Model License](https://coqui.ai/cpml) before running XTTS. The environment flag records that agreement. XTTS downloads its model on first startup; a named volume keeps the model between runs. CPU speech generation can be slow.

```cmd
docker run --rm --name xtts -p 8002:80 -e COQUI_TOS_AGREED=1 -e TTS_HOME=/root/.local/share -v xtts-model-cache:/root/.local/share/tts ghcr.io/coqui-ai/xtts-streaming-server:latest-cpu
```

Wait for `Running XTTS Server ...` before testing speech. Keep the window open.

### Window 6 — Mosaic Next.js app

From the project folder, start the app:

```cmd
cd /d "C:\Users\patil\Documents\Codex\2026-10-28\multimodal-ai-studio-with-safety-and"
npm.cmd run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with `STUDIO_LOGIN_EMAIL` and `STUDIO_LOGIN_PASSWORD` from `.env.local`. If you have not installed the app dependencies yet, run `npm.cmd install` once before starting the app.

## 6. Generate each type of output in the app

There is no separate CMD command for each generation. Use the matching tab in Mosaic; the app calls the local service and applies its safety check.

- **Text:** Text tab → enter a prompt → **Generate text**. Requires Ollama and LiteLLM.
- **Image:** Image tab → enter a prompt → **Generate image**. Requires ComfyUI, the checkpoint, LiteLLM, and the image guard model.
- **Transcription:** Audio tab → **Transcribe audio** → choose a WAV, MP3, M4A, or other accepted audio file → **Transcribe audio**. Requires Speaches and LiteLLM for transcript safety. To transcribe speech you just created, use its **Download** link first, then select that file.
- **Speech creation:** Audio tab → **Create speech** → type text → **Create speech**. Requires XTTS and LiteLLM for input safety.
- **Video:** Not configured in this local setup. It needs a compatible video model plus a `video.api.json` ComfyUI workflow and prompt node ID.

Langfuse only receives traces when valid project keys are configured. It does not replace local history or provide fabricated dollar costs.

Generated media is stored in `.data/media/`. The dashboard records local usage and latency. Local providers do not report a dollar cost, so cost can remain blank.

## 7. Stop services and restart later

- Stop Node.js or ComfyUI with **Ctrl+C** in that service's CMD window.
- Stop Speaches or XTTS with **Ctrl+C** in its CMD window. The container is removed, but the named model-cache volume remains.
- Stop LiteLLM with `docker stop mosaic-litellm`. Start it next time with `docker start mosaic-litellm`.
- Ollama can remain in the Windows background; if you started `ollama serve` manually, stop it with **Ctrl+C**.

If LiteLLM reports that the container name is already used, check `docker ps -a --filter "name=mosaic-litellm"` and start the existing container instead of creating a second one. If any feature times out, first check that its service window is still open and its port is the one listed above.

## 8. Useful project checks

Run from the project folder when you want to check the app code:

```cmd
npm.cmd run lint
npm.cmd run build
```

These are development checks, not service startup commands. `.env.local`, `.env.litellm`, generated media, and model weights must stay out of Git.
