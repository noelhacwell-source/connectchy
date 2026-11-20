import { randomUUID, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Tells this repository that another copy of Connectchy is running, without the
 * owner doing anything. The id is random and stays on this computer; only a
 * hash-derived marker ever leaves it, and it is published once per install.
 *
 * This runs beside the app, so it must never break startup: every failure is
 * swallowed and the dashboard simply falls back to its local count.
 */
const dir = path.resolve(".local-runtime");
const idFile = path.join(dir, "install-id");
const markerFile = path.join(dir, "presence-marker");

function installId() {
  try {
    const saved = readFileSync(idFile, "utf8").trim();
    if (/^[A-Za-z0-9_-]{16,64}$/.test(saved)) return saved;
  } catch {
    /* First run on this computer. */
  }
  const created = randomUUID().replace(/-/g, "");
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(idFile, created, { mode: 0o600 });
  } catch {
    /* Without storage the copy is still counted, just not deduplicated later. */
  }
  return created;
}

export const presenceMarker = () =>
  createHash("sha256").update("connectchy-signal:" + installId()).digest("base64url").slice(0, 32);

function markerKnown() {
  try {
    return existsSync(markerFile);
  } catch {
    return false;
  }
}

function remember() {
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(markerFile, new Date().toISOString());
  } catch {
    /* Not fatal: worst case the marker is re-checked next start. */
  }
}

/** Read the public number of running copies from GitHub. */
export async function publicOnline() {
  const repo = process.env.CONNECTCHY_PRESENCE_REPO || "noelhacwell-source/connectchy";
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/contents/presence?ref=main`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "connectchy-presence" },
      signal: AbortSignal.timeout(6000),
    });
    if (response.status === 404) return { online: 0, known: true };
    if (!response.ok) return null;
    const entries = await response.json();
    return { online: entries.filter((entry) => entry.type === "file" && entry.name.endsWith(".json")).length, known: true };
  } catch {
    return null;
  }
}

/**
 * Sends the check-in to the dashboard. The dashboard forwards it to GitHub when
 * it has a token; the launcher never holds a GitHub credential itself.
 */
export async function checkIn(port = process.env.PORT || "3000") {
  const marker = presenceMarker();
  const payload = JSON.stringify({
    installId: installId(),
    version: process.env.CONNECTCHY_REVISION?.slice(0, 7) ?? "dev",
    first: !markerKnown(),
  });
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/presence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        signal: AbortSignal.timeout(4000),
      });
      if (response.ok) {
        remember();
        return true;
      }
    } catch {
      /* The app is still starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return false;
}

/** Leaves the public counter when the owner stops Connectchy normally. */
export async function checkOut(port = process.env.PORT || "3000") {
  try {
    await fetch(`http://127.0.0.1:${port}/api/presence?installId=${installId()}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    /* GitHub removes stale markers on its own schedule. */
  }
}
