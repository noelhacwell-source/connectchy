import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { COMMAND_DOCS } from "@/lib/command-docs";
import { runCommand } from "@/lib/bridge";
import type { Connection } from "@/db/schema";
import { featureSettings } from "@/lib/features";
import { credentials } from "@/lib/project-api";
import { ApiError } from "@/lib/http-utils";

export async function mcpCall(conn: Connection, serverId: string, method: "tools/list" | "tools/call", name?: string, args?: Record<string, unknown>) {
  const settings = featureSettings(conn.features);
  if(method==="tools/call"&&conn.paused)throw new ApiError(423,"Project stopped. Tool calls are blocked until resume.");
  if(method==="tools/call"){const blocked=await agentControlError(conn,args?._agent);if(blocked)throw new ApiError(423,blocked);}
  if (!settings.mcps) throw new ApiError(403, "MCP tools are disabled.");
  if (serverId === "studio") {
    if (method === "tools/list") return { tools: COMMAND_DOCS.map(c => ({ name: c.type, description: `${c.summary} Payload: ${c.payload}. When the room is enabled, edits require a ready role and _agent in arguments.`, inputSchema: { type: "object", properties: { _agent: { type: "string", description: "Your registered room agent name" } }, additionalProperties: true } })) };
    if (!COMMAND_DOCS.some(c => c.type === name)) throw new ApiError(404, "Unknown Studio tool.");
    const { _agent, _room, ...payload } = args ?? {};
    const result = await runCommand(conn, { type: name, payload, agent: _agent, room: _room });
    return { content: [{ type: "text", text: JSON.stringify(result.body) }], isError: result.status >= 400 || (result.status === 200 && (result.body as { ok?: boolean }).ok === false) };
  }
  const server = settings.servers.find(s => s.id === serverId && s.enabled);
  if (!server) throw new ApiError(404, "MCP server not found or disabled.");
  const token = credentials(conn.credentials).tokens?.[server.id];
  const client = new Client({ name: "studio-link", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(45000), redirect: "error" },
  });
  try {
    await client.connect(transport, { timeout: 20000 });
    if (method === "tools/call") return await client.callTool({ name: name!, arguments: args ?? {} }, undefined, { timeout: 45000 });
    const tools = []; let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const result = await client.listTools({ cursor }, { timeout: 20000 });
      tools.push(...result.tools); cursor = result.nextCursor;
      if (!cursor) break;
    }
    return { tools, ...(cursor ? { nextCursor: cursor } : {}) };
  } catch {
    throw new ApiError(502, `Could not ${method === "tools/list" ? "list tools from" : "call tool on"} ${server.name}. Check its Streamable HTTP URL, bearer token, availability and tool arguments. OAuth-only and stdio-only servers are not supported here.`);
  } finally { await client.close().catch(() => {}); }
}
