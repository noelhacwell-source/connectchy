import { modules } from "@/lib/modules";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { uploads, type Connection } from "@/db/schema";
import { credentials } from "@/lib/project-api";
import { ApiError } from "@/lib/http-utils";
import { featureSettings } from "@/lib/features";
export const ASSET_FORMATS: Record<string, { type: string; mime: string }> = {
  mp3:{type:"Audio",mime:"audio/mpeg"},ogg:{type:"Audio",mime:"audio/ogg"},wav:{type:"Audio",mime:"audio/wav"},flac:{type:"Audio",mime:"audio/flac"},
  png: { type: "Image", mime: "image/png" }, jpg: { type: "Image", mime: "image/jpeg" }, jpeg: { type: "Image", mime: "image/jpeg" },
  bmp: { type: "Image", mime: "image/bmp" }, tga: { type: "Image", mime: "image/tga" },
  fbx: { type: "Model", mime: "model/fbx" }, glb: { type: "Model", mime: "model/gltf-binary" }, gltf: { type: "Model", mime: "model/gltf+json" },
  rbxm: { type: "Model", mime: "model/x-rbxm" }, rbxmx: { type: "Model", mime: "model/x-rbxm" },
};
export function uploadKey(conn: Connection) {
  const f = featureSettings(conn.features), key = credentials(conn.credentials).robloxKey;
  if (!f.uploads) throw new ApiError(403, "Asset uploads are disabled.");
  if (!key || !f.creatorId) throw new ApiError(409, "Owner must configure the Roblox API key and creator ID in Tools & uploads.");
  return { key, settings: f };
}
export async function robloxRequest(key: string, path: string, init?: RequestInit) {
  let response: Response;
  try { response = await fetch(`https://apis.roblox.com/assets/v1/${path}`, { ...init, headers: { "x-api-key": key }, signal: AbortSignal.timeout(45000), redirect: "error" }); }
  catch { throw new ApiError(502, "Roblox did not respond. The upload may have reached Roblox; check its dashboard before retrying with a new request ID."); }
  const text = await response.text();
  let data: Record<string, unknown>;
  try { data = JSON.parse(text); } catch { throw new ApiError(502, "Roblox returned an unexpected response."); }
  if (!response.ok) throw new ApiError(response.status === 429 ? 429 : 502, `Roblox rejected the request (HTTP ${response.status}): ${JSON.stringify(data).slice(0, 1500).replaceAll(key, "[redacted]")}`);
  return data;
}
export async function refreshUpload(conn: Connection, id: number) {
  const { key } = uploadKey(conn);
  const [upload] = await db.select().from(uploads).where(and(eq(uploads.connectionId, conn.id), eq(uploads.id, id)));
  if (!upload) throw new ApiError(404, "Upload not found.");
  if (upload.state !== "processing" || !upload.operation) return upload;
  if (!/^operations\/[a-zA-Z0-9_-]+$/.test(upload.operation)) throw new ApiError(502, "Invalid Roblox operation identifier.");
  const result = await robloxRequest(key, upload.operation);
  const state = result.done ? (result.error ? "failed" : "done") : "processing";
  const [updated] = await db.update(uploads).set({ state, result }).where(eq(uploads.id, upload.id)).returning();
  return updated;
}
