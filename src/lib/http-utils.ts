export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function boundedBody(req: Request, max: number) {
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
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) || req.headers.has("cf-ray") || (forwarded && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(forwarded)) || req.headers.has("forwarded") || (origin && origin !== `http://${host}` && origin !== `https://${host}`)) {
    throw new ApiError(403, "Manage settings from the local dashboard on this computer (http://127.0.0.1:3000). Agents cannot change credentials or enable integrations.");
  }
}
export function apiError(error: unknown) {
  return Response.json({ ok: false, error: error instanceof ApiError ? error.message : "Request failed. Check the app log for details." }, { status: error instanceof ApiError ? error.status : 500, headers: { "Cache-Control": "no-store" } });
}
