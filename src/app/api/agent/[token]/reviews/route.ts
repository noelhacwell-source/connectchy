import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { commands } from "@/db/schema";
import { project, type Context } from "@/lib/project-api";
import { ApiError, apiError, jsonBody, ownerRequest } from "@/lib/http-utils";
import { modules } from "@/lib/modules";
import { coordinationError } from "@/lib/room-coordination";
import { protectionError } from "@/lib/work-protection";
import { runCommand, isOnline } from "@/lib/bridge";
export async function GET(_req: Request, ctx: Context) {
  try {
    const { conn, settings } = await project(ctx);
    if (!modules(settings.modules).reviewQueue)
      throw new ApiError(403, "Review queue is disabled.");
    return Response.json({
      reviews: await db
        .select()
        .from(commands)
        .where(
          and(
            eq(commands.connectionId, conn.id),
            eq(commands.status, "review"),
          ),
        )
        .orderBy(desc(commands.id))
        .limit(100),
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request, ctx: Context) {
  try {
    ownerRequest(req);
    const { conn, settings } = await project(ctx);
    if (!modules(settings.modules).reviewQueue)
      throw new ApiError(403, "Review queue is disabled.");
    const body = await jsonBody(req, 4000);
    const [row] = await db
      .select()
      .from(commands)
      .where(
        and(
          eq(commands.connectionId, conn.id),
          eq(commands.id, Number(body.id)),
          eq(commands.status, "review"),
        ),
      );
    if (!row) throw new ApiError(404, "Review not found or already handled.");
    if (body.action === "reject") {
      await db
        .update(commands)
        .set({
          status: "error",
          error: "Rejected by owner.",
          completedAt: new Date(),
        })
        .where(and(eq(commands.id, row.id), eq(commands.status, "review")));
      return Response.json({ ok: true });
    }
    if (body.action !== "approve")
      throw new ApiError(400, "Choose approve or reject.");
    if (conn.paused || !isOnline(conn))
      throw new ApiError(
        409,
        "Resume the project and connect Studio before approval.",
      );
    const guard =
      (await coordinationError(conn, row.agent, row.roomId)) ??
      (await protectionError(conn, row.agent, row.type, row.payload));
    if (guard) throw new ApiError(409, guard);
    for (const before of row.before ?? []) {
      const r = await runCommand(conn, {
        type: "get_source",
        payload: { path: before.path },
        source: "dashboard",
        timeoutMs: 10000,
      });
      const current = r.body as { ok?: boolean; result?: { source?: string } };
      if (!current.ok || current.result?.source !== before.source)
        throw new ApiError(
          409,
          "The script changed after this proposal. Reject it and ask the AI for a fresh proposal.",
        );
    }
    const [updated] = await db
      .update(commands)
      .set({ status: "pending", createdAt: new Date() })
      .where(and(eq(commands.id, row.id), eq(commands.status, "review")))
      .returning();
    if (!updated) throw new ApiError(409, "Review was already handled.");
    return Response.json({ ok: true, id: row.id, status: "pending" });
  } catch (e) {
    return apiError(e);
  }
}
