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

## 4. Configure LiteLLM for text generation

For UI-only exploration, leave the gateway values blank. To enable guarded text generation, set:

```dotenv
LITELLM_BASE_URL=http://localhost:4000
LITELLM_API_KEY=your-server-side-key
LITELLM_TEXT_MODEL=your-text-model-alias
LITELLM_GUARD_MODEL=your-llama-guard-alias
```

The URL must point to a LiteLLM proxy exposing `/v1/chat/completions`. Configure both aliases in LiteLLM. The request passes through an input check, text generation, and an output check. Missing or unsafe guard verdicts withhold the output. Provider credentials remain server-side; do not prefix them with `NEXT_PUBLIC_`.

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
