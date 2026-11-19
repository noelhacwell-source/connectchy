import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { ApiError, apiError, jsonBody, ownerRequest } from "@/lib/http-utils";
import installedNotes from "../../../../release-notes.json";
export const dynamic = "force-dynamic";
async function status() {
  if (!process.env.CONNECTCHY_UPDATE_SIGNAL)
    return {
      phase: "offline",
      installed: "",
      available: null,
      notes: installedNotes.releases,
      message: "Start Connectchy with start-windows.cmd to check for updates.",
    };
  return JSON.parse(
    await readFile(
      path.join(
        path.dirname(process.env.CONNECTCHY_UPDATE_SIGNAL),
        "status.json",
      ),
      "utf8",
    ),
  );
}
export async function GET(req: Request) {
  try {
    ownerRequest(req);
    return Response.json(await status(), {
      headers: { "Cache-Control": "no-store" },
    });
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
      !process.env.CONNECTCHY_UPDATE_SIGNAL ||
      typeof sha !== "string" ||
      !/^[a-f0-9]{40}$/.test(sha) ||
      sha !== state.available ||
      !["error", "idle"].includes(state.phase)
    )
      throw new ApiError(409, "This update is unavailable or already running.");
    try {
      await writeFile(
        process.env.CONNECTCHY_UPDATE_SIGNAL,
        JSON.stringify({ sha }),
        { flag: "wx" },
      );
    } catch {
      throw new ApiError(409, "Update already requested.");
    }
    return Response.json({ accepted: true }, { status: 202 });
  } catch (e) {
    return apiError(e);
  }
}
