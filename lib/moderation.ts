type MessageContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

async function completion(model: string, messages: { role: "system" | "user"; content: MessageContent }[]) {
  const base = process.env.LITELLM_BASE_URL;
  const key = process.env.LITELLM_API_KEY;
  if (!base || !key) throw new Error("provider_not_configured");
  const response = await fetch(`${base.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, temperature: 0 }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`moderation_provider_error_${response.status}`);
  return response.json() as Promise<{ choices?: { message?: { content?: string } }[] }>;
}

function verdict(value: string | undefined) {
  const match = value?.match(/^\s*(safe|unsafe)\b/i);
  if (!match) throw new Error("moderation_verdict_missing");
  return match[1].toLowerCase() as "safe" | "unsafe";
}

export async function moderateText(text: string, kind: "input" | "output") {
  const model = process.env.LITELLM_GUARD_MODEL;
  if (!model) throw new Error("text_safety_not_configured");
  const instruction = kind === "input"
    ? "Classify the user request for harmful or disallowed content. Reply with exactly 'safe' or 'unsafe' followed by a short category code."
    : "Classify the assistant response for harmful or disallowed content. Reply with exactly 'safe' or 'unsafe' followed by a short category code.";
  const result = await completion(model, [
    { role: "system", content: `You are a content safety classifier. ${instruction}` },
    { role: "user", content: text },
  ]);
  return verdict(result.choices?.[0]?.message?.content);
}

export async function moderateImage(bytes: Uint8Array, mimeType: string) {
  const model = process.env.LITELLM_IMAGE_GUARD_MODEL;
  if (!model) throw new Error("image_safety_not_configured");
  const encoded = Buffer.from(bytes).toString("base64");
  const result = await completion(model, [
    { role: "system", content: "You are a visual safety classifier. Check the image for explicit sexual content, graphic violence, self-harm, or other clearly harmful/disallowed imagery. Reply with exactly 'safe' or 'unsafe' followed by a short category code. If uncertain, reply unsafe." },
    { role: "user", content: [
      { type: "text", text: "Classify this generated image." },
      { type: "image_url", image_url: { url: `data:${mimeType};base64,${encoded}` } },
    ] },
  ]);
  return verdict(result.choices?.[0]?.message?.content);
}
