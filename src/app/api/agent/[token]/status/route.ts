import { findByToken, noStore, publicConnection } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const conn = await findByToken(token);
  if (!conn) return Response.json({ ok: false, error: "Connection not found." }, { status: 404, headers: noStore });
  return Response.json({ ok: true, ...publicConnection(conn) }, { headers: noStore });
}
