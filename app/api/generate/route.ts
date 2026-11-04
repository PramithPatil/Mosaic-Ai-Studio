import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/session";
import { recordGeneration } from "@/lib/store";
import { moderateText } from "@/lib/moderation";
import { withStudioTrace } from "@/lib/langfuse";

export const runtime = "nodejs";
const MAX_PROMPT_CHARS = 4_000;
const ALLOWED_MODALITIES = new Set(["text", "image", "audio", "video"]);

async function completion(model: string, messages: { role: string; content: string }[]) {
  const base = process.env.LITELLM_BASE_URL;
  const key = process.env.LITELLM_API_KEY;
  if (!base || !key) throw new Error("provider_not_configured");
  const response = await fetch(`${base.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, temperature: 0.4 }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`provider_error_${response.status}`);
  return response.json() as Promise<{ choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }>;
}

export async function POST(request: NextRequest) {
  const started = Date.now();
  const session = await currentSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to use this workspace." }, { status: 401 });
  }

  let body: { modality?: string; prompt?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request must contain valid JSON." }, { status: 400 }); }
  const modality = body.modality;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!modality || !ALLOWED_MODALITIES.has(modality)) return NextResponse.json({ error: "Choose a supported media tool." }, { status: 400 });
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) return NextResponse.json({ error: `Enter a prompt between 1 and ${MAX_PROMPT_CHARS} characters.` }, { status: 400 });
  if (modality !== "text") return NextResponse.json({ error: `${modality} generation is not connected yet. See the setup guide for the next integration steps.` }, { status: 501 });

  const textModel = process.env.LITELLM_TEXT_MODEL;
  if (!textModel || !process.env.LITELLM_GUARD_MODEL || !process.env.LITELLM_API_KEY) return NextResponse.json({ error: "provider_not_configured" }, { status: 503 });
  try {
    if (await moderateText(prompt, "input") !== "safe") return NextResponse.json({ error: "This prompt was blocked by the input safety check." }, { status: 422 });

    const generated = await withStudioTrace({ name: "generate-text", userEmail: session.email, metadata: { modality: "text", provider: "litellm" } }, async (trace) => {
      const generation = trace?.generation(textModel);
      try {
        const result = await completion(textModel, [{ role: "user", content: prompt }]);
        if (result.usage) generation?.update({ usageDetails: { input: result.usage.prompt_tokens ?? 0, output: result.usage.completion_tokens ?? 0, total: (result.usage.prompt_tokens ?? 0) + (result.usage.completion_tokens ?? 0) } });
        trace?.update({ providerresult: "received" });
        return result;
      } catch (error) {
        generation?.update({ level: "ERROR", statusMessage: "Text provider request failed" });
        trace?.update({ providerresult: "error" });
        throw error;
      } finally { generation?.end(); }
    });
    const text = generated.choices?.[0]?.message?.content;
    if (!text) return NextResponse.json({ error: "The model returned no text. Please retry." }, { status: 502 });
    if (await moderateText(text, "output") !== "safe") return NextResponse.json({ error: "The response was withheld by the output safety check." }, { status: 422 });

    const latencyMs = Date.now() - started;
    await recordGeneration({ title: prompt.replace(/\s+/g, " ").slice(0, 60), modality, model: textModel, status: "complete", costUsd: null, latencyMs, usage: generated.usage ?? null, userEmail: session.email });
    return NextResponse.json({ text, latencyMs, safety: "passed", usage: generated.usage ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    const status = message === "provider_not_configured" || message === "text_safety_not_configured" ? 503
      : message.startsWith("provider_error_") || message.startsWith("moderation_provider_error_") || message === "moderation_verdict_missing" ? 502 : 504;
    const responseError = status === 504 ? "The model gateway timed out. Please retry."
      : status === 503 ? "The text model or safety model is not configured."
      : "The model gateway or safety service could not complete this request.";
    return NextResponse.json({ error: responseError }, { status });
  }
}
