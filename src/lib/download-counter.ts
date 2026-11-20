import { createHash } from "node:crypto";
import { and, countDistinct, eq, max, sql } from "drizzle-orm";
import { db } from "@/db";
import { installDownloads } from "@/db/schema";
import { DOWNLOAD_KINDS, type DownloadKind } from "./download-versions";

/**
 * Install ids never reach the database in the clear: each row holds a salted
 * hash, so the table can count installs but cannot identify anyone.
 */
const salt = process.env.CONNECTCHY_DOWNLOAD_SALT || "connectchy-install-v1";
export const installHash = (installId: string) => createHash("sha256").update(salt + ":" + installId).digest("hex");

export function isInstallId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(value);
}
export function isDownloadKind(value: unknown): value is DownloadKind {
  return typeof value === "string" && (DOWNLOAD_KINDS as readonly string[]).includes(value);
}

export type DownloadRecord = {
  installId: string;
  kind: DownloadKind;
  version?: string | null;
  platform?: string | null;
  connectionId?: number | null;
};

/**
 * Count a download once per install. Repeat downloads of the same kind from the
 * same install update the timestamp instead of inflating the user count, while
 * a separate `downloads` tally keeps the real number of files served.
 */
export async function recordDownload(input: DownloadRecord) {
  const now = new Date();
  const hash = installHash(input.installId);
  const version = input.version ? input.version.slice(0, 40) : null;
  const platform = input.platform ? input.platform.slice(0, 40) : null;
  await db
    .insert(installDownloads)
    .values({
      installHash: hash,
      kind: input.kind,
      version,
      platform,
      connectionId: input.connectionId ?? null,
      firstDownloadedAt: now,
      lastDownloadedAt: now,
      downloads: 1,
    })
    .onConflictDoUpdate({
      target: [installDownloads.installHash, installDownloads.kind],
      set: {
        lastDownloadedAt: now,
        downloads: sql`${installDownloads.downloads} + 1`,
        version: sql`coalesce(${version}, ${installDownloads.version})`,
        platform: sql`coalesce(${platform}, ${installDownloads.platform})`,
        connectionId: sql`coalesce(${input.connectionId ?? null}, ${installDownloads.connectionId})`,
      },
    });
}

export type DownloadCounter = {
  /** Distinct installs that downloaded anything. */
  total: number;
  /** Distinct installs per download kind. */
  byKind: { kind: DownloadKind; installs: number; downloads: number }[];
  /** Every file sent, including repeats from the same install. */
  downloads: number;
  /** New installs per day for the last 30 days. */
  trend: { day: string; installs: number }[];
  lastDownloadAt: string | null;
};

export async function downloadCounter(): Promise<DownloadCounter> {
  const [totals] = await db
    .select({
      total: countDistinct(installDownloads.installHash),
      downloads: sql<number>`coalesce(sum(${installDownloads.downloads}), 0)::int`,
      last: max(installDownloads.lastDownloadedAt),
    })
    .from(installDownloads);

  const kinds = await db
    .select({
      kind: installDownloads.kind,
      installs: countDistinct(installDownloads.installHash),
      downloads: sql<number>`coalesce(sum(${installDownloads.downloads}), 0)::int`,
    })
    .from(installDownloads)
    .groupBy(installDownloads.kind);

  const trend = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${installDownloads.firstDownloadedAt}), 'YYYY-MM-DD')`,
      installs: countDistinct(installDownloads.installHash),
    })
    .from(installDownloads)
    .where(sql`${installDownloads.firstDownloadedAt} > now() - interval '30 days'`)
    .groupBy(sql`date_trunc('day', ${installDownloads.firstDownloadedAt})`)
    .orderBy(sql`date_trunc('day', ${installDownloads.firstDownloadedAt})`);

  return {
    total: Number(totals?.total ?? 0),
    downloads: Number(totals?.downloads ?? 0),
    lastDownloadAt: totals?.last ? new Date(totals.last).toISOString() : null,
    byKind: DOWNLOAD_KINDS.map((kind) => {
      const found = kinds.find((row) => row.kind === kind);
      return { kind, installs: Number(found?.installs ?? 0), downloads: Number(found?.downloads ?? 0) };
    }),
    trend: trend.map((row) => ({ day: row.day, installs: Number(row.installs) })),
  };
}

/** Kinds this install already downloaded, so the UI can say "you count once". */
export async function installsFor(installId: string) {
  if (!isInstallId(installId)) return [] as { kind: string; downloads: number }[];
  return db
    .select({ kind: installDownloads.kind, downloads: installDownloads.downloads })
    .from(installDownloads)
    .where(and(eq(installDownloads.installHash, installHash(installId))));
}
