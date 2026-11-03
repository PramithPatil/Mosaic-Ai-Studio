import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/session";
import { recordGeneration } from "@/lib/store";

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

function isUnsafe(result: string | undefined) {
  return /^\s*unsafe\b/i.test(result ?? "");
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
  const guardModel = process.env.LITELLM_GUARD_MODEL;
  if (!textModel || !guardModel || !process.env.LITELLM_API_KEY) return NextResponse.json({ error: "provider_not_configured" }, { status: 503 });
  try {
    const inputGuard = await completion(guardModel, [
      { role: "system", content: "You are a content safety classifier. Determine if the user message requests assistance with harmful or disallowed content. Reply exactly 'safe' or 'unsafe' followed by a short category code." },
      { role: "user", content: prompt },
    ]);
    const inputVerdict = inputGuard.choices?.[0]?.message?.content;
    if (!inputVerdict) return NextResponse.json({ error: "The safety service returned no verdict. Please retry." }, { status: 502 });
    if (isUnsafe(inputVerdict)) return NextResponse.json({ error: "This prompt was blocked by the input safety check." }, { status: 422 });

    const generated = await completion(textModel, [{ role: "user", content: prompt }]);
    const text = generated.choices?.[0]?.message?.content;
    if (!text) return NextResponse.json({ error: "The model returned no text. Please retry." }, { status: 502 });
    const outputGuard = await completion(guardModel, [
      { role: "system", content: "You are a content safety classifier. Determine if the assistant response contains harmful or disallowed content. Reply exactly 'safe' or 'unsafe' followed by a short category code." },
      { role: "user", content: text },
    ]);
    const outputVerdict = outputGuard.choices?.[0]?.message?.content;
    if (!outputVerdict) return NextResponse.json({ error: "The output safety service returned no verdict; the response was withheld." }, { status: 502 });
    if (isUnsafe(outputVerdict)) return NextResponse.json({ error: "The response was withheld by the output safety check." }, { status: 422 });

    const latencyMs = Date.now() - started;
    await recordGeneration({ title: prompt.replace(/\s+/g, " ").slice(0, 60), modality, model: textModel, status: "complete", costUsd: null, latencyMs, usage: generated.usage ?? null, userEmail: session.email });
    return NextResponse.json({ text, latencyMs, safety: "passed", usage: generated.usage ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    const status = message === "provider_not_configured" ? 503 : message.startsWith("provider_error_") ? 502 : 504;
    return NextResponse.json({ error: status === 504 ? "The model gateway timed out. Please retry." : "The model gateway could not complete this request." }, { status });
  }
}
