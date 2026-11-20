import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { ApiError, apiError, jsonBody, ownerRequest } from "@/lib/http-utils";
import installedNotes from "../../../../release-notes.json";
import { checkForUpdate, currentState, ensureUpdateWatcher, installUpdate } from "@/lib/self-update";

export const dynamic = "force-dynamic";

/**
 * The launcher writes its own status file and installs on its own, so when it is
 * in charge this reads that file. Every other way of starting Connectchy
 * (`npm start`, `npm run dev`, `next start`, a shortcut) is served by the in-app
 * updater below, so the Update badge works the same everywhere.
 */
async function status() {
  if (!process.env.CONNECTCHY_UPDATE_SIGNAL) {
    ensureUpdateWatcher();
    return { ...currentState(), notes: currentState().notes ?? installedNotes.releases, managed: false };
  }
  return { managed: true, ...JSON.parse(await readFile(path.join(path.dirname(process.env.CONNECTCHY_UPDATE_SIGNAL), "status.json"), "utf8")) };
}

export async function GET(req: Request) {
  try {
    ownerRequest(req);
    const url = new URL(req.url);
    // A manual refresh asks GitHub again instead of showing the 10-minute cache.
    if (!process.env.CONNECTCHY_UPDATE_SIGNAL && url.searchParams.has("refresh")) await checkForUpdate();
    return Response.json(await status(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: Request) {
  try {
    ownerRequest(req);
    if (
      req.headers.get("origin") !== new URL(req.url).origin &&
      req.headers.get("origin") !== "http://" + req.headers.get("host")
    )
      throw new ApiError(403, "Use the local dashboard.");
    if (!req.headers.get("content-type")?.startsWith("application/json"))
      throw new ApiError(415, "Expected JSON.");
    const { sha } = await jsonBody(req, 200);
    const state = await status();
    if (
      typeof sha !== "string" ||
      !/^[a-f0-9]{40}$/.test(sha) ||
      sha !== state.available ||
      !["error", "idle"].includes(state.phase)
    )
      throw new ApiError(409, "This update is unavailable or already running.");

    if (process.env.CONNECTCHY_UPDATE_SIGNAL) {
      try {
        await writeFile(process.env.CONNECTCHY_UPDATE_SIGNAL, JSON.stringify({ sha }), { flag: "wx" });
      } catch {
        throw new ApiError(409, "Update already requested.");
      }
      return Response.json({ accepted: true }, { status: 202 });
    }

    // Started without the launcher: this server installs and restarts itself.
    const result = await installUpdate(sha, new URL(req.url).origin);
    return Response.json({ accepted: true, mode: "self", ...result }, { status: 202 });
  } catch (e) {
    return apiError(e);
  }
}
