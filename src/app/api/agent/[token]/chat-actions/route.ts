import { and, eq, desc, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  roomMessages,
  chatReceipts,
  workspaceEntries,
  projectRooms,
} from "@/db/schema";
import { project, type Context } from "@/lib/project-api";
import { requestRoom, ensureActiveRoom } from "@/lib/project-rooms";
import { modules, type ModuleId } from "@/lib/modules";
import { ApiError, apiError, jsonBody, ownerRequest } from "@/lib/http-utils";
const feature: Record<string, ModuleId> = {
  react: "chatReactions",
  poll: "chatPolls",
  vote: "chatPolls",
  closePoll: "chatPolls",
  checklist: "chatChecklists",
  check: "chatChecklists",
  labels: "chatTags",
  urgent: "chatUrgency",
  star: "chatStars",
  followup: "chatFollowups",
  forward: "chatForwarding",
  restore: "chatTrash",
  seen: "chatReceipts",
  attach: "chatAttachments",
  toTask: "chatToTask",
  toNote: "chatToNote",
  toDecision: "chatToDecision",
};
export const dynamic = "force-dynamic";
export async function GET(req: Request, ctx: Context) {
  try {
    const { conn, settings } = await project(ctx),
      m = modules(settings.modules);
    if (!settings.room) throw new ApiError(403, "Communication is disabled.");
    const room = await requestRoom(req, conn.id),
      q = new URL(req.url).searchParams,
      kind = q.get("kind") ?? "library";
    if (kind === "library") {
      const rows = await db
        .select()
        .from(workspaceEntries)
        .where(
          and(
            eq(workspaceEntries.connectionId, conn.id),
            isNull(workspaceEntries.archivedAt),
          ),
        )
        .orderBy(desc(workspaceEntries.id));
      return Response.json({
        items: rows.filter(
          (r) =>
            (r.kind === "reply" && m.chatSavedReplies) ||
            (r.kind === "snippet" && m.chatSnippets),
        ),
      });
    }
    if (kind === "receipts") {
      if (!m.chatReceipts)
        throw new ApiError(403, "Read acknowledgements are disabled.");
      return Response.json({
        receipts: await db
          .select()
          .from(chatReceipts)
          .where(eq(chatReceipts.roomId, room.id)),
      });
    }
    if (kind === "trash") {
      if (!m.chatTrash)
        throw new ApiError(403, "Message recovery is disabled.");
      ownerRequest(req);
      const rows = await db
        .select()
        .from(roomMessages)
        .where(eq(roomMessages.roomId, room.id))
        .orderBy(desc(roomMessages.id))
        .limit(1000);
      return Response.json({ messages: rows.filter((r) => r.deletedAt) });
    }
    throw new ApiError(400, "Unknown chat collection.");
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request, ctx: Context) {
  try {
    const { conn, settings } = await project(ctx);
    if (!settings.room) throw new ApiError(403, "Communication is disabled.");
    const m = modules(settings.modules),
      body = await jsonBody(req, 70000),
      action = String(body.action),
      room = await requestRoom(req, conn.id),
      active = await ensureActiveRoom(conn.id);
    const agent = typeof body.agent === "string" ? body.agent : "Owner";
    if (
      !/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(agent) ||
      agent.toLowerCase() === "coordinator"
    )
      throw new ApiError(400, "Use a valid participant name.");
    if (agent.toLowerCase() === "owner") ownerRequest(req);
    if (conn.paused && action !== "seen") {
      try {
        ownerRequest(req);
      } catch {
        throw new ApiError(423, "Project stopped. Wait for resume.");
      }
    }
    if (
      action === "saveReply" ||
      action === "saveSnippet" ||
      action === "deleteTemplate"
    ) {
      ownerRequest(req);
      const kind = action === "saveSnippet" ? "snippet" : "reply";
      if (action === "deleteTemplate") {
        const [item] = await db
          .select()
          .from(workspaceEntries)
          .where(
            and(
              eq(workspaceEntries.id, Number(body.id)),
              eq(workspaceEntries.connectionId, conn.id),
            ),
          );
        if (!item || !["reply", "snippet"].includes(item.kind))
          throw new ApiError(404, "Template not found.");
        if (!m[item.kind === "reply" ? "chatSavedReplies" : "chatSnippets"])
          throw new ApiError(403, "This library is disabled.");
        await db
          .update(workspaceEntries)
          .set({ archivedAt: new Date() })
          .where(eq(workspaceEntries.id, item.id));
        return Response.json({ ok: true });
      }
      if (!m[kind === "reply" ? "chatSavedReplies" : "chatSnippets"])
        throw new ApiError(403, "This library is disabled.");
      const p = z
        .object({
          title: z.string().trim().min(1).max(100),
          text: z.string().min(1).max(15000),
        })
        .safeParse(body);
      if (!p.success) throw new ApiError(400, "Provide a title and text.");
      const [item] = await db
        .insert(workspaceEntries)
        .values({
          connectionId: conn.id,
          roomId: room.id,
          kind,
          title: p.data.title,
          body: p.data.text,
          owner: agent,
        })
        .returning();
      return Response.json({ ok: true, item });
    }
    if (!(action in feature) || !m[feature[action]])
      throw new ApiError(403, "This chat feature is disabled or unavailable.");
    if (action === "seen") {
      const through = Number(body.through);
      if (!Number.isSafeInteger(through) || through < 0)
        throw new ApiError(400, "Invalid read position.");
      const [last] = await db
        .select({ id: roomMessages.id })
        .from(roomMessages)
        .where(eq(roomMessages.roomId, room.id))
        .orderBy(desc(roomMessages.id))
        .limit(1);
      if (through > (last?.id ?? 0))
        throw new ApiError(400, "Unknown message.");
      await db
        .insert(chatReceipts)
        .values({ roomId: room.id, agent, through })
        .onConflictDoUpdate({
          target: [chatReceipts.roomId, chatReceipts.agent],
          set: {
            through: sql`greatest(${chatReceipts.through},${through})`,
            updatedAt: new Date(),
          },
        });
      return Response.json({ ok: true });
    }
    if (action === "poll") {
      if (room.id !== active.id)
        throw new ApiError(409, "Choose the active room.");
      const p = z
        .object({
          question: z.string().trim().min(1).max(500),
          options: z.array(z.string().trim().min(1).max(200)).min(2).max(10),
        })
        .safeParse(body);
      if (!p.success || new Set(p.data.options).size !== p.data.options.length)
        throw new ApiError(
          400,
          "Provide a question and 2–10 distinct options.",
        );
      const [message] = await db
        .insert(roomMessages)
        .values({
          connectionId: conn.id,
          roomId: room.id,
          agent,
          text: p.data.question,
          kind: "question",
          meta: {
            poll: {
              question: p.data.question,
              options: p.data.options,
              votes: {},
              closed: false,
            },
          },
        })
        .returning();
      return Response.json({ ok: true, message });
    }
    const id = Number(body.id);
    if (!Number.isSafeInteger(id) || id < 1)
      throw new ApiError(400, "Invalid message ID.");
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(roomMessages)
        .where(
          and(
            eq(roomMessages.id, id),
            eq(roomMessages.connectionId, conn.id),
            eq(roomMessages.roomId, room.id),
          ),
        )
        .for("update");
      if (!row) throw new ApiError(404, "Message not found.");
      if (["toTask", "toNote", "toDecision"].includes(action)) {
        const kind =
          action === "toTask"
            ? "task"
            : action === "toNote"
              ? "note"
              : "decision";
        if (
          !m[
            kind === "task"
              ? "taskBoard"
              : kind === "note"
                ? "notes"
                : "decisions"
          ]
        )
          throw new ApiError(403, "The destination collection is disabled.");
        const [item] = await tx
          .insert(workspaceEntries)
          .values({
            connectionId: conn.id,
            roomId: active.id,
            kind,
            title:
              String(body.title ?? row.text.split("\n")[0]).slice(0, 160) ||
              "Message follow-up",
            body: `From ${row.agent}, message #${row.id}\n\n${row.text}`,
            owner: String(body.owner ?? "").slice(0, 40),
            data: { sourceMessageId: row.id, dependencies: [], tags: [] },
          })
          .returning();
        return { item };
      }
      if (action === "forward") {
        ownerRequest(req);
        if (Number(body.targetRoom) !== active.id || active.id === room.id)
          throw new ApiError(
            409,
            "Forward from an older room into the current active room.",
          );
        const [message] = await tx
          .insert(roomMessages)
          .values({
            connectionId: conn.id,
            roomId: active.id,
            agent,
            text: `Forwarded from ${room.name} · ${row.agent}\n\n${row.text}`,
            meta: {
              forwardedFrom: {
                roomId: room.id,
                messageId: row.id,
                agent: row.agent,
              },
            },
          })
          .returning();
        return { message };
      }
      if (room.id !== active.id && action !== "restore")
        throw new ApiError(
          409,
          "Make this room active before changing messages.",
        );
      if (action === "restore") {
        ownerRequest(req);
        await tx
          .update(roomMessages)
          .set({ deletedAt: null })
          .where(eq(roomMessages.id, id));
        return { restored: true };
      }
      if (row.deletedAt) throw new ApiError(404, "Message is hidden.");
      const meta = structuredClone(row.meta ?? {});
      if (action === "react") {
        const emoji = z
          .enum(["👍", "❤️", "🎉", "👀", "✅", "❓"])
          .safeParse(body.emoji);
        if (!emoji.success)
          throw new ApiError(400, "Choose a supported reaction.");
        const reactions = (meta.reactions ?? {}) as Record<string, string[]>;
        const people = reactions[emoji.data] ?? [];
        reactions[emoji.data] = people.includes(agent)
          ? people.filter((n) => n !== agent)
          : [...people, agent];
        meta.reactions = reactions;
      }
      if (action === "vote" || action === "closePoll") {
        const poll = meta.poll as
          | {
              options: string[];
              votes: Record<string, number>;
              closed: boolean;
            }
          | undefined;
        if (!poll) throw new ApiError(400, "This message is not a poll.");
        if (action === "closePoll") {
          ownerRequest(req);
          poll.closed = true;
        } else {
          const option = Number(body.option);
          if (
            poll.closed ||
            !Number.isInteger(option) ||
            option < 0 ||
            option >= poll.options.length
          )
            throw new ApiError(400, "Choose an open poll option.");
          poll.votes[agent] = option;
        }
        meta.poll = poll;
      }
      if (action === "checklist") {
        const items = z
          .array(z.string().trim().min(1).max(300))
          .min(1)
          .max(30)
          .safeParse(body.items);
        if (!items.success)
          throw new ApiError(400, "Provide 1–30 checklist items.");
        meta.checklist = items.data.map((text, index) => ({
          id: index,
          text,
          done: false,
        }));
      }
      if (action === "check") {
        const items = meta.checklist as
          { id: number; text: string; done: boolean }[] | undefined;
        const item = items?.find((i) => i.id === Number(body.item));
        if (!item) throw new ApiError(400, "Checklist item not found.");
        item.done = !item.done;
        meta.checklist = items;
      }
      if (action === "labels") {
        const p = z
          .array(z.string().trim().min(1).max(40))
          .max(10)
          .safeParse(body.labels);
        if (!p.success) throw new ApiError(400, "Use up to ten labels.");
        meta.labels = [...new Set(p.data)];
      }
      if (action === "urgent") {
        meta.urgent = !meta.urgent;
      }
      if (action === "star") {
        const stars = (meta.stars ?? []) as string[];
        meta.stars = stars.includes(agent)
          ? stars.filter((n) => n !== agent)
          : [...stars, agent];
      }
      if (action === "followup") {
        meta.followup = !meta.followup;
      }
      if (action === "attach") {
        const p = z
          .array(
            z.object({
              assetId: z.string().regex(/^\d{1,24}$/),
              name: z.string().max(100),
              type: z.enum(["Image", "Model", "Audio"]),
            }),
          )
          .min(1)
          .max(10)
          .safeParse(body.attachments);
        if (!p.success)
          throw new ApiError(400, "Provide up to ten named Roblox asset IDs.");
        meta.attachments = p.data;
      }
      const [message] = await tx
        .update(roomMessages)
        .set({ meta })
        .where(eq(roomMessages.id, id))
        .returning();
      return { message };
    });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return apiError(e);
  }
}


