import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { connections, projectRooms, roomMessages, roomReads } from "@/db/schema";
import { ApiError } from "@/lib/http-utils";
import { DEFAULT_TEAM } from "@/lib/team-types";

/** Migrate the original conversation lazily, preserving its messages and role plan. */
export async function ensureActiveRoom(connectionId: number) {
  return db.transaction(async tx => {
    const [conn] = await tx.select().from(connections).where(eq(connections.id,connectionId)).for("update");
    if (!conn) throw new ApiError(404,"Project not found.");
    if (conn.activeRoomId) {
      const [room] = await tx.select().from(projectRooms).where(and(eq(projectRooms.id,conn.activeRoomId),eq(projectRooms.connectionId,connectionId),isNull(projectRooms.deletedAt)));
      if (room) return room;
    }
    const [room] = await tx.insert(projectRooms).values({connectionId,name:"Main room",team:conn.team ?? DEFAULT_TEAM}).returning();
    await tx.update(roomMessages).set({roomId:room.id}).where(and(eq(roomMessages.connectionId,connectionId),isNull(roomMessages.roomId)));
    await tx.update(roomReads).set({roomId:room.id}).where(and(eq(roomReads.connectionId,connectionId),isNull(roomReads.roomId)));
    await tx.update(connections).set({activeRoomId:room.id}).where(eq(connections.id,connectionId));
    return room;
  });
}
export async function requestRoom(req: Request, connectionId: number, write = false) {
  const active = await ensureActiveRoom(connectionId);
  const id = new URL(req.url).searchParams.get("room");
  if (!id) return active;
  if (!/^\d+$/.test(id)) throw new ApiError(400,"Invalid room ID.");
  const [room] = await db.select().from(projectRooms).where(and(eq(projectRooms.id,Number(id)),eq(projectRooms.connectionId,connectionId),isNull(projectRooms.deletedAt)));
  if (!room) throw new ApiError(404,"Room not found in this project.");
  if (write && room.id !== active.id) throw new ApiError(409,"This is an older room. Switch it to the active room before posting or changing roles.");
  return room;
}
