import { NextRequest, NextResponse } from "next/server";
import { configuredLogin, createSessionCookie, createSessionToken, verifyCredentials } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!configuredLogin()) return NextResponse.json({ error: "Sign-in is not configured. Set STUDIO_LOGIN_EMAIL, STUDIO_LOGIN_PASSWORD, and a 32-character STUDIO_SESSION_SECRET in .env.local." }, { status: 503 });
  let body: { email?: string; password?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Enter your email and password." }, { status: 400 }); }
  if (typeof body.email !== "string" || typeof body.password !== "string" || body.email.length > 254 || body.password.length > 256) return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
  const account = verifyCredentials(body.email, body.password);
  if (!account) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  const response = NextResponse.json({ email: account.email, workspaceId: account.workspaceId });
  response.cookies.set(createSessionCookie(createSessionToken(account.email, account.workspaceId)));
  return response;
}
