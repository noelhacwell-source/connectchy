import path from "node:path";
import { readFile, unlink } from "node:fs/promises";
import { ApiError, apiError, jsonBody } from "@/lib/http-utils";
import { dataDir } from "@/lib/self-update";

export const dynamic = "force-dynamic";

const tokenFile = path.join(dataDir, "updates", "exit-token");

/**
 * Called by the detached installer just before it starts the new revision: this
 * process releases the port so the updated app can bind it.
 *
 * The installer writes a single-use random token into the runtime folder and
 * sends it back with the request, so only a process that can write inside this
 * application's own data folder can ask the server to exit. That keeps working
 * behind the public tunnel, a proxy or a custom host name, where a host-header
 * check would refuse a legitimate local request.
 */
export async function POST(req: Request) {
  try {
    const body = await jsonBody(req, 500);
    if (body.action !== "exit") throw new ApiError(400, "Unknown action.");

    let expected = "";
    try {
      expected = (await readFile(tokenFile, "utf8")).trim();
    } catch {
      throw new ApiError(403, "The update installer did not ask for a restart.");
    }
    if (!expected || expected !== String(body.token ?? "")) throw new ApiError(403, "The update installer did not ask for a restart.");

    // One request only: the token cannot be reused.
    await unlink(tokenFile).catch(() => {});
    // Answer first, then exit, so the installer sees a clean response.
    setTimeout(() => process.exit(0), 250);
    return Response.json({ ok: true, exiting: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(e);
  }
}
