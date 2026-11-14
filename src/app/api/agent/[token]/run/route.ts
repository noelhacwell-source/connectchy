import { findByToken, noStore, runCommand } from "@/lib/bridge";

export const dynamic = "force-dynamic";

/**
 * GET twin of /command for AI tools that can only fetch URLs.
 *   ?type=get_tree&payload=<url-encoded JSON>   or   &b64=<base64url JSON>
 *   &nonce=<unique> makes a retried request return the first result instead of running twice.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const conn = await findByToken(token);
  if (!conn) return Response.json({ ok: false, error: "Connection not found." }, { status: 404, headers: noStore });

  const q = new URL(req.url).searchParams;
  let payload: unknown = {};
  try {
    const b64 = q.get("b64");
    const raw = b64 ? Buffer.from(b64, "base64url").toString("utf8") : q.get("payload");
    if (raw) payload = JSON.parse(raw);
  } catch {
    return Response.json(
      { ok: false, error: "Could not parse the payload. Send URL-encoded JSON in 'payload' or base64url JSON in 'b64'." },
      { status: 400, headers: noStore },
    );
  }

  const { status, body } = await runCommand(conn, {
    type: q.get("type") ?? undefined,
    agent: q.get("agent") ?? undefined,
    room: q.get("room") ?? undefined,
    payload,
    nonce: q.get("nonce") ?? undefined,
    wait: q.get("wait") ?? undefined,
    timeoutMs: q.get("timeoutMs") ?? undefined,
  });
  return Response.json(body, { status, headers: noStore });
}
