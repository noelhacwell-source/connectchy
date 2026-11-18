import { and, desc, eq, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  commands,
  connections,
  projectRooms,
  roomMessages,
  studioTopics,
  studioVideos,
  uploads,
  workspaceEntries,
} from "@/db/schema";
import { project, type Context } from "@/lib/project-api";
import { requestRoom } from "@/lib/project-rooms";
import { apiError, ApiError, jsonBody } from "@/lib/http-utils";
import { studioActor } from "@/lib/studio-access";
import { RECORD_COLLECTIONS } from "@/lib/record-collections";
import { modules } from "@/lib/modules";
import { WORKBENCH } from "@/lib/workbench-model";
import { purgeRooms } from "@/lib/delete-rooms";
import { detachEntryLinks } from "@/lib/entry-links";

async function access(req: Request, ctx: Context, write: boolean) {
  const { conn, settings } = await project(ctx);
  const params = new URL(req.url).searchParams;
  const kind = params.get("kind") ?? "";
  const collection = Object.hasOwn(RECORD_COLLECTIONS, kind)
    ? RECORD_COLLECTIONS[kind]
    : null;
  if (!collection) throw new ApiError(400, "Choose a record collection.");
  if (collection.feature && !modules(settings.modules)[collection.feature])
    throw new ApiError(403, "This collection is disabled.");
  if (
    ["message", "video", "survey", "question", "private"].includes(kind) &&
    !settings.room
  )
    throw new ApiError(403, "Communication is disabled.");
  const actor = await studioActor(req, conn, write);
  if (
    write &&
    actor.id &&
    kind.startsWith("workbench:") &&
    WORKBENCH[kind.slice(10)]?.ownerOnly
  )
    throw new ApiError(403, "Only the owner can delete project controls.");
  const room =
    collection.scope === "room" ? await requestRoom(req, conn.id) : null;
  return { conn, params, collection, kind, actor, room };
}

