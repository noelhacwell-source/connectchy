import { ApiError, apiError, jsonBody, sameOrigin } from "@/lib/http-utils";
import { noStore } from "@/lib/bridge";
import { forgetPresence, isInstallId, onlineHere, ownsMarker, signalFor, touchPresence } from "@/lib/presence";
import { presenceConfigured, publishPresence, readPublicPresence, removePresence } from "@/lib/presence-github";

export const dynamic = "force-dynamic";

type Public = { online: number; source: "github" | "local" | "empty"; published: boolean; updatedAt: string };

/**
 * GET /api/presence - the live number shown at the top of every workspace.
 *
 * The dashboard asks GitHub for the public marker files. "Online" is the real
 * number of running copies that have checked in, so it visibly goes up and down
 * as people open and close Connectchy. When GitHub is unconfigured or
 * unreachable it reports this dashboard's own count and says so.
 */
export async function GET() {
  try {
    const [local, remote] = await Promise.all([
      onlineHere().catch(() => 0),
      readPublicPresence().catch(() => ({ online: 0, known: false })),
    ]);
    // GitHub is the public truth whenever it answers; the local count is only a
    // fallback for an unconfigured or unreachable service.
    const source: Public["source"] = remote.known ? "github" : "local";
    return Response.json(
      {
        online: source === "github" ? remote.online : local,
        local,
        source,
        published: presenceConfigured(),
        updatedAt: new Date().toISOString(),
      } satisfies Public & { local: number },
      { headers: noStore },
    );
  } catch (e) {
    return apiError(e);
  }
}

/**
 * POST /api/presence - a running copy checks in (every 30 seconds).
 *
 * The first check-in also publishes this copy's public marker to GitHub, so the
 * copy counts once no matter how often it restarts. `stop: true` removes the
 * marker when the app shuts down cleanly.
 */
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const body = await jsonBody(req, 2_000);
    if (!isInstallId(body.installId)) throw new ApiError(400, "Missing this copy's install id.");

    if (body.stop === true) {
      const marker = signalFor(body.installId);
      await removePresence(marker).catch(() => {});
      return Response.json({ ok: true }, { headers: noStore });
    }

    await touchPresence(body.installId);

    // Publish once; a failure here must never stop the dashboard from working.
    let published = false;
    if (presenceConfigured()) {
      const marker = signalFor(body.installId);
      const version = typeof body.version === "string" ? body.version.slice(0, 40) : null;
      published = await publishPresence(marker, {
        version,
        firstSeen: new Date().toISOString().slice(0, 10),
        note: "An anonymous Connectchy install marker. No account, IP address or machine name is stored.",
      }).catch(() => false);
    }

    return Response.json({ ok: true, published, here: await onlineHere() }, { status: 201, headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}

/** DELETE /api/presence - leave the live view immediately. */
export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    const url = new URL(req.url);
    const installId = url.searchParams.get("installId");
    if (!isInstallId(installId)) throw new ApiError(400, "Missing this copy's install id.");
    const marker = signalFor(installId);
    await forgetPresence(installId).catch(() => {});
    await removePresence(marker).catch(() => {});
    return Response.json({ ok: true, mine: await ownsMarker(installId, marker) }, { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}
