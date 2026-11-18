import { detachEntryLinks } from "@/lib/entry-links";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { commands, roomMessages, uploads, workspaceEntries } from "@/db/schema";
import { project, type Context } from "@/lib/project-api";
import { apiError, ApiError, jsonBody } from "@/lib/http-utils";
import { studioActor, validId } from "@/lib/studio-access";
import { modules, type ModuleId } from "@/lib/modules";
import { WORKBENCH } from "@/lib/workbench-model";
const features: Record<string, ModuleId> = {
  asset: "assetLibrary",
  review: "reviewQueue",
  activity: "activity",
  message: "messageEditing",
  reference: "gameReferences",
  task: "taskBoard",
  note: "notes",
  decision: "decisions",
  bookmark: "bookmarks",
  handoff: "handoffs",
  checkpoint: "checkpoints",
  check: "checks",
  workbench: "missionControl",
  reply: "chatSavedReplies",
  snippet: "chatSnippets",
};
export async function POST(req: Request, ctx: Context) {
  try {
    const { conn, settings } = await project(ctx),
      actor = await studioActor(req, conn),
      b = await jsonBody(req, 4000),
      id = validId(b.id),
      kind = String(b.kind);
    if (
      !Object.hasOwn(features, kind) ||
      !modules(settings.modules)[features[kind]]
    )
      throw new ApiError(403, "This collection is disabled.");
    let count = 0;
    if (kind === "message") {
      if (!settings.room) throw new ApiError(403, "Communication is disabled.");
      const rows = await db
        .delete(roomMessages)
        .where(
          and(eq(roomMessages.connectionId, conn.id), eq(roomMessages.id, id)),
        )
        .returning({ id: roomMessages.id });
      count = rows.length;
    } else if (kind === "activity" || kind === "review") {
      // Keep queue receipts and budget accounting after removing the item from the log.
      await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(commands)
          .where(
            and(
              eq(commands.connectionId, conn.id),
              eq(commands.id, id),
              inArray(
                commands.status,
                kind === "review" ? ["review"] : ["done", "error"],
              ),
            ),
          )
          .for("update");
        if (!row)
          throw new ApiError(
            409,
            "Choose a waiting review or a completed activity.",
          );
        if (kind === "review")
          await tx
            .update(commands)
            .set({
              status: "error",
              error: "Proposal removed by " + actor.name,
              completedAt: new Date(),
            })
            .where(eq(commands.id, id));
        const [hidden] = await tx
          .select({ id: workspaceEntries.id })
          .from(workspaceEntries)
          .where(
            and(
              eq(workspaceEntries.connectionId, conn.id),
              eq(workspaceEntries.kind, "hidden_activity"),
              eq(workspaceEntries.title, String(id)),
            ),
          );
        if (!hidden)
          await tx
            .insert(workspaceEntries)
            .values({
              connectionId: conn.id,
              kind: "hidden_activity",
              title: String(id),
            });
      });
      count = 1;
    } else if (kind === "asset") {
      const rows = await db
        .update(uploads)
        .set({ state: "removed" })
        .where(
          and(
            eq(uploads.connectionId, conn.id),
            eq(uploads.id, id),
            eq(uploads.state, "done"),
          ),
        )
        .returning({ id: uploads.id });
      count = rows.length;
    } else {
      const [row] = await db
        .select()
        .from(workspaceEntries)
        .where(
          and(
            eq(workspaceEntries.connectionId, conn.id),
            eq(workspaceEntries.id, id),
          ),
        );
      if (
        row &&
        (row.kind === kind ||
          (kind === "workbench" && row.kind.startsWith("workbench:")))
      ) {
        if (
          actor.id &&
          kind === "workbench" &&
          WORKBENCH[row.kind.slice(10)]?.ownerOnly
        )
          throw new ApiError(
            403,
            "Only the owner may delete project controls.",
          );
        const rows = await db.transaction(async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock(${conn.id})`);
          const deleted = await tx
            .delete(workspaceEntries)
            .where(
              and(
                eq(workspaceEntries.id, id),
                eq(
                  workspaceEntries.revision,
                  Number(b.revision ?? row.revision),
                ),
              ),
            )
            .returning({ id: workspaceEntries.id });
          if (
            deleted.length &&
            ["task", "workbench:issue", "workbench:memory"].includes(row.kind)
          )
            await detachEntryLinks(tx, conn.id, [id]);
          return deleted;
        });
        if (!rows.length)
          throw new ApiError(409, "The item changed. Refresh before deleting.");
        count = 1;
      }
    }
    if (!count) throw new ApiError(404, "Item not found in this collection.");
    return Response.json({ deleted: id });
  } catch (e) {
    return apiError(e);
  }
}