type Access = Awaited<ReturnType<typeof access>>;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function records(
  a: Access,
  tx: Pick<Transaction, "select"> = db,
  range?: (id: AnyPgColumn<{ data: number }>) => SQL | undefined,
) {
  const { conn, kind, room, actor } = a;
  if (kind === "room") {
    return tx
      .select({
        id: projectRooms.id,
        title: projectRooms.name,
        author: sql<string>`''`,
        detail: sql<string>`''`,
        state: sql<string>`case when ${projectRooms.deletedAt} is null then 'Open' else 'Archived' end`,
        date: projectRooms.createdAt,
      })
      .from(projectRooms)
      .where(
        and(eq(projectRooms.connectionId, conn.id), range?.(projectRooms.id)),
      )
      .orderBy(desc(projectRooms.id))
      .$dynamic();
  }
  if (kind === "video" || kind === "message") {
    const base = tx
      .select({
        id: roomMessages.id,
        mime: sql<string>`${roomMessages.meta}->'video'->>'mime'`,
        title:
          kind === "video"
            ? sql<string>`${roomMessages.meta}->'video'->>'name'`
            : sql<string>`left(${roomMessages.text}, 180)`,
        detail:
          kind === "video"
            ? sql<string>`coalesce(${roomMessages.meta}->'video'->>'caption', '')`
            : sql<string>`left(${roomMessages.text}, 400)`,
        author: roomMessages.agent,
        state:
          kind === "video"
            ? projectRooms.name
            : sql<string>`case when ${roomMessages.deletedAt} is null then 'Visible' else 'Trash' end`,
        date: roomMessages.createdAt,
        roomId: roomMessages.roomId,
      })
      .from(roomMessages)
      .innerJoin(projectRooms, eq(projectRooms.id, roomMessages.roomId));
    const query =
      kind === "video"
        ? base.innerJoin(
            studioVideos,
            eq(studioVideos.messageId, roomMessages.id),
          )
        : base;
    return query
      .where(
        and(
          eq(roomMessages.connectionId, conn.id),
          kind === "video"
            ? and(
                isNull(projectRooms.deletedAt),
                isNull(roomMessages.deletedAt),
              )
            : eq(roomMessages.roomId, room!.id),
          range?.(roomMessages.id),
        ),
      )
      .orderBy(desc(roomMessages.id))
      .$dynamic();
  }
  if (["survey", "question", "private"].includes(kind)) {
    return tx
      .select({
        id: studioTopics.id,
        title: studioTopics.title,
        author: studioTopics.author,
        detail: sql<string>`coalesce(left(${studioTopics.content}->>'description', 400), '')`,
        state: sql<string>`case when (${studioTopics.content}->>'closed')::boolean then 'Closed' else 'Open' end`,
        date: studioTopics.updatedAt,
      })
      .from(studioTopics)
      .where(
        and(
          eq(studioTopics.roomId, room!.id),
          eq(studioTopics.kind, kind),
          kind === "private" && actor.id
            ? sql`${studioTopics.members} @> ${JSON.stringify([actor.id])}::jsonb`
            : undefined,
          range?.(studioTopics.id),
        ),
      )
      .orderBy(desc(studioTopics.id))
      .$dynamic();
  }
  if (kind === "asset") {
    return tx
      .select({
        id: uploads.id,
        title: uploads.filename,
        detail: uploads.assetType,
        author: sql<string>`''`,
        state: uploads.state,
        date: uploads.createdAt,
      })
      .from(uploads)
      .where(
        and(
          eq(uploads.connectionId, conn.id),
          eq(uploads.state, "done"),
          range?.(uploads.id),
        ),
      )
      .orderBy(desc(uploads.id))
      .$dynamic();
  }
  if (kind === "activity" || kind === "review") {
    return tx
      .select({
        id: commands.id,
        title: commands.type,
        detail: sql<string>`coalesce(left(${commands.error}, 400), '')`,
        author: sql<string>`coalesce(${commands.agent}, ${commands.source})`,
        state: commands.status,
        date: commands.createdAt,
      })
      .from(commands)
      .where(
        and(
          eq(commands.connectionId, conn.id),
          inArray(
            commands.status,
            kind === "activity" ? ["done", "error"] : ["review"],
          ),
          sql`not exists (select 1 from workspace_entries e where e.connection_id = ${conn.id} and e.kind = 'hidden_activity' and e.title = ${commands.id}::text)`,
          range?.(commands.id),
        ),
      )
      .orderBy(desc(commands.id))
      .$dynamic();
  }
  return tx
    .select({
      id: workspaceEntries.id,
      title: workspaceEntries.title,
      author: workspaceEntries.owner,
      detail: sql<string>`left(${workspaceEntries.body}, 400)`,
      state: sql<string>`case when ${workspaceEntries.archivedAt} is not null then 'Archived' else ${workspaceEntries.status} end`,
      date: workspaceEntries.createdAt,
      revision: workspaceEntries.revision,
    })
    .from(workspaceEntries)
    .where(
      and(
        eq(workspaceEntries.connectionId, conn.id),
        eq(workspaceEntries.kind, kind),
        room ? eq(workspaceEntries.roomId, room.id) : undefined,
        range?.(workspaceEntries.id),
      ),
    )
    .orderBy(desc(workspaceEntries.id))
    .$dynamic();
}

export async function GET(req: Request, ctx: Context) {
  try {
    const a = await access(req, ctx, false);
    const before = Number(a.params.get("before"));
    const rows = await records(a, db, (id) =>
      Number.isSafeInteger(before) && before > 0 ? lt(id, before) : undefined,
    ).limit(101);
    return Response.json(
      {
        records: rows.slice(0, 100),
        next: rows.length > 100 ? rows[99].id : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}

const selection = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("all") }),
  z.object({
    mode: z.literal("selected"),
    ids: z.array(z.number().int().positive()).min(1).max(3000),
  }),
]);

