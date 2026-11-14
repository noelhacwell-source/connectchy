import { cleanOrigin, derivePluginKey, findByToken, noStore } from "@/lib/bridge";
import { PLUGIN_CORE } from "@/lib/plugin-core";
import { PLUGIN_HANDLERS } from "@/lib/plugin-handlers";

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
  let body: { token?: unknown; origin?: unknown; format?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const conn = await findByToken(body.token);
  if (!conn) return Response.json({ error: "Connection not found." }, { status: 404 });

  // Studio is on this computer. Only remote agents need the changing tunnel URL.
  const port = /^\d+$/.test(process.env.PORT ?? "") ? process.env.PORT : "3000";
  const origin = cleanOrigin(process.env.PLUGIN_ORIGIN) ?? cleanOrigin(process.env.PUBLIC_ORIGIN)
    ?? `http://127.0.0.1:${port}`;
  if (!origin) {
    return Response.json({ error: "Could not work out this dashboard's address." }, { status: 400 });
  }

  const lua = (PLUGIN_CORE + PLUGIN_HANDLERS)
    .replace("__SERVER_URL__", origin)
    .replace("__PLUGIN_KEY__", derivePluginKey(body.token as string));

  const rbxmx = body.format !== "lua";
  return new Response(rbxmx ? asRbxmx(lua) : lua, {
    headers: {
      ...noStore,
      "Content-Type": rbxmx ? "application/xml; charset=utf-8" : "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="StudioLink.${rbxmx ? "rbxmx" : "lua"}"`,
    },
  });
}
