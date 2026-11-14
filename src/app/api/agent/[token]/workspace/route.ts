import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  workspaceEntries,
  commands,
  roomMessages,
  agentPresence,
  uploads,
} from "@/db/schema";
import { project, type Context } from "@/lib/project-api";
import { ApiError, apiError, jsonBody, ownerRequest } from "@/lib/http-utils";
import { modules, type ModuleId } from "@/lib/modules";
import { ensureActiveRoom, requestRoom } from "@/lib/project-rooms";
import { runCommand } from "@/lib/bridge";
const kinds = {
  task: "taskBoard",
  note: "notes",
  decision: "decisions",
  bookmark: "bookmarks",
  handoff: "handoffs",
  checkpoint: "checkpoints",
  check: "checks",
} as const;
function requireModule(
  settings: { modules?: Parameters<typeof modules>[0] },
  id: ModuleId,
) {
  if (!modules(settings.modules)[id])
    throw new ApiError(403, `${id} is disabled.`);
}
export const dynamic = "force-dynamic";
export async function GET(req: Request, ctx: Context) {
  try {
    const { conn, settings } = await project(ctx);
    const q = new URL(req.url).searchParams;
    const kind = q.get("kind") ?? "task";
    if (kind === "overview") {
      requireModule(settings, "insights");
      const [commandCounts] = await db
        .select({
          total: sql<number>`count(*)::int`,
          errors: sql<number>`count(*) filter(where ${commands.status}='error')::int`,
          reviews: sql<number>`count(*) filter(where ${commands.status}='review')::int`,
        })
        .from(commands)
        .where(eq(commands.connectionId, conn.id));
      const [taskCounts] = await db
        .select({
          total: sql<number>`count(*)::int`,
          done: sql<number>`count(*) filter(where ${workspaceEntries.status}='done')::int`,
        })
        .from(workspaceEntries)
        .where(
          and(
            eq(workspaceEntries.connectionId, conn.id),
            eq(workspaceEntries.kind, "task"),
            isNull(workspaceEntries.archivedAt),
          ),
        );
      const [chat] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(roomMessages)
        .where(eq(roomMessages.connectionId, conn.id));
      return Response.json({
        commands: commandCounts,
        tasks: taskCounts,
        messages: chat.total,
        paused: !!conn.paused,
      });
    }
    if (kind === "assets") {
      requireModule(settings, "assetLibrary");
      const rows = await db
        .select()
        .from(uploads)
        .where(eq(uploads.connectionId, conn.id))
        .orderBy(desc(uploads.id))
        .limit(200);
      return Response.json(
        { assets: rows.filter((r) => r.state === "done") },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (kind === "presence") {
      requireModule(settings, "agentPresence");
      const room = await requestRoom(req, conn.id);
      return Response.json({
        agents: await db
          .select()
          .from(agentPresence)
          .where(
            and(
              eq(agentPresence.connectionId, conn.id),
              eq(agentPresence.roomId, room.id),
            ),
          ),
        team: room.team,
      });
    }
    if (!(kind in kinds))
      throw new ApiError(400, "Unknown workspace collection.");
    requireModule(settings, kinds[kind as keyof typeof kinds]);
    const id = q.get("id"),
      room = q.get("room");
    const entries = await db
      .select()
      .from(workspaceEntries)
      .where(
        and(
          eq(workspaceEntries.connectionId, conn.id),
          eq(workspaceEntries.kind, kind),
          isNull(workspaceEntries.archivedAt),
          id ? eq(workspaceEntries.id, Number(id)) : undefined,
          room ? eq(workspaceEntries.roomId, Number(room)) : undefined,
        ),
      )
      .orderBy(desc(workspaceEntries.id))
      .limit(300);
    return Response.json(
      { entries },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
const entryInput = z.object({
  kind: z.enum(["task", "note", "decision", "bookmark"]),
  title: z.string().trim().min(1).max(160),
  body: z.string().max(50000).default(""),
  owner: z.string().max(40).default(""),
  status: z
    .enum(["backlog", "doing", "blocked", "review", "done"])
    .default("backlog"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  data: z
    .object({
      dependencies: z.array(z.number().int().positive()).max(30).default([]),
      url: z.string().max(2000).optional(),
      tags: z.array(z.string().max(40)).max(15).default([]),
      due: z.string().max(40).optional(),
    })
    .default({ dependencies: [], tags: [] }),
});
export async function POST(req: Request, ctx: Context) {
  try {
    const { conn, settings } = await project(ctx),
      body = await jsonBody(req, 250000);
    const action = body.action;
    if(action!=="heartbeat")await guardAgentRequest(req,conn,body.agent);
    if(conn.paused&&action!=="heartbeat"){try{ownerRequest(req);}catch{throw new ApiError(423,"Project stopped. Agents must wait for resume.");}}
    if (action === "heartbeat") {
      requireModule(settings, "agentPresence");
      const p = z
        .object({
          agent: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,39}$/),
          task: z.string().max(300).default(""),
        })
        .safeParse(body);
      if (!p.success)
        throw new ApiError(400, "Provide an agent name and optional task.");
      const room = await requestRoom(req, conn.id);
      await db
        .insert(agentPresence)
        .values({
          connectionId: conn.id,
          roomId: room.id,
          agent: p.data.agent,
          task: p.data.task,
        })
        .onConflictDoUpdate({
          target: [agentPresence.roomId, agentPresence.agent],
          set: { lastSeenAt: new Date(), task: p.data.task },
        });
      return Response.json({ ok: true });
    }
    if (action === "handoff") {
      requireModule(settings, "handoffs");
      const room = await requestRoom(req, conn.id),
        [tasks, messages, decisions] = await Promise.all([
          db
            .select()
            .from(workspaceEntries)
            .where(
              and(
                eq(workspaceEntries.connectionId, conn.id),
                eq(workspaceEntries.roomId, room.id),
                eq(workspaceEntries.kind, "task"),
                isNull(workspaceEntries.archivedAt),
              ),
            ),
          db
            .select()
            .from(roomMessages)
            .where(eq(roomMessages.roomId, room.id))
            .orderBy(desc(roomMessages.id))
            .limit(50),
          db
            .select()
            .from(workspaceEntries)
            .where(
              and(
                eq(workspaceEntries.connectionId, conn.id),
                eq(workspaceEntries.kind, "decision"),
                isNull(workspaceEntries.archivedAt),
              ),
            )
            .limit(30),
        ]);
      const title =
        typeof body.title === "string"
          ? body.title.slice(0, 160)
          : `${room.name} handoff`;
      const text = `# ${title}\n\nRoom: ${room.name}\nPhase: ${room.team.phase}\n\n## Roles\n${room.team.participants.map((p) => `- ${p.agent}: ${p.role} (${p.done ? "done" : p.ready ? "ready" : "planning"}) — ${p.paths.join(", ")}`).join("\n")}\n\n## Tasks\n${tasks.map((t) => `- [${t.status}] ${t.title} — ${t.owner || "unassigned"}`).join("\n")}\n\n## Decisions\n${decisions.map((d) => `- ${d.title}: ${d.body}`).join("\n")}\n\n## Recent conversation\n${messages
        .reverse()
        .map((m) => `${m.agent}: ${m.text}`)
        .join("\n\n")}`;
      const [entry] = await db
        .insert(workspaceEntries)
        .values({
          connectionId: conn.id,
          roomId: room.id,
          kind: "handoff",
          title,
          body: text,
          status: "done",
        })
        .returning();
      return Response.json({ ok: true, entry });
    }
    if (action === "checkpoint" || action === "restore" || action === "check") {
      ownerRequest(req);
      requireModule(settings, action === "check" ? "checks" : "checkpoints");
      const room = await ensureActiveRoom(conn.id);
      if (action === "restore") {
        const [entry] = await db
          .select()
          .from(workspaceEntries)
          .where(
            and(
              eq(workspaceEntries.id, Number(body.id)),
              eq(workspaceEntries.connectionId, conn.id),
              eq(workspaceEntries.kind, "checkpoint"),
              isNull(workspaceEntries.archivedAt),
            ),
          );
        if (!entry) throw new ApiError(404, "Checkpoint not found.");
        const scripts = entry.data.scripts as {
          path: string;
          source: string;
        }[];
        if (!Array.isArray(scripts) || !scripts.length)
          throw new ApiError(400, "Checkpoint has no scripts.");
        // Preflight every path before changing any source. Deleted scripts must be recreated manually.
        for (const script of scripts) {
          const r = await runCommand(conn, {
            type: "get_source",
            payload: { path: script.path },
            source: "dashboard",
            timeoutMs: 10000,
          });
          if (!(r.body as { ok?: boolean }).ok)
            throw new ApiError(
              409,
              `Cannot restore missing/unreadable script ${script.path}. No restore was queued.`,
            );
        }
        const result = await runCommand(conn, {
          type: "batch",
          payload: {
            commands: scripts.map((s) => ({ type: "set_source", payload: s })),
            stopOnError: true,
          },
          source: "dashboard",
          timeoutMs: 25000,
          nonce: `restore-${entry.id}-${crypto.randomUUID()}`,
        });
        return Response.json(result.body, { status: result.status });
      }
      const parsed = z
        .array(z.string().trim().min(1).max(300))
        .min(1)
        .max(20)
        .safeParse(body.paths);
      if (!parsed.success)
        throw new ApiError(400, "Provide 1–20 exact instance/script paths.");
      const results = [];
      for (const path of [...new Set(parsed.data)]) {
        const r = await runCommand(conn, {
          type: action === "check" ? "get_instance" : "get_source",
          payload: { path },
          source: "dashboard",
          timeoutMs: 10000,
        });
        const result = r.body as {
          ok?: boolean;
          result?: { source?: string };
          error?: string;
        };
        if (
          action === "checkpoint" &&
          (!result.ok || typeof result.result?.source !== "string")
        )
          throw new ApiError(
            409,
            `Cannot capture ${path}: ${result.error ?? "not a readable script"}`,
          );
        results.push({
          path,
          ok: !!result.ok,
          result: result.result,
          error: result.error,
        });
      }
      const scripts = results.map((r) => ({
        path: r.path,
        source: r.result?.source ?? "",
      }));
      if (Buffer.byteLength(JSON.stringify(scripts)) > 800000)
        throw new ApiError(413, "Checkpoint too large. Select fewer scripts.");
      const title =
        typeof body.title === "string" && body.title.trim()
          ? body.title.slice(0, 160)
          : action === "check"
            ? "Instance checks"
            : "Script checkpoint";
      const [entry] = await db
        .insert(workspaceEntries)
        .values({
          connectionId: conn.id,
          roomId: room.id,
          kind: action === "check" ? "check" : "checkpoint",
          title,
          body:
            action === "check"
              ? results
                  .map(
                    (r) =>
                      `${r.ok ? "PASS" : "FAIL"} ${r.path}${r.error ? " — " + r.error : ""}`,
                  )
                  .join("\n")
              : scripts.map((s) => s.path).join("\n"),
          status: "done",
          data:
            action === "check"
              ? { results, passed: results.every((r) => r.ok) }
              : { scripts },
        })
        .returning();
      return Response.json({ ok: true, entry });
    }
    if (action === "delete") {
      ownerRequest(req);
      const [entry] = await db
        .select()
        .from(workspaceEntries)
        .where(
          and(
            eq(workspaceEntries.connectionId, conn.id),
            eq(workspaceEntries.id, Number(body.id)),
          ),
        );
      if (!entry) throw new ApiError(404, "Item not found.");
      if (!(entry.kind in kinds)) throw new ApiError(400, "Unknown item kind.");
      requireModule(settings, kinds[entry.kind as keyof typeof kinds]);
      await db
        .update(workspaceEntries)
        .set({ archivedAt: new Date() })
        .where(eq(workspaceEntries.id, entry.id));
      return Response.json({ ok: true });
    }
    if (action !== "create" && action !== "update")
      throw new ApiError(400, "Unknown workspace action.");
    const parsed = entryInput.safeParse(body.entry);
    if (!parsed.success)
      throw new ApiError(
        400,
        parsed.error.issues.map((i) => i.message).join("; "),
      );
    const value = parsed.data;
    requireModule(settings, kinds[value.kind]);
    if (value.data.url && !/^https?:\/\//i.test(value.data.url))
      throw new ApiError(400, "Bookmark URLs must use HTTP(S).");
    if (value.data.due && !Number.isFinite(Date.parse(value.data.due)))
      throw new ApiError(400, "Invalid due date.");
    const room = await requestRoom(req, conn.id);
    const entry = await db.transaction(async (tx) => {
      // Serialize board updates so dependency/cycle checks cannot race.
      await tx.execute(sql`select pg_advisory_xact_lock(${conn.id})`);
      let existing: typeof workspaceEntries.$inferSelect | undefined;
      if (action === "update") {
        [existing] = await tx
          .select()
          .from(workspaceEntries)
          .where(
            and(
              eq(workspaceEntries.connectionId, conn.id),
              eq(workspaceEntries.id, Number(body.id)),
              isNull(workspaceEntries.archivedAt),
            ),
          )
          .for("update");
        if (!existing || existing.kind !== value.kind)
          throw new ApiError(404, "Item not found.");
        if (existing.revision !== body.revision)
          throw new ApiError(
            409,
            "This item changed. Reload before saving your edits.",
          );
      }
      if (value.kind === "task") {
        const tasks = await tx
          .select()
          .from(workspaceEntries)
          .where(
            and(
              eq(workspaceEntries.connectionId, conn.id),
              eq(workspaceEntries.kind, "task"),
              isNull(workspaceEntries.archivedAt),
            ),
          );
        for (const dep of value.data.dependencies) {
          if (dep === existing?.id)
            throw new ApiError(409, "A task cannot depend on itself.");
          const task = tasks.find((t) => t.id === dep);
          if (!task)
            throw new ApiError(400, `Dependency ${dep} is not a project task.`);
          if (
            ["doing", "done"].includes(value.status) &&
            task.status !== "done"
          )
            throw new ApiError(
              409,
              "Complete dependencies before starting or completing this task.",
            );
        }
        const seen = new Set<number>();
        const visits = (id: number): boolean => {
          if (id === existing?.id) return true;
          if (seen.has(id)) return false;
          seen.add(id);
          return (
            (tasks.find((t) => t.id === id)?.data.dependencies ??
              []) as number[]
          ).some(visits);
        };
        if (existing && value.data.dependencies.some(visits))
          throw new ApiError(409, "Task dependencies would form a cycle.");
      }
      if (existing) {
        const [row] = await tx
          .update(workspaceEntries)
          .set({
            ...value,
            revision: existing.revision + 1,
            updatedAt: new Date(),
          })
          .where(eq(workspaceEntries.id, existing.id))
          .returning();
        return row;
      }
      const [row] = await tx
        .insert(workspaceEntries)
        .values({ ...value, connectionId: conn.id, roomId: room.id })
        .returning();
      return row;
    });
    return Response.json({ ok: true, entry });
  } catch (e) {
    return apiError(e);
  }
}
import { guardAgentRequest } from "@/lib/room-coordination";
