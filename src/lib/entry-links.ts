import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { workspaceEntries } from "@/db/schema";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function detachEntryLinks(
  tx: Transaction,
  connectionId: number,
  ids: number[],
) {
  if (!ids.length) return;
  const removed = new Set(ids);
  const linked = await tx
    .select()
    .from(workspaceEntries)
    .where(
      and(
        eq(workspaceEntries.connectionId, connectionId),
        inArray(workspaceEntries.kind, [
          "task",
          "workbench:milestone",
          "workbench:issue",
          "workbench:memory",
        ]),
      ),
    )
    .for("update");
  for (const row of linked) {
    if (removed.has(row.id)) continue;
    const key =
      row.kind === "task"
        ? "dependencies"
        : row.kind === "workbench:milestone"
          ? "taskIds"
          : row.kind === "workbench:issue"
            ? "relatedIds"
            : "supersedes";
    const old = row.data[key];
    if (
      Array.isArray(old)
        ? !old.some((id) => removed.has(id))
        : !removed.has(Number(old))
    )
      continue;
    const data = { ...row.data };
    if (Array.isArray(old)) data[key] = old.filter((n) => !removed.has(n));
    else delete data[key];
    await tx
      .update(workspaceEntries)
      .set({
        data,
        updatedAt: new Date(),
        revision: sql`${workspaceEntries.revision}+1`,
      })
      .where(eq(workspaceEntries.id, row.id));
  }
}
