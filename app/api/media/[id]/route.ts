import { NextResponse } from "next/server";
import { currentSession } from "@/lib/session";
import { loadMedia } from "@/lib/media-store";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Sign in to access this media." }, { status: 401 });
  const { id } = await context.params;
  const media = await loadMedia(id);
  if (!media) return NextResponse.json({ error: "Media not found." }, { status: 404 });
  return new NextResponse(media.bytes, { headers: { "Content-Type": media.mimeType, "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-AI-Generated": "true" } });
}
