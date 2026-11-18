import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { commands, connections } from "@/db/schema";
import { PENDING_TTL_MS, SENT_TTL_MS, findByPluginKey, noStore } from "@/lib/bridge";

export const dynamic = "force-dynamic";

const LONG_POLL_MS = 8_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : null);

type PollBody = {
  client?: unknown;
  version?: unknown;
  noWait?: unknown;
  place?: { name?: unknown; placeId?: unknown };
  results?: Array<{ id?: unknown; ok?: unknown; json?: unknown; error?: unknown }>;
};

/**
 * The Studio plugin calls this in a loop. Each call delivers the results of the
 * commands it just ran, then waits (long-poll) for the next commands.
 */
export async function POST(req: Request) {
  const conn = await findByPluginKey(req.headers.get("x-plugin-key"));
  if (!conn) return Response.json({ error: "Unknown plugin key" }, { status: 401, headers: noStore });

  let body: PollBody = {};
  try {
    body = (await req.json()) as PollBody;
  } catch {
    // An empty body is a valid heartbeat.
  }
  if ((conn.features.mode === "vscode") !== (body.client === "vscode")) return Response.json({error:"Wrong client for this workspace mode."},{status:403,headers:noStore});

  for (const entry of Array.isArray(body.results) ? body.results : []) {
    const id = Number(entry?.id);
    if (!Number.isInteger(id)) continue;
    let ok = entry.ok === true;
    let result: unknown = null;
    let error = text(entry.error, 20_000);
    if (ok) {
      try {
        result = (JSON.parse(String(entry.json)) as { value?: unknown }).value ?? null;
      } catch {
        ok = false;
        error = "The plugin sent a result that could not be read.";
      }
    }
    await db
      .update(commands)
      .set({
        status: ok ? "done" : "error",
        result,
        error: ok ? null : (error ?? "Unknown error in Studio"),
        completedAt: new Date(),
      })
      .where(and(eq(commands.id, id), eq(commands.connectionId, conn.id), eq(commands.status, "sent")));
  }

  await db
    .update(connections)
    .set({
      lastSeenAt: new Date(),
      placeName: text(body.place?.name, 200) ?? conn.placeName,
      placeId: text(body.place?.placeId, 40) ?? conn.placeId,
      pluginVersion: text(body.version, 20) ?? conn.pluginVersion,
    })
    .where(eq(connections.id, conn.id));

  if (body.noWait === true) return Response.json({ commands: [] }, { headers: noStore });

  // Never deliver a stale backlog when Studio comes back after being offline.
  const now = Date.now();
  await db
    .update(commands)
    .set({ status: "error", error: "Expired: Studio was offline for too long.", completedAt: new Date() })
    .where(
      and(
        eq(commands.connectionId, conn.id),
        eq(commands.status, "pending"),
        lt(commands.createdAt, new Date(now - PENDING_TTL_MS)),
      ),
    );
  await db
    .update(commands)
    .set({ status: "error", error: "Lost: Studio stopped before finishing this command.", completedAt: new Date() })
    .where(
      and(
        eq(commands.connectionId, conn.id),
        eq(commands.status, "sent"),
        lt(commands.sentAt, new Date(now - SENT_TTL_MS)),
      ),
    );

  const deadline = now + LONG_POLL_MS;
  for (;;) {
    const [control] = await db.select({paused:connections.paused}).from(connections).where(eq(connections.id,conn.id));
    if(control?.paused){await sleep(1000);return Response.json({commands:[],paused:true},{headers:noStore});}
    // Claiming is a single UPDATE, so two Studio windows can never receive the same command.
    const claimed = await db
      .update(commands)
      .set({ status: "sent", sentAt: new Date() })
      .where(and(eq(commands.connectionId, conn.id), eq(commands.status, "pending"), sql`exists(select 1 from connections where id=${conn.id} and paused=0)`,sql`(${commands.source}='dashboard' or not exists(select 1 from project_rooms r cross join lateral jsonb_array_elements(r.team->'participants') p where r.id=(select active_room_id from connections where id=${conn.id}) and p->>'control' in ('paused','stopped','removed') and (${commands.agent} is null or lower(p->>'agent')=lower(${commands.agent}))))`))
      .returning({ id: commands.id, type: commands.type, payload: commands.payload, agent: commands.agent });

    if (claimed.length > 0 || Date.now() >= deadline || req.signal.aborted) {
      claimed.sort((a, b) => a.id - b.id);
      return Response.json({ commands: claimed }, { headers: noStore });
    }
    await sleep(300);
  }
}
