import { DEFAULT_FEATURES } from "@/lib/features";
import { publicOrigin } from "@/lib/public-origin";
import { db } from "@/db";
import { connections } from "@/db/schema";
import { cleanOrigin, derivePluginKey, newToken, noStore, sha } from "@/lib/bridge";

export const dynamic = "force-dynamic";

/** Create a connection. The token is returned once; only its hash is stored. */
export async function POST(req: Request) {
  let body: { name?: unknown; origin?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // Name is optional.
  }
  const name = (typeof body.name === "string" ? body.name.trim() : "").slice(0, 60) || "My Roblox game";
  const token = newToken();

  await db.insert(connections).values({
    name,
    features: {...DEFAULT_FEATURES,room:true},
    origin: publicOrigin() ?? cleanOrigin(body.origin),
    tokenHash: sha(token),
    pluginKeyHash: sha(derivePluginKey(token)),
  });

  return Response.json({ token, name }, { status: 201, headers: noStore });
}
