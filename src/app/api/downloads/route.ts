import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { connections } from "@/db/schema";
import { ApiError, apiError, jsonBody, sameOrigin } from "@/lib/http-utils";
import { noStore, sha } from "@/lib/bridge";
import { downloadCounter, installsFor, isDownloadKind, isInstallId, recordDownload } from "@/lib/download-counter";

export const dynamic = "force-dynamic";

/**
 * Real download counter. Every value comes from `install_downloads`, which the
 * dashboard writes when this server actually hands out a plugin or extension
 * file - see POST /api/plugin/download and POST /api/downloads/vscode.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const installId = url.searchParams.get("installId");
    const [counter, mine] = await Promise.all([downloadCounter(), installsFor(installId ?? "")]);
    return Response.json(
      {
        ...counter,
        counted: mine.map((row) => row.kind),
        previousDownloads: Object.fromEntries(mine.map((row) => [row.kind, Number(row.downloads)])),
      },
      { headers: noStore },
    );
  } catch (e) {
    return apiError(e);
  }
}

/**
 * The browser reports a download that a plain link or a generated file started,
 * because the server cannot always see those. `installId` is the browser's
 * random install id and is stored only as a salted hash.
 */
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const body = await jsonBody(req, 4_000);
    if (!isInstallId(body.installId)) throw new ApiError(400, "Missing this browser's install id.");
    if (!isDownloadKind(body.kind)) throw new ApiError(400, "Unknown download kind.");
    if (body.version !== undefined && typeof body.version !== "string") throw new ApiError(400, "Unexpected version.");

    // A workspace link may prove which project the download belongs to, but it is optional.
    let connectionId: number | null = null;
    if (typeof body.token === "string" && body.token) {
      const [found] = await db
        .select({ id: connections.id })
        .from(connections)
        .where(and(eq(connections.tokenHash, sha(body.token.slice(0, 200)))))
        .limit(1);
      if (!found) throw new ApiError(404, "That workspace link is not valid.");
      connectionId = found.id;
    }

    await recordDownload({
      installId: body.installId,
      kind: body.kind,
      version: typeof body.version === "string" ? body.version : null,
      platform: typeof body.platform === "string" ? body.platform : null,
      connectionId,
    });
    return Response.json({ ok: true, ...(await downloadCounter()) }, { status: 201, headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}
