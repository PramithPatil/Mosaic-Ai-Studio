import { readFile } from "node:fs/promises";
import { randomInt } from "node:crypto";
import path from "node:path";

type Artifact = { filename: string; subfolder?: string; type?: string };

function fileUrl(base: string, file: Artifact) {
  const url = new URL(`${base.replace(/\/$/, "")}/view`);
  url.searchParams.set("filename", file.filename);
  url.searchParams.set("subfolder", file.subfolder ?? "");
  url.searchParams.set("type", file.type ?? "output");
  return url;
}

function artifactsFromHistory(entry: { outputs?: Record<string, Record<string, unknown>> }, kind: "image" | "video") {
  const allowed = kind === "image" ? /\.(png|jpe?g|webp)$/i : /\.(mp4|webm|mov|gif)$/i;
  const artifacts: Artifact[] = [];
  for (const output of Object.values(entry.outputs ?? {})) {
    for (const [key, value] of Object.entries(output)) {
      if (kind === "image" && key !== "images") continue;
      if (kind === "video" && !["videos", "video", "gifs", "animations"].includes(key)) continue;
      if (!Array.isArray(value)) continue;
      for (const item of value) {
        if (item && typeof item === "object" && typeof (item as Artifact).filename === "string" && allowed.test((item as Artifact).filename)) artifacts.push(item as Artifact);
      }
    }
  }
  return artifacts;
}

export async function runComfyWorkflow(kind: "image" | "video", text: string, imageQuality: "fast" | "quality" = "quality") {
  const base = process.env.COMFYUI_BASE_URL?.trim();
  const workflowPath = process.env[kind === "image" ? "COMFYUI_IMAGE_WORKFLOW_PATH" : "COMFYUI_VIDEO_WORKFLOW_PATH"]?.trim();
  const promptNodeId = process.env[kind === "image" ? "COMFYUI_IMAGE_PROMPT_NODE_ID" : "COMFYUI_VIDEO_PROMPT_NODE_ID"]?.trim();
  if (!base || !workflowPath || !promptNodeId) throw new Error(`${kind}_provider_not_configured`);

  const resolvedPath = path.isAbsolute(workflowPath) ? workflowPath : path.join(process.cwd(), workflowPath);
  let workflow: Record<string, { class_type?: string; inputs?: Record<string, unknown> }>;
  try { workflow = JSON.parse(await readFile(resolvedPath, "utf8")) as typeof workflow; }
  catch { throw new Error(`${kind}_workflow_unavailable`); }
  if (!workflow[promptNodeId]?.inputs || typeof workflow[promptNodeId].inputs?.text !== "string") throw new Error(`${kind}_prompt_node_invalid`);
  workflow[promptNodeId].inputs!.text = text;
  if (kind === "image") {
    const preset = imageQuality === "fast" ? { width: 320, height: 320, steps: 4 }
      : imageQuality === "balanced" ? { width: 384, height: 384, steps: 8 }
      : { width: 512, height: 512, steps: 12 };
    for (const node of Object.values(workflow)) {
      if (node.class_type === "EmptyLatentImage" && node.inputs) {
        node.inputs.width = preset.width;
        node.inputs.height = preset.height;
      }
      if (node.class_type === "KSampler" && node.inputs) {
        node.inputs.steps = preset.steps;
        node.inputs.seed = randomInt(0, 2 ** 32);
      }
    }
  }

  const headers = { "Content-Type": "application/json", ...(process.env.COMFYUI_API_KEY ? { Authorization: `Bearer ${process.env.COMFYUI_API_KEY}` } : {}) };
  const queued = await fetch(`${base.replace(/\/$/, "")}/prompt`, {
    method: "POST", headers, body: JSON.stringify({ prompt: workflow }), signal: AbortSignal.timeout(20_000),
  });
  if (!queued.ok) throw new Error(`${kind}_queue_failed`);
  const queueData = await queued.json() as { prompt_id?: string; error?: unknown; node_errors?: unknown };
  if (!queueData.prompt_id) throw new Error(`${kind}_workflow_rejected`);

  const timeout = Math.min(Math.max(Number(process.env.COMFYUI_TIMEOUT_MS) || 900_000, 20_000), 900_000);
  const deadline = Date.now() + timeout;
  let artifacts: Artifact[] = [];
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const history = await fetch(`${base.replace(/\/$/, "")}/history/${encodeURIComponent(queueData.prompt_id)}`, { headers, signal: AbortSignal.timeout(10_000) });
    if (!history.ok) continue;
    const record = await history.json() as Record<string, { outputs?: Record<string, Record<string, unknown>>; status?: { status_str?: string } }>;
    const entry = record[queueData.prompt_id];
    if (!entry) continue;
    if (entry.status?.status_str === "error") throw new Error(`${kind}_workflow_failed`);
    artifacts = artifactsFromHistory(entry, kind);
    if (artifacts.length) break;
  }
  if (!artifacts.length) throw new Error(`${kind}_timed_out_or_empty`);

  const artifact = artifacts[0];
  const response = await fetch(fileUrl(base, artifact), { headers, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${kind}_download_failed`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const extension = artifact.filename.match(/\.(png|jpe?g|webp|mp4|webm|mov|gif)$/i)?.[0].toLowerCase();
  const mimeType = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg"
    : extension === ".webp" ? "image/webp" : extension === ".mp4" || extension === ".mov" ? "video/mp4"
    : extension === ".webm" ? "video/webm" : extension === ".mov" ? "video/quicktime" : extension === ".gif" ? "image/gif" : "image/png";
  return { bytes, mimeType, filename: artifact.filename };
}
