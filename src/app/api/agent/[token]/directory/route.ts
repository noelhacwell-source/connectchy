import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { projectRooms, studioAgents } from "@/db/schema";
import { newToken, sha } from "@/lib/bridge";
import { apiError, ApiError, jsonBody, ownerRequest } from "@/lib/http-utils";
import { project, type Context } from "@/lib/project-api";
import { AGENT_PATTERN } from "@/lib/room-coordination";
import { seal } from "@/lib/secrets";
import { validId, validText } from "@/lib/studio-access";

export async function GET(req: Request, ctx: Context) {
  try {
    ownerRequest(req);
    const { conn } = await project(ctx);
    const agents = await db
      .select({
        id: studioAgents.id,
        name: studioAgents.name,
        provider: studioAgents.provider,
        model: studioAgents.model,
        instructions: studioAgents.instructions,
      })
      .from(studioAgents)
      .where(eq(studioAgents.connectionId, conn.id))
      .orderBy(asc(studioAgents.name));
    const rooms = await db.select({name: projectRooms.name, team: projectRooms.team}).from(projectRooms)
      .where(and(eq(projectRooms.connectionId, conn.id), isNull(projectRooms.deletedAt))).orderBy(asc(projectRooms.id));
    const registrations = rooms.flatMap(room => room.team.participants.filter(p => p.control !== "removed")
      .map(p => ({name:p.agent, room:room.name, role:p.role, state:p.control || (p.done ? "Done" : p.ready ? "Ready" : "Planning")})));
    return Response.json({ agents, registrations }, {headers: {"Cache-Control":"no-store"}});
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request, ctx: Context) {
  try {
    ownerRequest(req);
    const { conn } = await project(ctx),
      b = await jsonBody(req, 24000);
    if (b.action === "removeAll") {
      const rows = await db.delete(studioAgents).where(eq(studioAgents.connectionId, conn.id)).returning({ id: studioAgents.id });
      return Response.json({ count: rows.length });
    }
    const key = newToken();
    if (b.action === "remove" || b.action === "rotate") {
      const match = and(
        eq(studioAgents.connectionId, conn.id),
        eq(studioAgents.id, validId(b.id)),
      );
      const result =
        b.action === "remove"
          ? await db
              .delete(studioAgents)
              .where(match)
              .returning({ id: studioAgents.id })
          : await db
              .update(studioAgents)
              .set({ keyHash: sha(key) })
              .where(match)
              .returning({ id: studioAgents.id });
      if (!result.length) throw new ApiError(404, "Agent not found.");
      return Response.json(b.action === "remove" ? { ok: true } : { key }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (!["import", "invite", "update"].includes(b.action))
      throw new ApiError(400, "Unknown directory action.");
    const name = validText(b.name, 40, "Agent name");
    if (
      !AGENT_PATTERN.test(name) ||
      ["owner", "coordinator", "all"].includes(name.toLowerCase())
    )
      throw new ApiError(
        400,
        "Use an agent name starting with a letter, with letters, digits, - or _.",
      );
    const config: {
      provider?: string;
      model?: string;
      secret?: string;
      instructions: string;
    } = {
      instructions: String(b.instructions ?? "")
        .trim()
        .slice(0, 4000),
    };
    if (b.action !== "invite") {
      let url: URL;
      try {
        url = new URL(validText(b.provider, 2000, "Provider base URL"));
      } catch {
        throw new ApiError(400, "Enter the provider’s API base URL.");
      }
      if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !(
          url.protocol === "https:" ||
          (url.protocol === "http:" &&
            ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
        )
      )
        throw new ApiError(
          400,
          "Use an HTTPS provider URL or a loopback HTTP server.",
        );
      config.provider = url.href.replace(/\/+$/, "");
      config.model = validText(b.model, 200, "Model ID");
      if (b.apiKey || b.action === "import")
        config.secret = seal(validText(b.apiKey, 8000, "API key"));
    }
    if (b.action === "update") {
      const match = and(
        eq(studioAgents.connectionId, conn.id),
        eq(studioAgents.id, validId(b.id)),
      );
      const [old] = await db.select().from(studioAgents).where(match);
      if (!old?.provider) throw new ApiError(404, "Imported agent not found.");
      if (config.provider !== old.provider && !config.secret)
        throw new ApiError(400, "Enter a new key when changing provider.");
      await db.update(studioAgents).set(config).where(match);
      return Response.json({ ok: true });
    }
    const [agent] = await db
      .insert(studioAgents)
      .values({
        ...config,
        connectionId: conn.id,
        name,
        handle: name.toLowerCase(),
        keyHash: sha(key),
      })
      .onConflictDoNothing()
      .returning({ id: studioAgents.id });
    if (!agent) throw new ApiError(409, "That agent name already exists.");
    return Response.json(
      { id: agent.id, key },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
