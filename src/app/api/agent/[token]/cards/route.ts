import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { connections, workspaceEntries } from "@/db/schema";
import { project, type Context } from "@/lib/project-api";
import { apiError, ApiError, jsonBody } from "@/lib/http-utils";
import { studioActor } from "@/lib/studio-access";
import { RELEASE_FEATURES } from "@/lib/feature-release";
import { INSIGHT_LABELS } from "@/lib/board-cards";
import { modules } from "@/lib/modules";
async function access(req: Request, ctx: Context, write: boolean) {
  const { conn, settings } = await project(ctx);
  await studioActor(req, conn, write);
  const tab = new URL(req.url).searchParams.get("tab");
  if (tab !== "catalog" && tab !== "insights")
    throw new ApiError(400, "Unknown tab.");
  if (
    !modules(settings.modules)[
      tab === "catalog" ? "missionControl" : "insights"
    ]
  )
    throw new ApiError(403, "This tab is disabled.");
  return { conn, tab, kind: "hidden_card:" + tab };
}
export async function GET(req: Request, ctx: Context) {
  try {
    const { conn, kind } = await access(req, ctx, false);
    const rows = await db
      .select({ key: workspaceEntries.title })
      .from(workspaceEntries)
      .where(
        and(
          eq(workspaceEntries.connectionId, conn.id),
          eq(workspaceEntries.kind, kind),
        ),
      );
    return Response.json({ hidden: rows.map((r) => r.key) });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request, ctx: Context) {
  try {
    const { conn, kind, tab } = await access(req, ctx, true);
    const body = await jsonBody(req, 64000);
    const known =
      tab === "catalog"
        ? RELEASE_FEATURES.map((f) => String(f.id))
        : [...INSIGHT_LABELS];
    const keys =
      body.all === true
        ? known
        : Array.isArray(body.keys)
          ? [...new Set<string>(body.keys.map(String))]
          : [String(body.key)];
    if (
      !["hide", "restore"].includes(body.action) ||
      !keys.length ||
      keys.some((key) => !known.includes(key))
    )
      throw new ApiError(400, "Choose valid cards.");
    await db.transaction(async (tx) => {
      await tx
        .select({ id: connections.id })
        .from(connections)
        .where(eq(connections.id, conn.id))
        .for("update");
      const match = and(
        eq(workspaceEntries.connectionId, conn.id),
        eq(workspaceEntries.kind, kind),
        inArray(workspaceEntries.title, keys),
      );
      if (body.action === "restore") {
        await tx.delete(workspaceEntries).where(match);
        return;
      }
      const hidden = new Set(
        (
          await tx
            .select({ title: workspaceEntries.title })
            .from(workspaceEntries)
            .where(match)
        ).map((row) => row.title),
      );
      const rows = keys
        .filter((key) => !hidden.has(key))
        .map((title) => ({ connectionId: conn.id, kind, title }));
      if (rows.length) await tx.insert(workspaceEntries).values(rows);
    });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
