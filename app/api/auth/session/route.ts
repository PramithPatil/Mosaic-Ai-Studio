import { NextResponse } from "next/server";
import { configuredLogin } from "@/lib/auth";
import { currentSession } from "@/lib/session";

export async function GET() {
  const session = await currentSession();
  const guardConfigured = Boolean(process.env.LITELLM_BASE_URL && process.env.LITELLM_API_KEY && process.env.LITELLM_GUARD_MODEL);
  return NextResponse.json({ authenticated: Boolean(session), configured: Boolean(configuredLogin()), guardConfigured, ...(session ? { email: session.email, workspaceId: session.workspaceId } : {}) });
}
