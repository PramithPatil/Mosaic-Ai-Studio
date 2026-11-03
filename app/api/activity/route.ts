import { NextResponse } from "next/server";
import { currentSession } from "@/lib/session";
import { listActivity } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  return NextResponse.json({ activity: await listActivity(session.email) });
}
