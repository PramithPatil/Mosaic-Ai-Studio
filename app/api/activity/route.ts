import { NextResponse } from "next/server";
import { currentSession } from "@/lib/session";
import { deleteActivity, listActivity, renameActivity } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  return NextResponse.json({ activity: await listActivity(session.email) });
}

export async function PATCH(request: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  let body: { id?: unknown; title?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!id || !title || title.length > 80) return NextResponse.json({ error: "Enter a title between 1 and 80 characters." }, { status: 400 });
  const updated = await renameActivity(session.email, id, title);
  if (!updated) return NextResponse.json({ error: "Activity was not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Activity id is required." }, { status: 400 });
  const deleted = await deleteActivity(session.email, id);
  if (!deleted) return NextResponse.json({ error: "Activity was not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
