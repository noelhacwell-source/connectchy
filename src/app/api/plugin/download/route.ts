import { cleanOrigin, derivePluginKey, findByToken, noStore } from "@/lib/bridge";
import { recordDownload } from "@/lib/download-counter";
import { installIdFrom } from "@/lib/download-request";
import { PLUGIN_RELEASE_VERSION } from "@/lib/download-versions";
import { PLUGIN_CORE } from "@/lib/plugin-core";
import { PLUGIN_HANDLERS } from "@/lib/plugin-handlers";
import { PLUGIN_PLAYTEST } from "@/lib/plugin-playtest";
import {PLUGIN_ADVANCED} from "@/lib/plugin-advanced";

export const dynamic = "force-dynamic";

function asRbxmx(lua: string) {
  const cdata = lua.split("]]>").join("]]]]><![CDATA[>");
  return `<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">
	<Item class="Script" referent="RBX0">
		<Properties>
			<string name="Name">StudioLink</string>
			<ProtectedString name="Source"><![CDATA[${cdata}]]></ProtectedString>
		</Properties>
	</Item>
</roblox>
`;
}

/** POST { token, origin?, format? } -> the plugin file with this connection's address and key baked in. */
export async function POST(req: Request) {
  let body: { token?: unknown; origin?: unknown; format?: unknown; installId?: unknown; platform?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const conn = await findByToken(body.token);
  if (!conn) return Response.json({ error: "Connection not found." }, { status: 404 });
  if (conn.features.mode === "vscode") return Response.json({error:"Use the Visual Studio VSIX extension for this workspace."},{status:400});

  // Studio is on this computer. Only remote agents need the changing tunnel URL.
  const port = /^\d+$/.test(process.env.PORT ?? "") ? process.env.PORT : "3000";
  const origin = cleanOrigin(process.env.PLUGIN_ORIGIN) ?? cleanOrigin(process.env.PUBLIC_ORIGIN)
    ?? `http://127.0.0.1:${port}`;
  if (!origin) {
    return Response.json({ error: "Could not work out this dashboard's address." }, { status: 400 });
  }

  const lua = (PLUGIN_CORE + PLUGIN_PLAYTEST + PLUGIN_ADVANCED + PLUGIN_HANDLERS)
    .replace("__SERVER_URL__", origin)
    .replace("__PLUGIN_KEY__", derivePluginKey(body.token as string));

  // Count the real install: the file is generated only when someone asks for it.
  try {
    await recordDownload({
      installId: installIdFrom(req, body.installId),
      kind: "plugin",
      version: PLUGIN_RELEASE_VERSION,
      platform: typeof body.platform === "string" ? body.platform : null,
      connectionId: conn.id,
    });
  } catch {
    // A counting failure must never block the file the user asked for.
  }

  const rbxmx = body.format !== "lua";
  return new Response(rbxmx ? asRbxmx(lua) : lua, {
    headers: {
      ...noStore,
      "Content-Type": rbxmx ? "application/xml; charset=utf-8" : "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="StudioLink.${rbxmx ? "rbxmx" : "lua"}"`,
    },
  });
}
