import { createHmac } from "node:crypto";
import { propagateAttributes, startActiveObservation, startObservation, type LangfuseGeneration } from "@langfuse/tracing";

export type StudioTrace = {
  update: (metadata: Record<string, string | number | boolean>) => void;
  generation: (model: string) => LangfuseGeneration;
};

type TraceOptions = {
  name: string;
  userEmail: string;
  metadata: Record<string, string | number | boolean>;
};

export function langfuseConfigured() {
  return Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);
}

function privateId(value: string | undefined) {
  const hashKey = process.env.STUDIO_SESSION_SECRET;
  return value && hashKey ? createHmac("sha256", hashKey).update(value.toLowerCase()).digest("hex").slice(0, 24) : undefined;
}

/** Capture operational metadata only. Never add prompts, transcripts, outputs, filenames, or media bytes. */
export async function withStudioTrace<T>(options: TraceOptions, operation: (trace?: StudioTrace) => Promise<T>): Promise<T> {
  if (!langfuseConfigured() || process.env.LANGFUSE_TRACING_ENABLED === "false") return operation();

  let operationStarted = false;
  try {
    return await startActiveObservation(options.name, async (span) => {
      span.update({ metadata: options.metadata });
      const userId = privateId(options.userEmail);
      const tracedOperation = async () => {
        operationStarted = true;
        return operation({
          update: (metadata) => span.update({ metadata }),
          generation: (model) => startObservation("call-model", { model }, { asType: "generation" }),
        });
      };
      return propagateAttributes({ ...(userId ? { userId } : {}), tags: [`feature:${String(options.metadata.modality ?? "unknown")}`], metadata: options.metadata }, tracedOperation);
    }, { asType: "span" });
  } catch (error) {
    // If the SDK fails before work begins, tracing must not block the user's generation.
    if (!operationStarted) return operation();
    throw error;
  }
}
