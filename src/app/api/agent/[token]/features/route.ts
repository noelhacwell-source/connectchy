import { DEFAULT_MODULES } from "@/lib/modules";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { connections } from "@/db/schema";
import { apiError, ApiError, jsonBody, ownerRequest } from "@/lib/http-utils";
import { credentials, project, type Context } from "@/lib/project-api";
import { seal } from "@/lib/secrets";
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/);
const schema = z.object({
  modules: z.record(z.string(),z.boolean()).default(DEFAULT_MODULES),
  room: z.boolean(), uploads: z.boolean(), mcps: z.boolean(), skills: z.boolean(),
  creatorType: z.enum(["userId", "groupId"]), creatorId: z.string().regex(/^\d{0,24}$/),
  servers: z.array(z.object({ id, name: z.string().min(1).max(100), url: z.url().max(2000).refine(s => { const u = new URL(s); return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password; }, "Use an HTTP(S) MCP URL without embedded credentials."), enabled: z.boolean() })).max(20),
  customSkills: z.array(z.object({ id, name: z.string().min(1).max(100), description: z.string().max(500), instructions: z.string().min(1).max(20000), enabled: z.boolean() })).max(30),
  disabledBuiltinSkills: z.array(id).max(20),
});
export async function GET(req: Request, ctx: Context) {
  try {
    ownerRequest(req);
    const { conn, settings } = await project(ctx), secret = credentials(conn.credentials);
    return Response.json({ settings, robloxKeySet: !!secret.robloxKey, tokenSet: Object.keys(secret.tokens ?? {}) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return apiError(e); }
}
export async function PATCH(req: Request, ctx: Context) {
  try {
    ownerRequest(req);
    const { conn } = await project(ctx), body = await jsonBody(req, 750000);
    const parsed = schema.safeParse(body.settings);
    if (!parsed.success) throw new ApiError(400, parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "));
    const settings = { ...parsed.data, modules: { ...DEFAULT_MODULES, ...parsed.data.modules } };
    if (settings.servers.some(s => s.id === "studio") || new Set(settings.servers.map(s => s.id)).size !== settings.servers.length || new Set(settings.customSkills.map(s => s.id)).size !== settings.customSkills.length || settings.customSkills.some(s => ["inspect-first", "roblox-ui", "coordinate"].includes(s.id))) throw new ApiError(400, "Server and skill IDs must be unique; studio is reserved.");
    if(Object.keys(settings.modules).some(key=>!(key in DEFAULT_MODULES)))throw new ApiError(400,"Unknown workspace feature.");
    if(settings.modules.protectedPaths&&(!settings.room||!settings.modules.rolePlanning))throw new ApiError(400,"Protected paths require communication and role planning. Disable protected paths first to turn those off.");
    const secret = credentials(conn.credentials);
    if (body.clearRobloxKey === true) delete secret.robloxKey;
    if (typeof body.robloxKey === "string" && body.robloxKey.trim()) {
      if (body.robloxKey.length > 10000) throw new ApiError(400, "API key is too long.");
      secret.robloxKey = body.robloxKey.trim();
    }
    secret.tokens ??= {};
    for (const server of settings.servers) {
      const token = body.tokens?.[server.id];
      if (typeof token === "string") {
        if (token.length > 10000) throw new ApiError(400, "Bearer token is too long.");
        if (token.trim()) secret.tokens[server.id] = token.trim(); else delete secret.tokens[server.id];
      }
    }
    for (const key of Object.keys(secret.tokens)) if (!settings.servers.some(s => s.id === key)) delete secret.tokens[key];
    if (settings.uploads && (!secret.robloxKey || !settings.creatorId)) throw new ApiError(400, "Enter your Roblox API key and creator ID before enabling uploads.");
    await db.update(connections).set({ features: settings, credentials: seal(JSON.stringify(secret)) }).where(eq(connections.id, conn.id));
    return Response.json({ ok: true, settings, robloxKeySet: !!secret.robloxKey, tokenSet: Object.keys(secret.tokens) });
  } catch (e) { return apiError(e); }
}
