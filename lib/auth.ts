import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_SECONDS = 60 * 60 * 12;
export type Session = { email: string; workspaceId: string; expiresAt: number };

function sessionSecret() {
  const secret = process.env.STUDIO_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("STUDIO_SESSION_SECRET must contain at least 32 characters.");
  return secret;
}

function signature(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function equal(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function configuredLogin() {
  const email = process.env.STUDIO_LOGIN_EMAIL?.trim().toLowerCase();
  const password = process.env.STUDIO_LOGIN_PASSWORD;
  const workspaceId = process.env.STUDIO_WORKSPACE_ID?.trim() || "northstar";
  if (!email || !password || !process.env.STUDIO_SESSION_SECRET || process.env.STUDIO_SESSION_SECRET.length < 32) return null;
  return { email, password, workspaceId };
}

export function verifyCredentials(email: string, password: string) {
  const configured = configuredLogin();
  if (!configured) return null;
  const validEmail = equal(email.trim().toLowerCase(), configured.email);
  const validPassword = equal(password, configured.password);
  return validEmail && validPassword ? { email: configured.email, workspaceId: configured.workspaceId } : null;
}

export function createSessionToken(email: string, workspaceId: string) {
  const payload = Buffer.from(JSON.stringify({ email, workspaceId, expiresAt: Date.now() + SESSION_SECONDS * 1000 })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function readSessionToken(token?: string): Session | null {
  if (!token) return null;
  const [payload, suppliedSignature, ...extra] = token.split(".");
  if (!payload || !suppliedSignature || extra.length) return null;
  try {
    if (!equal(signature(payload), suppliedSignature)) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    if (typeof session.email !== "string" || typeof session.workspaceId !== "string" || typeof session.expiresAt !== "number" || session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function createSessionCookie(token: string) {
  return { name: "mosaic_session", value: token, httpOnly: true, sameSite: "strict" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_SECONDS };
}

export function clearSessionCookie() {
  return { name: "mosaic_session", value: "", httpOnly: true, sameSite: "strict" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 };
}
