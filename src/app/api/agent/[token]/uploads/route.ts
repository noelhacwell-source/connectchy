import { modules } from "@/lib/modules";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { project, type Context } from "@/lib/project-api";
import { apiError, ApiError, boundedBody } from "@/lib/http-utils";
import { ASSET_FORMATS, refreshUpload, robloxRequest, uploadKey } from "@/lib/asset-upload";
export const dynamic = "force-dynamic";
export async function GET(req: Request, ctx: Context) {
  try {
    const { conn } = await project(ctx); uploadKey(conn);
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
      if (!/^\d+$/.test(id)) throw new ApiError(400, "Invalid upload ID.");
      return Response.json({ upload: await refreshUpload(conn, Number(id)) });
    }
    return Response.json({ uploads: await db.select().from(uploads).where(eq(uploads.connectionId, conn.id)).orderBy(desc(uploads.id)).limit(50) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return apiError(e); }
}
export async function POST(req: Request, ctx: Context) {
  try {
    const { conn } = await project(ctx), { key, settings } = uploadKey(conn);
    if(conn.paused)throw new ApiError(423,"Project stopped. Resume before starting an upload.");
    const bytes = await boundedBody(req, 21_000_000);
    let form: FormData;
    try { form = await new Response(new Uint8Array(bytes), { headers: { "Content-Type": req.headers.get("content-type") ?? "" } }).formData(); }
    catch { throw new ApiError(400, "Send multipart/form-data with file, name and requestId."); }
    const file = form.get("file"), name = String(form.get("name") ?? "").trim(), requestId = String(form.get("requestId") ?? "");
      await guardAgentRequest(req,conn,form.get("agent"));
    if (!(file instanceof File) || !file.size || file.size > 20_000_000) throw new ApiError(400, "Choose a nonempty supported file up to 20 MB.");
    if (!name || name.length > 50 || !/^[a-zA-Z0-9_-]{1,100}$/.test(requestId)) throw new ApiError(400, "Provide a name (1–50 characters) and unique requestId (letters, numbers, _ or -; up to 100).");
    const format = ASSET_FORMATS[file.name.split(".").at(-1)?.toLowerCase() ?? ""];
    if (!format) throw new ApiError(400, "Supported files: PNG, JPEG, BMP, TGA, FBX, GLB, self-contained glTF, RBXM, RBXMX, MP3, OGG, WAV, FLAC.");
    if(format.type==="Audio"&&!modules(settings.modules).audioUploads)throw new ApiError(403,"Audio uploads are disabled.");
    const [upload] = await db.insert(uploads).values({ connectionId: conn.id, requestId, filename: file.name.slice(0, 255), assetType: format.type }).onConflictDoNothing().returning();
    if (!upload) {
      const [existing] = await db.select().from(uploads).where(and(eq(uploads.connectionId, conn.id), eq(uploads.requestId, requestId)));
      return Response.json({ upload: existing, reused: true });
    }
    const upstream = new FormData();
    upstream.set("request", JSON.stringify({ assetType: format.type, displayName: name, description: String(form.get("description") ?? "").slice(0, 1000), creationContext: { creator: { [settings.creatorType]: settings.creatorId } } }));
    upstream.set("fileContent", new Blob([await file.arrayBuffer()], { type: format.mime }), file.name);
    try {
      const result = await robloxRequest(key, "assets", { method: "POST", body: upstream });
      const operation = typeof result.path === "string" ? result.path : "";
      if (!/^operations\/[a-zA-Z0-9_-]+$/.test(operation)) throw new ApiError(502, "Roblox did not return an operation ID. Check the Roblox dashboard before retrying.");
      const [updated] = await db.update(uploads).set({ operation, state: result.done ? (result.error ? "failed" : "done") : "processing", result }).where(eq(uploads.id, upload.id)).returning();
      return Response.json({ upload: updated }, { status: 202 });
    } catch (e) {
      await db.update(uploads).set({ state: "submission_error", result: { error: e instanceof ApiError ? e.message : "Upload could not be confirmed. Check Roblox before retrying." } }).where(eq(uploads.id, upload.id));
      throw e;
    }
  } catch (e) { return apiError(e); }
}
import { guardAgentRequest } from "@/lib/room-coordination";
