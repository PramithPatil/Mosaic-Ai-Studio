import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/session";
import { recordGeneration } from "@/lib/store";
import { moderateText } from "@/lib/moderation";

export const runtime = "nodejs";
export const maxDuration = 300;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Sign in to use this workspace." }, { status: 401 });
  const base = process.env.WHISPER_BASE_URL?.trim();
  if (!base) return NextResponse.json({ error: "Speech-to-text is not configured. Set WHISPER_BASE_URL to an OpenAI-compatible Whisper server." }, { status: 503 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose an audio file to transcribe." }, { status: 400 });
  if (file.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Audio files must be 25 MB or smaller." }, { status: 413 });
  const upstream = new FormData();
  upstream.append("file", file, file.name || "recording.wav");
  upstream.append("model", process.env.WHISPER_MODEL?.trim() || "whisper-1");
  upstream.append("response_format", "json");

  const started = Date.now();
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/v1/audio/transcriptions`, {
      method: "POST",
      headers: process.env.WHISPER_API_KEY ? { Authorization: `Bearer ${process.env.WHISPER_API_KEY}` } : undefined,
      body: upstream,
      signal: AbortSignal.timeout(240_000),
    });
    if (!response.ok) throw new Error(`whisper_error_${response.status}`);
    const data = await response.json() as { text?: string };
    const transcript = data.text?.trim();
    if (!transcript) return NextResponse.json({ error: "Whisper returned an empty transcript." }, { status: 502 });
    if (await moderateText(transcript, "output") !== "safe") return NextResponse.json({ error: "The transcript was withheld by the output safety check." }, { status: 422 });
    const latencyMs = Date.now() - started;
    await recordGeneration({ title: `Transcription · ${file.name || "audio upload"}`.slice(0, 60), modality: "audio", model: process.env.WHISPER_MODEL?.trim() || "Whisper", status: "complete", costUsd: null, latencyMs, usage: null, userEmail: session.email });
    return NextResponse.json({ text: transcript, latencyMs, safety: "passed" });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown_error";
    const status = reason === "text_safety_not_configured" ? 503 : reason.startsWith("whisper_error_") || reason.startsWith("moderation_provider_error_") || reason === "moderation_verdict_missing" ? 502 : 504;
    const message = reason === "text_safety_not_configured" ? "Text safety is not configured. Set LITELLM_GUARD_MODEL."
      : reason.startsWith("whisper_error_") ? "The Whisper service rejected the audio. Check its endpoint and model."
      : status === 504 ? "The transcription service timed out. Please retry."
      : "The transcript was withheld because the safety service returned no clear verdict.";
    return NextResponse.json({ error: message }, { status });
  }
}
