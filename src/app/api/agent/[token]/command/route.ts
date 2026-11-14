import { findByToken, noStore, runCommand, type RunInput } from "@/lib/bridge";
import { apiError, ownerRequest } from "@/lib/http-utils";

export const dynamic = "force-dynamic";

/** POST { type, payload, nonce?, wait?, timeoutMs? } -> runs one command in Studio. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const conn = await findByToken(token);
  if (!conn) return Response.json({ ok: false, error: "Connection not found." }, { status: 404, headers: noStore });

  let input: RunInput;
  try {
    input = (await req.json()) as RunInput;
  } catch {
    return Response.json(
      { ok: false, error: 'Body must be JSON like {"type":"get_tree","payload":{}}.' },
      { status: 400, headers: noStore },
    );
  }
  if (!input || typeof input !== "object") {
    return Response.json({ ok: false, error: "Body must be a JSON object." }, { status: 400, headers: noStore });
  }

  if (input.source === "dashboard") {
    try { ownerRequest(req); } catch(e) { return apiError(e); }
  }
  const { status, body } = await runCommand(conn, { ...input, agent: input.agent ?? req.headers.get("x-agent-name") });
  return Response.json(body, { status, headers: noStore });
}
