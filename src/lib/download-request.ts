import { randomBytes } from "node:crypto";

export const INSTALL_ID_COOKIE = "connectchy_install";

/**
 * Every install needs a stable, anonymous id. Browsers normally send the one in
 * localStorage; when a plain link download sends nothing we fall back to a
 * cookie or a one-off random id, so a real download is never dropped from the
 * count just because the caller forgot to include it.
 */
export function installIdFrom(req: Request, provided?: unknown): string {
  if (typeof provided === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(provided)) return provided;
  const cookie = req.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === INSTALL_ID_COOKIE) {
      const value = rest.join("=");
      if (/^[A-Za-z0-9_-]{16,64}$/.test(value)) return value;
    }
  }
  return randomBytes(18).toString("base64url");
}
