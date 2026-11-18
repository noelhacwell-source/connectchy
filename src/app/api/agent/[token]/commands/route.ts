import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { commands } from "@/db/schema";
import { commandView, findByToken, noStore } from "@/lib/bridge";

export const dynamic = "force-dynamic";

const preview = (value: unknown, max = 400) => {
  if (value === null || value === undefined) return null;
  const s = JSON.stringify(value);
  return s.length > max ? s.slice(0, max) + "..." : s;
};

/** GET ?id=12 -> one command in full. GET ?limit=60 -> recent history with short previews. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const conn = await findByToken(token);
  if (!conn) return Response.json({ ok: false, error: "Connection not found." }, { status: 404, headers: noStore });

  const visible = sql`not exists (select 1 from workspace_entries e where e.connection_id = ${commands.connectionId} and e.kind = 'hidden_activity' and e.title = ${commands.id}::text)`;
  const q = new URL(req.url).searchParams;
  const id = Number(q.get("id"));
  if (q.get("id")) {
    if (!Number.isInteger(id)) return Response.json({ ok: false, error: "Bad id." }, { status: 400, headers: noStore });
    const [row] = await db
      .select()
      .from(commands)
      .where(and(eq(commands.id, id), eq(commands.connectionId, conn.id)))
      .limit(1);
    if (!row) return Response.json({ ok: false, error: "Command not found." }, { status: 404, headers: noStore });
    return Response.json({ ...commandView(row), payload: row.payload }, { headers: noStore });
  }

  const limit = Math.min(Math.max(Number(q.get("limit")) || 60, 1), 200);
  const rows = await db
    .select()
    .from(commands)
    .where(and(eq(commands.connectionId, conn.id),visible))
    .orderBy(desc(commands.id))
    .limit(limit);

  return Response.json(
    {
      ok: true,
      commands: rows.map((row) => {
        const { result, ...view } = commandView(row);
        return { ...view, payloadPreview: preview(row.payload), resultPreview: preview(result) };
      }),
    },
    { headers: noStore },
  );
}
