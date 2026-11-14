import { publicOrigin } from "@/lib/public-origin";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { connections } from "@/db/schema";
import { cleanOrigin, findByToken, isOnline, noStore, originFromRequest } from "@/lib/bridge";
import { buildAgentDocs } from "@/lib/command-docs";
import { featureDocs } from "@/lib/feature-docs";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string }> };

/** The link you hand to an AI: plain-text instructions for driving this Studio session. */
export async function GET(req: Request, { params }: Ctx) {
  const { token } = await params;
  const conn = await findByToken(token);
  if (!conn) {
    return new Response("Unknown Connectchy connection. Ask the user for a current link.\n", {
      status: 404,
      headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  // Prefer the address the owner's browser really uses; proxy headers are only a fallback.
  const base = `${publicOrigin() ?? conn.origin ?? originFromRequest(req)}/api/agent/${token}`;
  return new Response(buildAgentDocs(base, conn.name, isOnline(conn), conn.placeName) + featureDocs(base, conn), {
    headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" },
  });
}

/** PATCH { origin } - the dashboard reports the public address it is reached at. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { token } = await params;
  const conn = await findByToken(token);
  if (!conn) return Response.json({ ok: false, error: "Connection not found." }, { status: 404 });
  let body: { origin?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // Handled by the validation below.
  }
  const origin = publicOrigin() ?? cleanOrigin(body.origin);
  if (!origin) return Response.json({ ok: false, error: "Invalid origin." }, { status: 400 });
  await db.update(connections).set({ origin }).where(eq(connections.id, conn.id));
  return Response.json({ ok: true }, { headers: noStore });
}

/** Delete the connection and its history. The plugin file for it stops working. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { token } = await params;
  const conn = await findByToken(token);
  if (!conn) return Response.json({ ok: false, error: "Connection not found." }, { status: 404 });
  await db.delete(connections).where(eq(connections.id, conn.id));
  return Response.json({ ok: true }, { headers: noStore });
}
