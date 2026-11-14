import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { project, type Context } from "@/lib/project-api";
import { apiError, ApiError, boundedBody } from "@/lib/http-utils";
import { mcpCall } from "@/lib/mcp-bridge";
export const dynamic = "force-dynamic";
export async function POST(req: Request, ctx: Context) {
  let server: Server | undefined;
  try {
    const { conn, settings } = await project(ctx);
    if (!settings.mcps) throw new ApiError(403, "MCP tools are disabled.");
    server = new Server({ name: "studio-link", version: "1.0.0" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const result = await mcpCall(conn, "studio", "tools/list");
      return result;
    });
    server.setRequestHandler(CallToolRequestSchema, async request => {
      return await mcpCall(conn, "studio", "tools/call", request.params.name, request.params.arguments);
    });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    const body = await boundedBody(req, 950000);
    return await transport.handleRequest(new Request(req.url, { method: "POST", headers: req.headers, body: new Uint8Array(body) }));
  } catch (e) { return apiError(e); }
  finally { await server?.close(); }
}
