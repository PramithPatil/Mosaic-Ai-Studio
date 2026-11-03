import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type PromptVersion = { version: number; content: string; updatedAt: string };
export type SavedPrompt = { id: string; title: string; content: string; version: number; createdAt: string; updatedAt: string; versions: PromptVersion[] };
export type GenerationRecord = { id: string; title: string; modality: string; model: string; status: "complete"; costUsd: number | null; latencyMs: number; usage: unknown; createdAt: string; userEmail: string };
type WorkspaceData = { prompts: SavedPrompt[]; activity: GenerationRecord[] };

const dataRoot = process.env.MOSAIC_DATA_DIR?.trim() || path.join(process.cwd(), ".data");
const dataPath = path.join(dataRoot, "workspace.json");
let pendingWrite: Promise<void> = Promise.resolve();

const starterPrompts: Omit<SavedPrompt, "createdAt" | "updatedAt">[] = [
  { id: "product-update", title: "Product update", content: "Write a clear, friendly product update for a busy team. Include the impact and next steps.", version: 3, versions: [
    { version: 1, content: "Write a product update.", updatedAt: "2026-10-20T10:00:00.000Z" },
    { version: 2, content: "Write a clear product update for a busy team.", updatedAt: "2026-10-23T10:00:00.000Z" },
    { version: 3, content: "Write a clear, friendly product update for a busy team. Include the impact and next steps.", updatedAt: "2026-10-28T10:00:00.000Z" },
  ] },
  { id: "editorial-illustration", title: "Editorial illustration", content: "A minimal editorial illustration with soft shapes, warm tones, and generous negative space.", version: 2, versions: [
    { version: 1, content: "A minimal editorial illustration with warm tones.", updatedAt: "2026-10-21T10:00:00.000Z" },
    { version: 2, content: "A minimal editorial illustration with soft shapes, warm tones, and generous negative space.", updatedAt: "2026-10-28T10:00:00.000Z" },
  ] },
  { id: "explain-simply", title: "Explain simply", content: "Explain this idea in simple terms. Use one concrete example and end with a practical takeaway.", version: 1, versions: [
    { version: 1, content: "Explain this idea in simple terms. Use one concrete example and end with a practical takeaway.", updatedAt: "2026-10-28T10:00:00.000Z" },
  ] },
];

async function load(): Promise<WorkspaceData> {
  try {
    const data = JSON.parse(await readFile(dataPath, "utf8")) as Partial<WorkspaceData>;
    return { prompts: Array.isArray(data.prompts) ? data.prompts : [], activity: Array.isArray(data.activity) ? data.activity : [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const now = new Date().toISOString();
    return { prompts: starterPrompts.map((prompt) => ({ ...prompt, createdAt: now, updatedAt: now })), activity: [] };
  }
}

async function save(data: WorkspaceData) {
  await mkdir(path.dirname(dataPath), { recursive: true });
  const tempPath = `${dataPath}.${randomUUID()}.tmp`;
  await writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  await rename(tempPath, dataPath);
}

async function update(mutator: (data: WorkspaceData) => void) {
  const operation = pendingWrite.then(async () => {
    const data = await load();
    mutator(data);
    await save(data);
  });
  pendingWrite = operation.catch(() => undefined);
  await operation;
}

export async function listPrompts() {
  await pendingWrite;
  const data = await load();
  if (!(await exists())) {
    await update(() => undefined);
  }
  return data.prompts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function exists() {
  try { await readFile(dataPath); return true; } catch { return false; }
}

export async function savePrompt(input: { id?: string; title: string; content: string }) {
  const now = new Date().toISOString();
  let result!: SavedPrompt;
  await update((data) => {
    const existing = input.id ? data.prompts.find((prompt) => prompt.id === input.id) : undefined;
    if (existing) {
      existing.title = input.title;
      existing.version += 1;
      existing.content = input.content;
      existing.updatedAt = now;
      existing.versions.push({ version: existing.version, content: input.content, updatedAt: now });
      result = existing;
    } else {
      result = { id: randomUUID(), title: input.title, content: input.content, version: 1, createdAt: now, updatedAt: now, versions: [{ version: 1, content: input.content, updatedAt: now }] };
      data.prompts.push(result);
    }
  });
  return result;
}

export async function recordGeneration(record: Omit<GenerationRecord, "id" | "createdAt">) {
  const result: GenerationRecord = { ...record, id: randomUUID(), createdAt: new Date().toISOString() };
  await update((data) => { data.activity.unshift(result); data.activity = data.activity.slice(0, 500); });
  return result;
}

export async function listActivity(userEmail: string) {
  await pendingWrite;
  const data = await load();
  return data.activity.filter((record) => record.userEmail === userEmail).slice(0, 100);
}
