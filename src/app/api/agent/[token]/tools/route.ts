import { z } from "zod";
import { project, type Context } from "@/lib/project-api";
import { apiError, ApiError, jsonBody } from "@/lib/http-utils";
import { mcpCall } from "@/lib/mcp-bridge";
export const dynamic = "force-dynamic";
export async function GET(req: Request, ctx: Context) {
  try {
    const { conn, settings } = await project(ctx);
    if (!settings.mcps) throw new ApiError(403, "MCP tools are disabled.");
    const id = new URL(req.url).searchParams.get("server");
    if (id) return Response.json(await mcpCall(conn, id, "tools/list"));
    return Response.json({ servers: [{ id: "studio", name: settings.mode==="vscode"?"Visual Studio Code (built in)":"Roblox Studio (built in)" }, ...settings.servers.filter(s => s.enabled).map(({ id, name }) => ({ id, name }))] }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return apiError(e); }
}
export async function POST(req: Request, ctx: Context) {
  try {
    const { conn } = await project(ctx);
    const parsed = z.object({ server: z.string().min(1), name: z.string().min(1), arguments: z.record(z.string(), z.unknown()).default({}) }).safeParse(await jsonBody(req, 950000));
    if (!parsed.success) throw new ApiError(400, "Expected {server, name, arguments:{...}}.");
    return Response.json(await mcpCall(conn, parsed.data.server, "tools/call", parsed.data.name, parsed.data.arguments));
  } catch (e) { return apiError(e); }
}
