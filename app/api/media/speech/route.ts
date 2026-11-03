import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/session";
import { recordGeneration } from "@/lib/store";
import { moderateText } from "@/lib/moderation";
import { saveMedia } from "@/lib/media-store";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: NextRequest) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Sign in to use this workspace." }, { status: 401 });
  const base = process.env.XTTS_BASE_URL?.trim();
  if (!base) return NextResponse.json({ error: "Text-to-speech is not configured. Set XTTS_BASE_URL to the Coqui XTTS server." }, { status: 503 });
  let body: { text?: string; voice?: string; language?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request must contain valid JSON." }, { status: 400 }); }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 4_000) return NextResponse.json({ error: "Enter text between 1 and 4,000 characters." }, { status: 400 });

  const started = Date.now();
  try {
    if (await moderateText(text, "input") !== "safe") return NextResponse.json({ error: "This text was blocked by the input safety check." }, { status: 422 });
    const headers = process.env.XTTS_API_KEY ? { Authorization: `Bearer ${process.env.XTTS_API_KEY}` } : undefined;
    const speakersResponse = await fetch(`${base.replace(/\/$/, "")}/studio_speakers`, { headers, signal: AbortSignal.timeout(15_000) });
    if (!speakersResponse.ok) throw new Error(`xtts_error_${speakersResponse.status}`);
    const speakers = await speakersResponse.json() as Record<string, { speaker_embedding?: number[]; gpt_cond_latent?: number[][] }>;
    const voice = body.voice?.trim() || process.env.XTTS_VOICE?.trim() || Object.keys(speakers)[0];
    const speaker = voice ? speakers[voice] : undefined;
    if (!speaker?.speaker_embedding || !speaker.gpt_cond_latent) throw new Error("xtts_voice_unavailable");
    const response = await fetch(`${base.replace(/\/$/, "")}/tts`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(process.env.XTTS_API_KEY ? { Authorization: `Bearer ${process.env.XTTS_API_KEY}` } : {}) },
      body: JSON.stringify({ text, language: body.language?.trim() || process.env.XTTS_LANGUAGE?.trim() || "en", speaker_embedding: speaker.speaker_embedding, gpt_cond_latent: speaker.gpt_cond_latent }),
      signal: AbortSignal.timeout(150_000),
    });
    if (!response.ok) throw new Error(`xtts_error_${response.status}`);
    const encoded = await response.json() as string;
    if (typeof encoded !== "string") return NextResponse.json({ error: "XTTS returned an invalid audio response." }, { status: 502 });
    const bytes = new Uint8Array(Buffer.from(encoded, "base64"));
    if (!bytes.length || bytes.length > 50 * 1024 * 1024) return NextResponse.json({ error: "XTTS returned an empty or oversized audio file." }, { status: 502 });
    const saved = await saveMedia(bytes, "audio/wav");
    const latencyMs = Date.now() - started;
    await recordGeneration({ title: text.replace(/\s+/g, " ").slice(0, 60), modality: "audio", model: "XTTS v2", status: "complete", costUsd: null, latencyMs, usage: null, userEmail: session.email });
    return NextResponse.json({ ...saved, latencyMs, safety: "passed" });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown_error";
    const status = reason === "text_safety_not_configured" ? 503 : reason.startsWith("xtts_error_") || reason.startsWith("moderation_provider_error_") || reason === "moderation_verdict_missing" ? 502 : 504;
    const message = reason === "text_safety_not_configured" ? "Text safety is not configured. Set LITELLM_GUARD_MODEL."
      : reason === "xtts_voice_unavailable" ? "The XTTS server has no matching speaker. Check XTTS_VOICE or leave it blank to use the first available voice."
      : reason.startsWith("xtts_error_") ? "The XTTS service rejected the request. Check its endpoint, voice, and model."
      : status === 504 ? "The speech service timed out. Please retry."
      : "The text was withheld because the safety service returned no clear verdict.";
    return NextResponse.json({ error: message }, { status });
  }
}
