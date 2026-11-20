import { networkInterfaces } from "node:os";

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function boundedBody(req: Pick<Request, "body" | "headers">, max: number) {
  if (Number(req.headers.get("content-length")) > max) throw new ApiError(413, "Request is too large.");
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  if (reader) for (;;) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.length;
    if (size > max) { await reader.cancel(); throw new ApiError(413, "Request is too large."); }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks);
}
export async function jsonBody(req: Request, max = 150_000) {
  try {
    const value = JSON.parse((await boundedBody(req, max)).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "Expected a JSON object.");
    return value;
  }
  catch (e) { if (e instanceof ApiError) throw e; throw new ApiError(400, "Expected a JSON body."); }
}
export function ownerRequest(req: Request) {
  const host = req.headers.get("host") ?? "";
  const origin = req.headers.get("origin");
  const forwarded = req.headers.get("x-forwarded-for");
  const localAddresses = new Set(["localhost", "127.0.0.1", "::1", "::ffff:127.0.0.1"]);
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      localAddresses.add(entry.address);
      if (entry.family === "IPv4") localAddresses.add(`::ffff:${entry.address}`);
    }
  }
  let hostname = "";
  try { hostname = new URL(`http://${host}`).hostname.replace(/^\[|\]$/g, ""); } catch { /* Reject malformed hosts. */ }
  if (!localAddresses.has(hostname) || req.headers.has("cf-ray") || (forwarded && !localAddresses.has(forwarded)) || req.headers.has("forwarded") || (origin && origin !== `http://${host}` && origin !== `https://${host}`)) {
    throw new ApiError(403, "Manage settings from this computer's local dashboard using localhost or its local IP address. Public agent links cannot change owner settings.");
  }
}
/**
 * Reject cross-site form posts to counting routes. Unlike ownerRequest this also
 * accepts genuinely public agent links, because downloads may be counted there.
 */
export function sameOrigin(req: Request) {
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) return;
  const host = req.headers.get("host");
  const origin = req.headers.get("origin");
  if (!host) return;
  if (origin && origin !== `http://${host}` && origin !== `https://${host}`)
    throw new ApiError(403, "Use this dashboard to download.");
  const site = req.headers.get("sec-fetch-site");
  if (!origin && site && !["same-origin", "none"].includes(site))
    throw new ApiError(403, "Use this dashboard to download.");
}
export function apiError(error: unknown) {
  return Response.json({ ok: false, error: error instanceof ApiError ? error.message : "Request failed. Check the app log for details." }, { status: error instanceof ApiError ? error.status : 500, headers: { "Cache-Control": "no-store" } });
}