export async function DELETE(req: Request, ctx: Context) {
  try {
    const a = await access(req, ctx, true);
    const parsed = selection.safeParse(await jsonBody(req, 90000));
    if (!parsed.success)
      throw new ApiError(
        400,
        "Choose all records or provide the IDs to delete.",
      );
    const input = parsed.data;
    const count = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${a.conn.id})`);
      if (a.kind === "room") {
        const [connection] = await tx
          .select({ activeId: connections.activeRoomId })
          .from(connections)
          .where(eq(connections.id, a.conn.id))
          .for("update");
        if (!connection) throw new ApiError(404, "Workspace not found.");
        const rooms = await records(a, tx, (id) =>
          input.mode === "selected" ? inArray(id, input.ids) : undefined,
        );
        return (
          await purgeRooms(
            tx,
            a.conn.id,
            connection.activeId,
            rooms.map((room) => room.id),
            a.actor.id,
          )
        ).count;
      }
      const rows = await records(a, tx, (id) =>
        input.mode === "selected" ? inArray(id, input.ids) : undefined,
      );
      const ids = rows.map((r) => r.id);
      if (!ids.length) return 0;
      if (a.kind === "video") {
        const removed = await tx
          .delete(studioVideos)
          .where(inArray(studioVideos.messageId, ids))
          .returning({ id: studioVideos.messageId });
        await tx
          .update(roomMessages)
          .set({ meta: sql`${roomMessages.meta} - 'video'` })
          .where(inArray(roomMessages.id, ids));
        return removed.length;
      }
      if (a.kind === "message")
        return (
          await tx
            .delete(roomMessages)
            .where(inArray(roomMessages.id, ids))
            .returning({ id: roomMessages.id })
        ).length;
      if (["survey", "question", "private"].includes(a.kind))
        return (
          await tx
            .delete(studioTopics)
            .where(inArray(studioTopics.id, ids))
            .returning({ id: studioTopics.id })
        ).length;
      if (a.kind === "asset")
        return (
          await tx
            .update(uploads)
            .set({ state: "removed" })
            .where(and(inArray(uploads.id, ids), eq(uploads.state, "done")))
            .returning({ id: uploads.id })
        ).length;
      if (a.kind === "review" || a.kind === "activity") {
        const waiting = a.kind === "review";
        const eligible = and(
          inArray(commands.id, ids),
          inArray(commands.status, waiting ? ["review"] : ["done", "error"]),
        );
        const locked = await tx
          .select({ id: commands.id })
          .from(commands)
          .where(eligible)
          .orderBy(commands.id)
          .for("update");
        if (!locked.length) return 0;
        if (waiting)
          await tx
            .update(commands)
            .set({
              status: "error",
              error: "Proposal removed by " + a.actor.name,
              completedAt: new Date(),
            })
            .where(eligible);
        const hidden = await tx
          .select({ title: workspaceEntries.title })
          .from(workspaceEntries)
          .where(
            and(
              eq(workspaceEntries.connectionId, a.conn.id),
              eq(workspaceEntries.kind, "hidden_activity"),
              inArray(
                workspaceEntries.title,
                locked.map((r) => String(r.id)),
              ),
            ),
          );
        const hiddenIds = new Set(hidden.map((r) => r.title));
        const entries = locked
          .filter((r) => !hiddenIds.has(String(r.id)))
          .map((r) => ({
            connectionId: a.conn.id,
            kind: "hidden_activity",
            title: String(r.id),
          }));
        if (entries.length) await tx.insert(workspaceEntries).values(entries);
        return entries.length;
      }
      const removed = await tx
        .delete(workspaceEntries)
        .where(inArray(workspaceEntries.id, ids))
        .returning({ id: workspaceEntries.id });
      if (["task", "workbench:issue", "workbench:memory"].includes(a.kind))
        await detachEntryLinks(
          tx,
          a.conn.id,
          removed.map((r) => r.id),
        );
      return removed.length;
    });
    return Response.json({ count });
  } catch (e) {
    return apiError(e);
  }
}
