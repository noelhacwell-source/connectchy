import { requestRoom, ensureActiveRoom } from "@/lib/project-rooms";
import {
  and,
  eq,
  gt,
  lt,
  desc,
  asc,
  sql,
  isNull,
  gte,
  lte,
  ne,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  roomMessages,
  roomReads,
  agentPresence,
  chatReceipts,
} from "@/db/schema";
import { AGENT_PATTERN, unreadPings } from "@/lib/room-coordination";
import { apiError, ApiError, jsonBody, ownerRequest } from "@/lib/http-utils";
import { project, type Context } from "@/lib/project-api";
import { modules } from "@/lib/modules";
export const dynamic = "force-dynamic";
export async function GET(req: Request, ctx: Context) {
  try {
    const { conn, settings } = await project(ctx);
    if (!settings.room)
      throw new ApiError(403, "Communication room is disabled.");
    const room = await requestRoom(req, conn.id),
      m = modules(settings.modules),
      q = new URL(req.url).searchParams;
    const after = Number(q.get("after") ?? 0),
      before = Number(q.get("before") ?? 0),
      agent = q.get("agent"),
      search = q.get("q")?.slice(0, 300),
      speaker = q.get("speaker"),
      pinned = q.get("pinned") === "1",
      format = q.get("format");
    if (
      !Number.isSafeInteger(after) ||
      after < 0 ||
      !Number.isSafeInteger(before) ||
      before < 0 ||
      (after && before)
    )
      throw new ApiError(400, "Invalid message cursors.");
    if (agent && !AGENT_PATTERN.test(agent))
      throw new ApiError(400, "Invalid agent name.");
    if (search && !m.messageSearch)
      throw new ApiError(403, "Message search is disabled.");
    if (pinned && !m.messagePins)
      throw new ApiError(403, "Pinned messages are disabled.");
    if (format && !m.messageExport)
      throw new ApiError(403, "Conversation export is disabled.");
    if (agent && agent.toLowerCase() !== "owner" && m.agentPresence)
      await db
        .insert(agentPresence)
        .values({ connectionId: conn.id, roomId: room.id, agent })
        .onConflictDoUpdate({
          target: [agentPresence.roomId, agentPresence.agent],
          set: { lastSeenAt: new Date() },
        });
    const kind = q.get("kind"),
      tag = q.get("tag"),
      thread = q.get("thread"),
      urgent = q.get("urgent") === "1",
      starred = q.get("starred") === "1",
      followup = q.get("followup") === "1",
      jump = q.get("id");
    const since = q.get("since") ? new Date(q.get("since")!) : null,
      until = q.get("until")
        ? new Date(
            q.get("until")!.length === 10
              ? q.get("until") + "T23:59:59.999Z"
              : q.get("until")!,
          )
        : null;
    if (
      (since && !Number.isFinite(since.getTime())) ||
      (until && !Number.isFinite(until.getTime()))
    )
      throw new ApiError(400, "Invalid date filter.");
    for (const [used, key] of [
      [kind, "chatKindFilter"],
      [tag, "chatTags"],
      [thread, "chatThreads"],
      [urgent, "chatUrgency"],
      [starred, "chatStars"],
      [followup, "chatFollowups"],
      [jump, "chatJump"],
      [since || until, "chatDateFilter"],
    ] as const)
      if (used && !m[key])
        throw new ApiError(403, "That chat filter is disabled.");
    const rows = await db
      .select()
      .from(roomMessages)
      .where(
        and(
          eq(roomMessages.connectionId, conn.id),
          eq(roomMessages.roomId, room.id),
          isNull(roomMessages.deletedAt),
          q.get("hideSystem") === "1" && m.chatHideSystem
            ? ne(roomMessages.agent, "Coordinator")
            : undefined,
          kind ? eq(roomMessages.kind, kind) : undefined,
          tag
            ? sql`${roomMessages.meta}->'labels' @> ${JSON.stringify([tag])}::jsonb`
            : undefined,
          urgent ? sql`${roomMessages.meta}->>'urgent'='true'` : undefined,
          starred
            ? sql`${roomMessages.meta}->'stars' @> ${JSON.stringify([agent ?? "Owner"])}::jsonb`
            : undefined,
          followup ? sql`${roomMessages.meta}->>'followup'='true'` : undefined,
          jump ? eq(roomMessages.id, Number(jump)) : undefined,
          thread
            ? sql`${roomMessages.id} in (with recursive thread as (select id from room_messages where id=${Number(thread)} and room_id=${room.id} union all select m.id from room_messages m join thread t on m.reply_to=t.id where m.room_id=${room.id}) select id from thread)`
            : undefined,
          since ? gte(roomMessages.createdAt, since) : undefined,
          until ? lte(roomMessages.createdAt, until) : undefined,
          gt(roomMessages.id, after),
          before ? lt(roomMessages.id, before) : undefined,
          search
            ? sql`position(lower(${search}) in lower(${roomMessages.text}))>0`
            : undefined,
          speaker
            ? sql`lower(${roomMessages.agent})=lower(${speaker})`
            : undefined,
          pinned ? eq(roomMessages.pinned, 1) : undefined,
        ),
      )
      .orderBy(after ? asc(roomMessages.id) : desc(roomMessages.id))
      .limit(format ? 10001 : 100);
    if (!after) rows.reverse();
    if (format) {
      const truncated = rows.length > 10000,
        items = rows.slice(-10000);
      if (format === "json")
        return new Response(
          JSON.stringify(
            { room, exportedAt: new Date(), truncated, messages: items },
            null,
            2,
          ),
          {
            headers: {
              "Content-Type": "application/json",
              "Content-Disposition":
                'attachment; filename="studio-link-room.json"',
            },
          },
        );
      if (format !== "md")
        throw new ApiError(400, "Export format must be json or md.");
      return new Response(
        `# ${room.name}\n${truncated ? "\nExport contains only the latest 10,000 messages.\n" : ""}\n${items.map((r) => `### ${r.agent} · ${r.createdAt.toISOString()}\n${r.text}`).join("\n\n")}`,
        {
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Content-Disposition": 'attachment; filename="studio-link-room.md"',
          },
        },
      );
    }
    const priority =
      agent && m.pingInbox
        ? await unreadPings(conn.id, agent, 101, room.id)
        : [];
    return Response.json(
      {
        controls: {
          paused: !!conn.paused,
          stopRevision: conn.stopRevision,
          instruction: conn.paused
            ? "STOP. End further generation/tool calls, acknowledge /control action ackStop and wait for resume."
            : "Check roles and references before work.",
        },
        receipts: m.chatReceipts
          ? await db
              .select()
              .from(chatReceipts)
              .where(eq(chatReceipts.roomId, room.id))
          : [],
        attention: {
          recipient: agent,
          unacknowledgedPings: priority.slice(0, 100),
          more: priority.length > 100,
          instruction: priority.length
            ? "READ TARGETED MESSAGES FIRST. Acknowledge them before editing."
            : "No unacknowledged pings.",
        },
        room: {
          id: room.id,
          name: room.name,
          active: (await ensureActiveRoom(conn.id)).id === room.id,
        },
        team: room.team,
        messages: rows,
        nextCursor: rows.at(-1)?.id ?? after,
        olderCursor: rows[0]?.id ?? null,
        hasOlder: !after && rows.length === 100,
        truncated: rows.length === 100,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request, ctx: Context) {
  try {
    const { conn, settings } = await project(ctx);
    if (!settings.room)
      throw new ApiError(403, "Communication room is disabled.");
    const room = await requestRoom(req, conn.id, true),
      body = await jsonBody(req, 16000),
      m = modules(settings.modules);
    if (["pin", "edit", "delete"].includes(body.action)) {
      ownerRequest(req);
      if (body.action === "pin" ? !m.messagePins : !m.messageEditing)
        throw new ApiError(403, "This message feature is disabled.");
      const [row] = await db
        .select()
        .from(roomMessages)
        .where(
          and(
            eq(roomMessages.id, Number(body.id)),
            eq(roomMessages.roomId, room.id),
            isNull(roomMessages.deletedAt),
          ),
        );
      if (!row) throw new ApiError(404, "Message not found.");
      if (body.action === "edit") {
        if (row.agent !== "Owner")
          throw new ApiError(403, "Only your own messages can be edited.");
        if (
          typeof body.text !== "string" ||
          !body.text.trim() ||
          body.text.length > 6000
        )
          throw new ApiError(400, "Enter 1–6000 characters.");
        await db
          .update(roomMessages)
          .set({
            text: body.text.trim(),
            editedAt: new Date(),
            meta: {
              ...row.meta,
              history: [
                ...((row.meta.history ?? []) as unknown[]),
                { text: row.text, at: new Date().toISOString() },
              ].slice(-20),
            },
            mentions: [
              ...new Set(
                Array.from(
                  body.text.matchAll(
                    /(?:^|\s)@([A-Za-z][A-Za-z0-9_-]{0,39})\b/g,
                  ),
                  (x: RegExpMatchArray) => x[1].toLowerCase(),
                ),
              ),
            ],
          })
          .where(eq(roomMessages.id, row.id));
      } else
        await db
          .update(roomMessages)
          .set(
            body.action === "pin"
              ? { pinned: row.pinned ? 0 : 1 }
              : { deletedAt: new Date() },
          )
          .where(eq(roomMessages.id, row.id));
      return Response.json({ ok: true });
    }
    if (body.action === "ack") {
      if (!m.pingInbox) throw new ApiError(403, "Priority pings are disabled.");
      const p = z
        .object({
          agent: z.string().regex(AGENT_PATTERN),
          through: z.number().int().min(0),
        })
        .safeParse(body);
      if (!p.success)
        throw new ApiError(400, "Provide agent and through message ID.");
      const [last] = await db
        .select({ id: roomMessages.id })
        .from(roomMessages)
        .where(eq(roomMessages.roomId, room.id))
        .orderBy(desc(roomMessages.id))
        .limit(1);
      if (p.data.through > (last?.id ?? 0))
        throw new ApiError(400, "Cannot acknowledge an unknown message.");
      await db
        .insert(roomReads)
        .values({
          connectionId: conn.id,
          roomId: room.id,
          agent: p.data.agent.toLowerCase(),
          through: p.data.through,
        })
        .onConflictDoUpdate({
          target: [roomReads.connectionId, roomReads.roomId, roomReads.agent],
          set: {
            through: sql`greatest(${roomReads.through},${p.data.through})`,
          },
        });
      return Response.json({ ok: true });
    }
    const p = z
      .object({
        agent: z.string().trim().min(1).max(60),
        text: z.string().trim().min(1).max(6000),
        kind: z
          .enum(["message", "plan", "progress", "question", "decision", "done"])
          .default("message"),
        paths: z.array(z.string().max(300)).max(30).default([]),
        mentions: z.array(z.string().regex(AGENT_PATTERN)).max(30).default([]),
        replyTo: z.number().int().positive().optional(),
        urgent: z.boolean().optional(),
        labels: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
        attachments: z
          .array(
            z.object({
              assetId: z.string().regex(/^\d{1,24}$/),
              name: z.string().max(100),
              type: z.enum(["Image", "Model", "Audio"]),
            }),
          )
          .max(10)
          .optional(),
      })
      .safeParse(body);
    if (!p.success)
      throw new ApiError(
        400,
        "Provide agent, text and optional kind, mentions, paths or replyTo.",
      );
    if (p.data.replyTo) {
      if (!m.messageReplies)
        throw new ApiError(403, "Message replies are disabled.");
      const [target] = await db
        .select({ id: roomMessages.id })
        .from(roomMessages)
        .where(
          and(
            eq(roomMessages.id, p.data.replyTo),
            eq(roomMessages.roomId, room.id),
            isNull(roomMessages.deletedAt),
          ),
        );
      if (!target) throw new ApiError(404, "Reply target is not in this room.");
    }
    if (p.data.agent.toLowerCase() === "owner") ownerRequest(req);
    if (p.data.agent.toLowerCase() === "coordinator")
      throw new ApiError(403, "Coordinator is reserved for system messages.");
    if (conn.paused && p.data.agent.toLowerCase() !== "owner")
      throw new ApiError(
        423,
        "Stop requested. Acknowledge /control action ackStop and stop further generation/tool calls.",
      );
    const mentions = m.pingInbox
      ? [
          ...new Set(
            [
              ...p.data.mentions,
              ...Array.from(
                p.data.text.matchAll(
                  /(?:^|\s)@([A-Za-z][A-Za-z0-9_-]{0,39})\b/g,
                ),
                (x) => x[1],
              ),
            ].map((s) => s.toLowerCase()),
          ),
        ]
      : [];
    const [message] = await db
      .insert(roomMessages)
      .values({
        connectionId: conn.id,
        roomId: room.id,
        ...p.data,
        meta: {
          ...(m.chatUrgency ? { urgent: p.data.urgent ?? false } : {}),
          ...(m.chatTags ? { labels: p.data.labels ?? [] } : {}),
          ...(m.chatAttachments
            ? { attachments: p.data.attachments ?? [] }
            : {}),
        },
        mentions,
      })
      .returning();
    return Response.json({ ok: true, message }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
