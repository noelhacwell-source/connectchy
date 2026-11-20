import { clientId } from "./client-id";

/**
 * A random id kept in this browser profile. Download reporting sends it so the
 * dashboard counts one install per browser instead of one per click. It is
 * stored only as a salted hash and can be cleared by clearing site data.
 */
const key = "connectchy:install-id";

export function installId(): string {
  try {
    const saved = localStorage.getItem(key);
    if (saved && /^[A-Za-z0-9_-]{16,64}$/.test(saved)) return saved;
    const created = clientId().replace(/-/g, "");
    localStorage.setItem(key, created);
    return created;
  } catch {
    // Private windows without storage still get an id; it just is not remembered.
    return clientId().replace(/-/g, "");
  }
}

/** Best-effort platform label for the download breakdown. */
export function installPlatform(): string {
  try {
    const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
    if (data?.platform) return data.platform.slice(0, 40);
  } catch {}
  const agent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/Windows/i.test(agent)) return "Windows";
  if (/Android/i.test(agent)) return "Android";
  if (/iPhone|iPad|iPod/i.test(agent)) return "iOS";
  if (/Mac OS X/i.test(agent)) return "macOS";
  if (/Linux/i.test(agent)) return "Linux";
  return "";
}
