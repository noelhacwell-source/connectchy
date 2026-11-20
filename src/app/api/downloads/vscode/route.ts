import { readFile } from "node:fs/promises";
import path from "node:path";
import { ApiError, apiError, jsonBody, sameOrigin } from "@/lib/http-utils";
import { noStore, sha } from "@/lib/bridge";
import { recordDownload } from "@/lib/download-counter";
import { installIdFrom } from "@/lib/download-request";
import { VSCODE_RELEASE_VERSION } from "@/lib/download-versions";
import { db } from "@/db";
import { connections } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Serves the packaged VS Code extension and counts it. `POST` is used so the
 * browser can tell this server which anonymous install asked for the file;
 * the response is the same VSIX that /downloads/connectchy-vscode.vsix holds.
 */
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const body = await jsonBody(req, 4_000);

    let connectionId: number | null = null;
    if (typeof body.token === "string" && body.token) {
      const [found] = await db
        .select({ id: connections.id })
        .from(connections)
        .where(eq(connections.tokenHash, sha(body.token.slice(0, 200))))
        .limit(1);
      if (!found) throw new ApiError(404, "That workspace link is not valid.");
      connectionId = found.id;
    }

    const file = await readFile(path.join(process.cwd(), "public/downloads/connectchy-vscode.vsix")).catch(() => null);
    if (!file) throw new ApiError(404, "The VS Code extension is not packaged in this install. Run npm run package --prefix extensions/connectchy-vscode.");

    try {
      await recordDownload({
        installId: installIdFrom(req, body.installId),
        kind: "vscode",
        version: VSCODE_RELEASE_VERSION,
        platform: typeof body.platform === "string" ? body.platform : null,
        connectionId,
      });
    } catch {
      // Never block the file because counting failed.
    }

    return new Response(new Uint8Array(file), {
      headers: {
        ...noStore,
        "Content-Type": "application/vsix",
        "Content-Disposition": 'attachment; filename="connectchy-vscode.vsix"',
        "Content-Length": String(file.byteLength),
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
