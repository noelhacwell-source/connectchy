import { createHash } from "node:crypto";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { liveInstalls } from "@/db/schema";

/** A copy counts as online while it has checked in within this window. */
export const ONLINE_WINDOW_SECONDS = 90;

const salt = process.env.CONNECTCHY_PRESENCE_SALT || "connectchy-presence-v1";
const digest = (prefix: string, value: string) => createHash("sha256").update(salt + ":" + prefix + ":" + value).digest("hex");

export function isInstallId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(value);
}

/** A random id for the public signal, kept locally and never linked to the install id. */
export function signalFor(installId: string) {
  return createHash("sha256").update("connectchy-signal:" + installId).digest("base64url").slice(0, 32);
}

export function signalHash(id: string) {
  return digest("signal", id);
}

export async function touchPresence(installId: string) {
  const now = new Date();
  await db
    .insert(liveInstalls)
    .values({ installHash: digest("install", installId), signalHash: signalHash(signalFor(installId)), lastSeenAt: now })
    .onConflictDoUpdate({ target: liveInstalls.installHash, set: { lastSeenAt: now } });
  // Keep the table tiny; anything long gone is not interesting.
  await db.delete(liveInstalls).where(lt(liveInstalls.lastSeenAt, new Date(Date.now() - 86_400_000)));
}

export async function onlineHere() {
  const [row] = await db
    .select({ online: count() })
    .from(liveInstalls)
    .where(gt(liveInstalls.lastSeenAt, new Date(Date.now() - ONLINE_WINDOW_SECONDS * 1000)));
  return Number(row?.online ?? 0);
}

/** Public per-install markers: one tiny file per running copy. No ids, no people data. */
export async function presenceMarkers() {
  const rows = await db
    .select({ signalHash: liveInstalls.signalHash })
    .from(liveInstalls)
    .where(gt(liveInstalls.lastSeenAt, new Date(Date.now() - ONLINE_WINDOW_SECONDS * 1000)));
  return rows.map((row) => row.signalHash);
}

/** Does this marker belong to the running copy asking? Used for self-verification only. */
export async function ownsMarker(installId: string, marker: string) {
  return signalFor(installId) === marker;
}

export async function forgetPresence(installId: string) {
  await db.delete(liveInstalls).where(and(eq(liveInstalls.installHash, digest("install", installId))));
}
