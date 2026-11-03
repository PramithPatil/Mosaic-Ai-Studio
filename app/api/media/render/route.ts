import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/session";
import { recordGeneration } from "@/lib/store";
import { moderateImage, moderateText } from "@/lib/moderation";
import { runComfyWorkflow } from "@/lib/comfy";
import { saveMedia } from "@/lib/media-store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Sign in to use this workspace." }, { status: 401 });

  let body: { modality?: string; prompt?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request must contain valid JSON." }, { status: 400 }); }
  const modality = body.modality;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (modality !== "image" && modality !== "video") return NextResponse.json({ error: "Choose image or video generation." }, { status: 400 });
  if (!prompt || prompt.length > 4_000) return NextResponse.json({ error: "Enter a prompt between 1 and 4,000 characters." }, { status: 400 });
  if (modality === "image" && !process.env.LITELLM_IMAGE_GUARD_MODEL) return NextResponse.json({ error: "Image output safety is not configured. Add a vision-capable safety model alias before generating images." }, { status: 503 });

  const started = Date.now();
  try {
    if (await moderateText(prompt, "input") !== "safe") return NextResponse.json({ error: "This prompt was blocked by the input safety check." }, { status: 422 });
    const generated = await runComfyWorkflow(modality, prompt);
    if (modality === "image" && await moderateImage(generated.bytes, generated.mimeType) !== "safe") {
      return NextResponse.json({ error: "The generated image was withheld by the image safety check." }, { status: 422 });
    }
    const saved = await saveMedia(generated.bytes, generated.mimeType);
    const latencyMs = Date.now() - started;
    await recordGeneration({ title: prompt.replace(/\s+/g, " ").slice(0, 60), modality, model: `ComfyUI · ${modality}`, status: "complete", costUsd: null, latencyMs, usage: null, userEmail: session.email });
    return NextResponse.json({ ...saved, latencyMs, safety: "passed" });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown_error";
    const status = reason.endsWith("not_configured") || reason.endsWith("unavailable") ? 503
      : reason.endsWith("node_invalid") ? 400
      : reason.includes("blocked") ? 422
      : reason.includes("moderation_provider_error") || reason === "moderation_verdict_missing" || reason.endsWith("queue_failed") || reason.endsWith("download_failed") ? 502
      : 504;
    const messages: Record<string, string> = {
      text_safety_not_configured: "Text safety is not configured. Set LITELLM_GUARD_MODEL.",
      image_safety_not_configured: "Image safety is not configured. Set LITELLM_IMAGE_GUARD_MODEL.",
      moderation_verdict_missing: "The safety service returned no clear verdict; the result was withheld.",
      image_provider_not_configured: "Image generation is not configured. Set the ComfyUI image workflow path and prompt node ID.",
      video_provider_not_configured: "Video generation is not configured. Set the ComfyUI video workflow path and prompt node ID.",
      image_workflow_unavailable: "The ComfyUI image workflow file could not be read.",
      video_workflow_unavailable: "The ComfyUI video workflow file could not be read.",
      image_prompt_node_invalid: "The configured image prompt node ID is not a text prompt node in the workflow.",
      video_prompt_node_invalid: "The configured video prompt node ID is not a text prompt node in the workflow.",
      image_queue_failed: "ComfyUI could not queue the image workflow. Check that it is running and the workflow is valid.",
      video_queue_failed: "ComfyUI could not queue the video workflow. Check that it is running and the workflow is valid.",
      image_workflow_rejected: "ComfyUI rejected the image workflow. Check its model files and required nodes.",
      video_workflow_rejected: "ComfyUI rejected the video workflow. Check its model files and required nodes.",
      image_workflow_failed: "The ComfyUI image workflow failed. Check the ComfyUI console for missing models or nodes.",
      video_workflow_failed: "The ComfyUI video workflow failed. Check the ComfyUI console for missing models or nodes.",
      image_timed_out_or_empty: "The image workflow timed out or returned no image.",
      video_timed_out_or_empty: "The video workflow timed out or returned no video.",
      image_download_failed: "ComfyUI finished but its image could not be downloaded.",
      video_download_failed: "ComfyUI finished but its video could not be downloaded.",
    };
    const errorMessage = reason === "unsafe" ? "This prompt was blocked by the input safety check."
      : reason === "image_blocked" ? "The generated image was withheld by the image safety check."
      : messages[reason] ?? "The media service could not complete this request.";
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
