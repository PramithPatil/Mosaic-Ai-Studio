type MessageContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

async function completion(model: string, messages: { role: "system" | "user"; content: MessageContent }[], timeoutMs = 45_000) {
  const base = process.env.LITELLM_BASE_URL;
  const key = process.env.LITELLM_API_KEY;
  if (!base || !key) throw new Error("provider_not_configured");
  const response = await fetch(`${base.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, temperature: 0, max_tokens: 16 }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`moderation_provider_error_${response.status}`);
  return response.json() as Promise<{ choices?: { message?: { content?: string } }[] }>;
}

function verdict(value: string | undefined) {
  const match = value?.match(/^\s*(safe|unsafe)\b/i);
  if (!match) throw new Error("moderation_verdict_missing");
  return match[1].toLowerCase() as "safe" | "unsafe";
}

export async function moderateText(text: string, kind: "input" | "output" | "transcript") {
  const model = process.env.LITELLM_GUARD_MODEL;
  if (!model) throw new Error("text_safety_not_configured");
  // Ollama's llama-guard3 template supplies its own policy and verdict instructions.
  // Passing a custom system message makes that text appear as an Agent turn in its
  // classification conversation, which can cause the policy description itself to
  // be classified as unsafe. Give the native template only the content to assess.
  void kind;
  const result = await completion(model, [{ role: "user", content: text }]);
  return verdict(result.choices?.[0]?.message?.content);
}

export async function moderateImage(bytes: Uint8Array, mimeType: string) {
  const model = process.env.LITELLM_IMAGE_GUARD_MODEL;
  if (!model) throw new Error("image_safety_not_configured");
  const encoded = Buffer.from(bytes).toString("base64");
  const result = await completion(model, [
    { role: "system", content: "You are a visual safety classifier. Default to safe. Mark unsafe only when the image unmistakably and explicitly depicts at least one of these severe cases: sexual exploitation of a minor; pornographic sexual activity; graphic, realistic gore or serious violence; explicit self-harm; or clear hate symbols or dehumanizing imagery promoting hatred. Mild violence, non-graphic conflict, weapons in ordinary or fictional contexts, medical or nonsexual anatomy, fantasy creatures, cartoons, stylized or cinematic scenes, ordinary scenery, and people in nonsexual contexts are safe. Judge only visible image evidence; do not infer harm from the prompt, lighting, color, fictional settings, or ambiguous details. Unclear, ambiguous, or low-resolution images are safe unless specific visible evidence unmistakably shows one of the severe cases above. Reply with exactly 'safe' or 'unsafe' followed by a short category code." },
    { role: "user", content: [
      { type: "text", text: "Classify this generated image." },
      { type: "image_url", image_url: { url: `data:${mimeType};base64,${encoded}` } },
    ] },
  ], 120_000);
  return verdict(result.choices?.[0]?.message?.content);
}
