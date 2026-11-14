import { modules } from "@/lib/modules";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  connections,
  commands,
  roomMessages,
  agentPresence,
} from "@/db/schema";
import { project, type Context } from "@/lib/project-api";
import { ApiError, apiError, jsonBody, ownerRequest } from "@/lib/http-utils";
import { ensureActiveRoom } from "@/lib/project-rooms";
import { agentControlError } from "@/lib/room-coordination";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, ctx: Context) {
  try {
    const { conn } = await project(ctx);
    const agent=new URL(_req.url).searchParams.get("agent");
    const agentError=agent?await agentControlError(conn,agent):null;
    const team=(await ensureActiveRoom(conn.id)).team;
    return Response.json(
      {
        paused: !!conn.paused || !!agentError,
        projectPaused:!!conn.paused,
        agents:team.participants.map(p=>({agent:p.agent,role:p.role,state:p.control??"active",revision:p.controlRevision??0})),
        stopRevision: conn.stopRevision,
        instruction: agentError ?? (conn.paused
          ? "STOP: stop issuing tool calls and finish your current response. Acknowledge the stop signal and wait for the owner to resume."
          : "Work may proceed subject to room roles, references and feature settings."),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request, ctx: Context) {
  try {
    const { conn } = await project(ctx),
      body = await jsonBody(req, 4000);
    if (body.action === "ackStop") {
      if (
        typeof body.agent !== "string" ||
        !/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(body.agent)
      )
        throw new ApiError(400, "Provide your agent name.");
      const room = await ensureActiveRoom(conn.id);
      await db
        .insert(agentPresence)
        .values({
          connectionId: conn.id,
          roomId: room.id,
          agent: body.agent,
          task: `Stopped; acknowledged signal ${conn.stopRevision}`,
        })
        .onConflictDoUpdate({
          target: [agentPresence.roomId, agentPresence.agent],
          set: {
            lastSeenAt: new Date(),
            task: `Stopped; acknowledged signal ${conn.stopRevision}`,
          },
        });
      return Response.json({ ok: true, stopRevision: conn.stopRevision });
    }
    ownerRequest(req);
    if (body.action === "stop") {
      if (!modules(conn.features.modules).pauseControl)
        throw new ApiError(403, "Stop control is disabled.");
      const room = await ensureActiveRoom(conn.id);
      const result = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(connections)
          .set({ paused: 1, stopRevision: sql`${connections.stopRevision}+1` })
          .where(eq(connections.id, conn.id))
          .returning();
        const cancelled = await tx
          .update(commands)
          .set({
            status: "error",
            error: "Cancelled by owner stop signal before dispatch.",
            completedAt: new Date(),
          })
          .where(
            and(
              eq(commands.connectionId, conn.id),
              inArray(commands.status, ["pending", "review"]),
            ),
          )
          .returning({ id: commands.id });
        await tx
          .insert(roomMessages)
          .values({
            connectionId: conn.id,
            roomId: room.id,
            agent: "Coordinator",
            kind: "decision",
            text: `@all STOP requested by the owner (signal ${row.stopRevision}). Stop generating further work, stop tool calls, acknowledge /control action ackStop, and wait for resume. New Studio commands are blocked; queued edits were cancelled. External AI generation cannot be forcibly cancelled by this app.`,
            mentions: ["all"],
          });
        return { stopRevision: row.stopRevision, cancelled: cancelled.length };
      });
      return Response.json({ ok: true, paused: true, ...result });
    }
    if (typeof body.paused === "boolean") {
      if (body.paused && !modules(conn.features.modules).pauseControl)
        throw new ApiError(403, "Stop control is disabled.");
      await db
        .update(connections)
        .set({ paused: body.paused ? 1 : 0 })
        .where(eq(connections.id, conn.id));
      return Response.json({ ok: true, paused: body.paused });
    }
    if (body.action === "cancel") {
      const [row] = await db
        .update(commands)
        .set({
          status: "error",
          error: "Cancelled by owner before dispatch.",
          completedAt: new Date(),
        })
        .where(
          and(
            eq(commands.connectionId, conn.id),
            eq(commands.id, Number(body.id)),
            eq(commands.status, "pending"),
          ),
        )
        .returning();
      if (!row)
        throw new ApiError(
          409,
          "Only queued, undispatched commands can be cancelled.",
        );
      return Response.json({ ok: true });
    }
    throw new ApiError(
      400,
      "Provide action stop, ackStop or cancel, or paused true/false.",
    );
  } catch (e) {
    return apiError(e);
  }
}
