# Mosaic - Multimodal AI Studio

A Next.js local MVP for governed text, image, audio, and video creation. It has a server-verified single-account sign-in, persistent prompt versions and generation history, and a text route through LiteLLM with input and output safety checks.

## Current features

- Responsive studio UI with separate Text, Image, Audio, and Video tabs.
- Environment-configured sign-in with a signed, HTTP-only session cookie and sign-out.
- Prompt library stored locally with version numbers. Saving a loaded prompt creates a new version.
- Local JSON storage for safety-cleared generation history and usage latency.
- Text generation through a LiteLLM-compatible gateway. The input and output are checked by a configured guard model; requests fail closed if a verdict is missing or unsafe.
- Dashboard numbers are derived from saved activity. Cost remains blank when the gateway does not provide cost data.
- Governance policy and architecture notes in `docs/`.

This starter supports one configured account and one local workspace; it is not multi-user identity management. The JSON store is for a single-process local demo, not concurrent or serverless production. Image, Whisper transcription, XTTS speech synthesis, video generation, Langfuse telemetry, budget enforcement, and provider-reported cost attribution are not implemented yet.

## Run locally

For the full Windows setup, credential configuration, usage steps, and troubleshooting, see [EXECUTION_GUIDE.md](EXECUTION_GUIDE.md).

Requirements: Node.js 20.9+ and npm.

1. Copy `.env.example` to `.env.local`.
2. Set `STUDIO_LOGIN_EMAIL`, a strong `STUDIO_LOGIN_PASSWORD`, `STUDIO_WORKSPACE_ID`, and a random `STUDIO_SESSION_SECRET` of at least 32 characters. Generate a session secret with:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

3. To enable text generation, configure `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `LITELLM_TEXT_MODEL`, and `LITELLM_GUARD_MODEL`. The LiteLLM proxy must expose an OpenAI-compatible `/v1/chat/completions` endpoint and route both model aliases.
4. Install and start:

   ```sh
   npm install
   npm run dev
   ```

5. Open `http://localhost:3000` and sign in with the configured account.

Without sign-in configuration, the app shows setup instructions. Without the model gateway, text generation is unavailable. Keep credentials in server-side environment variables; never use `NEXT_PUBLIC_*` for secrets. The environment-based single-account login is intended for a local demo. Use a managed identity provider before deployment.

## API

All workspace routes require a valid session cookie.

### `POST /api/generate`

Request JSON: `{ "modality": "text", "prompt": "..." }`. The prompt may be up to 4,000 characters. Text is the only connected modality; other media return `501`. The input safety check runs before generation, and an output safety check runs before returning a response. Missing or unsafe guard verdicts withhold the output.

Success: `{ "text": "...", "latencyMs": 1234, "safety": "passed", "usage": { ... } }`. Safety-cleared generations are recorded in `.data/workspace.json`. The UI reports costs only when known; cost data is currently not calculated.

### `GET /api/prompts` and `POST /api/prompts`

Read saved prompts or save one. POST body: `{ "title": "...", "content": "...", "id": "optional existing prompt id" }`. Updating an existing prompt adds a numbered version; the previous text remains in its version history.

### `GET /api/activity`

Returns recent generations for the signed-in account. Records are local and limited to the latest 500 in the workspace file.

## Architecture and policy

See [docs/architecture.md](docs/architecture.md) for request flow and integration points, and [docs/governance-policy.md](docs/governance-policy.md) for acceptable use, data handling, and incident reporting.

## Remaining work

1. Replace the local single-account login and JSON file with managed identity, workspace roles, a database, durable audit events, and deployment-safe storage.
2. Integrate ComfyUI or Diffusers, Whisper, XTTS, and a video provider. Add image moderation and visible generated-content labels or watermarks.
3. Add Langfuse traces, budget enforcement, and verified per-user cost attribution.
4. Add integration tests for authentication, prompt versions, moderation, failures, and limits. Measure latency, quality, and cost in staging.
5. Record the demo and prepare the presentation and individual reflections.
