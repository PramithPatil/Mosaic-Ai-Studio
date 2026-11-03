import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/session";
import { listPrompts, savePrompt } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  if (!await currentSession()) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  return NextResponse.json({ prompts: await listPrompts() });
}

export async function POST(request: NextRequest) {
  if (!await currentSession()) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  let body: { id?: string; title?: string; content?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!title || title.length > 80 || !content || content.length > 4_000 || (body.id !== undefined && typeof body.id !== "string")) return NextResponse.json({ error: "Enter a title (max 80 characters) and prompt (max 4,000 characters)." }, { status: 400 });
  const prompt = await savePrompt({ id: body.id, title, content });
  return NextResponse.json({ prompt }, { status: body.id ? 200 : 201 });
}
