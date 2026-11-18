import { and, asc, desc, eq, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { studioAgents, studioTopics } from "@/db/schema";
import { apiError, ApiError, jsonBody } from "@/lib/http-utils";
import { project, type Context } from "@/lib/project-api";
import { requestRoom } from "@/lib/project-rooms";
import { studioActor } from "@/lib/studio-access";
import { changeTopic } from "@/lib/studio-topics";

async function access(req: Request, ctx: Context, write: boolean) {
  const { conn, settings } = await project(ctx);
  if (!settings.room)
    throw new ApiError(403, "Enable workspace communication first.");
  const actor = await studioActor(req, conn, write),
    room = await requestRoom(req, conn.id);
  return { conn, actor, room };
}
export async function GET(req: Request, ctx: Context) {
  try {
    const { conn, room, actor } = await access(req, ctx, false);
    const [topics, agents] = await Promise.all([
      db
        .select()
        .from(studioTopics)
        .where(
          and(
            eq(studioTopics.roomId, room.id),
            actor.id
              ? or(
                  ne(studioTopics.kind, "private"),
                  sql`${studioTopics.members} @> ${JSON.stringify([actor.id])}::jsonb`,
                )
              : undefined,
          ),
        )
        .orderBy(desc(studioTopics.updatedAt)),
      db
        .select({
          id: studioAgents.id,
          name: studioAgents.name,
          model: studioAgents.model,
        })
        .from(studioAgents)
        .where(eq(studioAgents.connectionId, conn.id))
        .orderBy(asc(studioAgents.name)),
    ]);
    return Response.json(
      { topics, agents, actor: actor.id },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request, ctx: Context) {
  try {
    const { conn, actor, room } = await access(req, ctx, true);
    return Response.json(
      await changeTopic(conn.id, room.id, actor, await jsonBody(req, 64000)),
    );
  } catch (e) {
    return apiError(e);
  }
}
