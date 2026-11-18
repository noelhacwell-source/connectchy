import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  commands,
  connections,
  projectRooms,
  workspaceEntries,
} from "@/db/schema";
import { ApiError } from "./http-utils";
import { detachEntryLinks } from "./entry-links";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function purgeRooms(
  tx: Transaction,
  connectionId: number,
  activeId: number | null,
  ids: number[],
  actorId: number,
) {
  if (!ids.length) return { count: 0, activeRoomId: activeId };
  const match = and(
    eq(projectRooms.connectionId, connectionId),
    inArray(projectRooms.id, ids),
  );
  const linked = and(
    eq(workspaceEntries.connectionId, connectionId),
    inArray(workspaceEntries.roomId, ids),
  );
  if (actorId) {
    const [protectedRecord] = await tx
      .select({ id: workspaceEntries.id })
      .from(workspaceEntries)
      .where(
        and(
          linked,
          inArray(workspaceEntries.kind, [
            "workbench:profile",
            "workbench:release",
            "workbench:maintenance",
          ]),
        ),
      )
      .limit(1);
    if (protectedRecord)
      throw new ApiError(
        403,
        "Only the owner can delete rooms containing project controls.",
      );
  }
  const entries = await tx
    .select({ id: workspaceEntries.id })
    .from(workspaceEntries)
    .where(linked);
  await detachEntryLinks(
    tx,
    connectionId,
    entries.map((entry) => entry.id),
  );
  // Requests that have not been dispatched should never run after their room is gone.
  await tx
    .update(commands)
    .set({ status: "error", error: "Room deleted", completedAt: new Date() })
    .where(
      and(
        eq(commands.connectionId, connectionId),
        inArray(commands.roomId, ids),
        inArray(commands.status, ["pending", "review"]),
      ),
    );
  const removed = await tx
    .delete(projectRooms)
    .where(match)
    .returning({ id: projectRooms.id });
  if (activeId && !removed.some((room) => room.id === activeId))
    return { count: removed.length, activeRoomId: activeId };
  const [existing] = await tx
    .select({ id: projectRooms.id })
    .from(projectRooms)
    .where(
      and(
        eq(projectRooms.connectionId, connectionId),
        isNull(projectRooms.deletedAt),
      ),
    )
    .orderBy(asc(projectRooms.id))
    .limit(1);
  const replacement =
    existing ??
    (
      await tx
        .insert(projectRooms)
        .values({ connectionId, name: "Main room" })
        .returning({ id: projectRooms.id })
    )[0];
  await tx
    .update(connections)
    .set({ activeRoomId: replacement.id })
    .where(eq(connections.id, connectionId));
  return { count: removed.length, activeRoomId: replacement.id };
}
