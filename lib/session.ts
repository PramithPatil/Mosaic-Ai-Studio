import { cookies } from "next/headers";
import { configuredLogin, readSessionToken } from "@/lib/auth";

export async function currentSession() {
  const jar = await cookies();
  const session = readSessionToken(jar.get("mosaic_session")?.value);
  const configured = configuredLogin();
  if (!session || !configured || session.email !== configured.email || session.workspaceId !== configured.workspaceId) return null;
  return session;
}
