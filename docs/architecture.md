# Architecture and API notes

## Current sign-in and request flow

```mermaid
flowchart LR
  U[Browser studio] -->|Sign-in form| AUTH[Next.js auth route]
  AUTH -->|signed HttpOnly cookie| U
  U -->|session cookie| N[Protected Next.js API routes]
  N -->|validate signed session| AUTH
  N -->|prompt safety request| L[LiteLLM proxy]
  L --> G[Llama Guard model]
  N -->|text request after input passes| L
  L --> T[Configured text model]
  N -->|generated response safety request| L
  L --> G
  N -->|text + latency + gateway usage| U
  N -->|safety-cleared generation record| STORE[Local JSON workspace store]
  U -->|versioned prompt CRUD| STORE
  STORE -->|activity + prompt list| U
```

The API route keeps provider credentials server-side. Login uses one environment-configured account and signs 12-hour HTTP-only cookies; the current configured email and workspace must still match when a cookie is read. Input and output moderation fail closed when a verdict is absent. The guard implementation uses a LiteLLM model alias configured by the operator; validate its exact model format and policy labels against the deployed Llama Guard version before production use. The browser receives a generic gateway error rather than provider response details.

Prompt versions and generation metadata live in `.data/workspace.json` (or the optional `MOSAIC_DATA_DIR`). Writes use a temporary file and atomic rename, with in-process serialization. This local store is not suitable for multi-process or serverless deployment.

## Planned multimodal and governance flow

```mermaid
flowchart TD
  UI[Next.js studio] --> AUTH[Authentication and workspace policy]
  AUTH --> SAFEIN[Input safety checks]
  SAFEIN --> ROUTER[LiteLLM gateway and budget router]
  ROUTER --> TEXT[Language models]
  ROUTER --> IMAGE[ComfyUI or Diffusers]
  ROUTER --> WHISPER[Whisper STT]
  ROUTER --> XTTS[XTTS TTS]
  ROUTER --> VIDEO[Video provider]
  TEXT --> SAFEOUT[Output moderation]
  IMAGE --> IMGSAFE[Image safety + generated label]
  WHISPER --> SAFEOUT
  XTTS --> SAFEOUT
  VIDEO --> SAFEOUT
  SAFEOUT --> AUDIT[Audit and usage events]
  IMGSAFE --> AUDIT
  AUDIT --> LANGFUSE[Langfuse traces and cost analytics]
  AUDIT --> DB[(Workspace database)]
  DB --> PROMPTS[Versioned prompt library]
  DB --> DASH[Usage and governance dashboard]
```

## API contract

### `POST /api/generate`

- Input: JSON object with `modality` (`text`, `image`, `audio`, or `video`) and non-empty `prompt` (maximum 4,000 characters).
- Auth: valid signed session cookie required. The local MVP supports a single environment-configured account; replace it with managed identity and workspace role checks before deployment.
- Safety order: input guard → generation → output guard → return. Missing guard verdicts withhold generation output.
- Current supported modality: `text`. Other modalities return `501 Not Implemented`.
- Success: text, elapsed server latency, a safety pass marker, and gateway-reported token usage when available. Only safety-cleared responses are persisted to activity history.
- Errors: `400` invalid input, `401` failed configured bearer check, `422` moderation rejection, `501` unconnected modality, `502` gateway or safety service failure, `503` missing configuration, `504` timeout.

Prompt text and versions plus generation metadata are persisted locally. Traces and costs are not yet captured. Do not use the current dashboard for billing or operational reporting.
