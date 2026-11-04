export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY || process.env.LANGFUSE_TRACING_ENABLED === "false") return;

  try {
    const [{ NodeSDK }, { LangfuseSpanProcessor }] = await Promise.all([
      import(/* webpackIgnore: true */ "@opentelemetry/sdk-node"),
      import(/* webpackIgnore: true */ "@langfuse/otel"),
    ]);
    if (!process.env.LANGFUSE_BASE_URL && process.env.LANGFUSE_HOST) process.env.LANGFUSE_BASE_URL = process.env.LANGFUSE_HOST;
    const sdk = new NodeSDK({ spanProcessors: [new LangfuseSpanProcessor()] });
    sdk.start();
  } catch (error) {
    console.error("[langfuse] Tracing initialization failed; continuing without tracing.", error);
  }
}
