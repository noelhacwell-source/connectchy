/**
 * The public side of the presence counter.
 *
 * Every running copy of Connectchy writes ONE tiny marker file into this
 * repository (presence/<marker>.json) at start-up, and deletes it on a clean
 * stop. The public count is simply the number of marker files on main, so any
 * copy can read it with a single unauthenticated request. Because a marker is
 * only ever added once per install, the count does not grow on restarts.
 *
 * If CONNECTCHY_PRESENCE_REPO / _TOKEN are not configured, every function here
 * becomes a no-op and the dashboard falls back to its own local count.
 */
const repo = process.env.CONNECTCHY_PRESENCE_REPO || "noelhacwell-source/connectchy";
const token = process.env.CONNECTCHY_PRESENCE_TOKEN || "";
const branch = process.env.CONNECTCHY_PRESENCE_BRANCH || "main";
const api = "https://api.github.com";

export const presenceConfigured = () => Boolean(token);

function headers() {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "connectchy-presence",
    "Content-Type": "application/json",
  };
}

const path = (marker: string) => `presence/${marker}.json`;

async function readMarker(marker: string) {
  const response = await fetch(`${api}/repos/${repo}/contents/${path(marker)}?ref=${branch}`, {
    headers: headers(),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub read failed (${response.status}).`);
  return (await response.json()) as { sha: string; content?: string };
}

/** Create the marker once. Returns true when it already existed. */
export async function publishPresence(marker: string, payload: Record<string, unknown>) {
  if (!presenceConfigured()) return false;
  const existing = await readMarker(marker);
  if (existing) return true;
  const response = await fetch(`${api}/repos/${repo}/contents/${path(marker)}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({
      message: `presence: ${marker.slice(0, 8)} online`,
      branch,
      content: Buffer.from(JSON.stringify(payload, null, 2) + "\n").toString("base64"),
    }),
    signal: AbortSignal.timeout(15000),
  });
  // A racing copy may have created it first; that is fine and still counts once.
  if (response.ok || response.status === 422 || response.status === 409) return response.status !== 201;
  throw new Error(`GitHub publish failed (${response.status}).`);
}

export async function removePresence(marker: string) {
  if (!presenceConfigured()) return;
  const existing = await readMarker(marker).catch(() => null);
  if (!existing) return;
  await fetch(`${api}/repos/${repo}/contents/${path(marker)}`, {
    method: "DELETE",
    headers: headers(),
    body: JSON.stringify({ message: `presence: ${marker.slice(0, 8)} left`, branch, sha: existing.sha }),
    signal: AbortSignal.timeout(15000),
  }).catch(() => {});
}

/**
 * Public count: marker files on the branch.
 *
 * A Git tree is content-addressed, so counting the `presence` folder once per
 * distinct tree sha is both exact (no 1,000-file listing cap) and cheap: while
 * the folder does not change, every reader reuses the previous number without
 * another request. This works with or without a token.
 */
type PublicCount = { online: number; known: boolean };
let cached: { treeSha: string; value: PublicCount } | null = null;

export async function readPublicPresence(): Promise<PublicCount> {
  return countMarkers().catch(() => ({ online: 0, known: false }));
}

async function github(headers: Record<string, string>, url: string) {
  const all: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "connectchy-presence" };
  if (presenceConfigured()) all.Authorization = `Bearer ${token}`;
  for (const [key, value] of Object.entries(headers)) all[key] = value;
  return fetch(url, { headers: all, cache: "no-store", signal: AbortSignal.timeout(8000) });
}

async function countMarkers(): Promise<PublicCount> {
  // 1. The current commit on the branch.
  const head = await github({}, `${api}/repos/${repo}/commits/${branch}`);
  if (head.status === 404) return { online: 0, known: true };
  if (!head.ok) return { online: 0, known: false };
  const commit = (await head.json()) as { sha?: string };
  if (!commit.sha) return { online: 0, known: false };

  // 2. That commit's root tree.
  const root = await github({}, `${api}/repos/${repo}/git/trees/${commit.sha}`);
  if (!root.ok) return { online: 0, known: false };
  const tree = (await root.json()) as { tree?: { path: string; type: string; sha: string }[] };
  const folder = tree.tree?.find((entry) => entry.path === "presence" && entry.type === "tree");
  if (!folder) return { online: 0, known: true };

  // 3. Same folder contents as last time? Reuse the count.
  if (cached?.treeSha === folder.sha) return cached.value;

  const inside = await github({}, `${api}/repos/${repo}/git/trees/${folder.sha}`);
  if (!inside.ok) return { online: 0, known: false };
  const listing = (await inside.json()) as { tree?: { path: string; type: string }[]; truncated?: boolean };
  if (!listing.tree || listing.truncated) return { online: 0, known: false };
  const value = { online: listing.tree.filter((entry) => entry.type === "blob" && entry.path.endsWith(".json")).length, known: true };
  cached = { treeSha: folder.sha, value };
  return value;
}
