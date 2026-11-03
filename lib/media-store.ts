import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const mediaRoot = path.join(process.env.MOSAIC_DATA_DIR?.trim() || path.join(process.cwd(), ".data"), "media");

const extensions: Record<string, string> = {
  "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif",
  "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov", "audio/wav": ".wav", "audio/mpeg": ".mp3", "audio/ogg": ".ogg",
};

export async function saveMedia(bytes: Uint8Array, mimeType: string) {
  const extension = extensions[mimeType.toLowerCase()];
  if (!extension) throw new Error("unsupported_media_type");
  const id = randomUUID();
  await mkdir(mediaRoot, { recursive: true });
  await writeFile(path.join(mediaRoot, `${id}${extension}`), bytes, { flag: "wx" });
  return { id, url: `/api/media/${id}`, mimeType };
}

export async function loadMedia(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  for (const [mimeType, extension] of Object.entries(extensions)) {
    try { return { bytes: await readFile(path.join(mediaRoot, `${id}${extension}`)), mimeType }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return null;
}
