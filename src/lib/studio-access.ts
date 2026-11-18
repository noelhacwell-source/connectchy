import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { studioAgents, type Connection } from "@/db/schema";
import { sha } from "./bridge";
import { ApiError, ownerRequest } from "./http-utils";
import { guardAgentRequest } from "./room-coordination";

export async function studioActor(
  req: Request,
  conn: Connection,
  write = true,
) {
  const key = req.headers.get("x-agent-key");
  if (!key) {
    ownerRequest(req);
    return { id: 0, name: "Owner" };
  }
  const [agent] = await db
    .select({ id: studioAgents.id, name: studioAgents.name })
    .from(studioAgents)
    .where(
      and(
        eq(studioAgents.connectionId, conn.id),
        eq(studioAgents.keyHash, sha(key)),
      ),
    );
  if (!agent) throw new ApiError(403, "Invalid individual agent key.");
  if (write && conn.paused) throw new ApiError(423, "The project is paused.");
  await guardAgentRequest(req, conn, agent.name);
  return agent;
}
export function validText(value: unknown, max: number, label: string) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new ApiError(400, label + " must contain 1–" + max + " characters.");
  return value.trim();
}
export function validId(value: unknown) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1)
    throw new ApiError(400, "Invalid item ID.");
  return n;
}
