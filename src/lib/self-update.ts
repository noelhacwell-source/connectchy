import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fetchPublished, isNewer, validSha } from "./update-engine.mjs";

type Published = {
  sha: string;
  notes: { title: string; changes: string[] }[] | null;
  summary: string;
  history: string[];
};

/**
 * In-app updater.
 *
 * Connectchy must offer "Update" however it was started: `npm start`,
 * `npm run dev`, a shortcut, or a bare `next start`. This runs inside the web
 * server itself, so it does not depend on any launcher:
 *   - every 10 minutes it checks the official GitHub main branch,
 *   - the result is in memory, which is what the badge reads,
 *   - clicking Update spawns a detached installer that builds the new revision
 *     beside this process and restarts the app, then exits the current server
 *     so the new one can bind the same port.
 *
 * Nothing here throws into a request: a failed check simply means "no update
 * known right now" and the badge keeps showing the last known state.
 */
export const dataDir = process.env.CONNECTCHY_DATA_DIR || path.resolve(".local-runtime");
const cache = path.join(dataDir, "updates");
const mirror = path.join(cache, "official.git");
const stateFile = path.join(cache, "self-state.json");
const installerLog = path.join(cache, "install.log");
const CHECK_INTERVAL = 10 * 60_000;

export type UpdateState = {
  installed: string;
  available: string | null;
  phase: "checking" | "idle" | "installing" | "error";
  message: string;
  notes: { title: string; changes: string[] }[] | null;
  summary?: string;
  history?: string[];
  checkedAt?: number;
  /** Started by the launcher (scripts/app-updates.mjs), which owns the switcher. */
  managed?: boolean;
};

const globalForUpdate = globalThis as typeof globalThis & {
  __connectchyUpdate?: { state: UpdateState; timer?: NodeJS.Timeout; started: boolean };
};
const box = (globalForUpdate.__connectchyUpdate ??= { state: initial(), started: false });

function initial(): UpdateState {
  return {
    installed: process.env.CONNECTCHY_REVISION ?? "",
    available: null,
    phase: "checking",
    message: "Checking GitHub…",
    notes: null,
  };
}

export function currentState(): UpdateState {
  // The launcher writes status.json and installs on its own; never fight it.
  if (process.env.CONNECTCHY_UPDATE_SIGNAL) {
    return { ...box.state, managed: true, message: box.state.message || "Managed by the Connectchy launcher." };
  }
  return box.state;
}

async function installedRevision() {
  if (process.env.CONNECTCHY_REVISION) return process.env.CONNECTCHY_REVISION;
  try {
    const { stdout } = await promisify(execFile)("git", ["rev-parse", "HEAD"], { windowsHide: true, cwd: process.cwd() });
    const sha = stdout.trim();
    if (validSha(sha)) return sha;
  } catch {
    /* A ZIP download has no git history. */
  }
  return "";
}

export async function checkForUpdate(): Promise<UpdateState> {
  if (process.env.CONNECTCHY_UPDATE_SIGNAL) return currentState();
  box.state = { ...box.state, phase: box.state.phase === "installing" ? "installing" : "checking" };
  try {
    const published: Published = await fetchPublished(mirror, process.cwd());
    const installed = await installedRevision();
    const known = installed || box.state.installed;
    box.state = {
      installed: known,
      // Never offer a release this install already contains (or is newer than).
      available: await isNewer(mirror, process.cwd(), published.sha, known) ? published.sha : null,
      phase: "idle",
      message: "",
      notes: published.notes ?? box.state.notes,
      summary: published.summary,
      history: published.history,
      checkedAt: Date.now(),
    };
  } catch {
    box.state = {
      ...box.state,
      phase: box.state.phase === "installing" ? "installing" : "error",
      message: "Could not reach GitHub. Connectchy keeps working offline.",
      checkedAt: Date.now(),
    };
  }
  await save().catch(() => {});
  return box.state;
}

/** Start the 10-minute checker once per server process. */
export function ensureUpdateWatcher() {
  if (box.started) return;
  box.started = true;
  // A launcher-managed app reports through its own status file.
  if (process.env.CONNECTCHY_UPDATE_SIGNAL) return;
  void checkForUpdate();
  box.timer = setInterval(() => void checkForUpdate(), CHECK_INTERVAL);
  box.timer.unref?.();
}

async function save() {
  await import("node:fs/promises").then((fs) => fs.mkdir(cache, { recursive: true }));
  await import("node:fs/promises").then((fs) =>
    fs.writeFile(stateFile, JSON.stringify({ ...box.state, pid: process.pid, port: process.env.PORT || "3000" })),
  );
}

/**
 * Start the detached installer. It builds the published revision beside this
 * window, then tells this process to exit so the new one can take the port.
 * Returns once the installer is running, so the dialog can show progress.
 */
export async function installUpdate(sha: string, origin: string) {
  if (!validSha(sha)) throw new Error("Refusing an invalid revision.");
  const port = /^\d+$/.test(process.env.PORT ?? "") ? process.env.PORT! : "3000";
  const child = spawn(
    process.execPath,
    [path.join("scripts", "self-update.mjs"), "install", sha, port, origin],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: { ...process.env },
    },
  );
  child.unref();
  box.state = { ...box.state, phase: "installing", message: "Installing the update. Connectchy will restart itself." };
  await save().catch(() => {});
  return { started: true, log: installerLog, pid: child.pid };
}

/** Build slots this updater created, newest last. */
export async function buildSlots() {
  if (!existsSync(cache)) return [];
  const entries = await readdir(cache, { withFileTypes: true });
  const ours = entries.filter((entry) => entry.isDirectory() && /^build-[A-Za-z0-9]{6}$/.test(entry.name));
  return ours.map((entry) => path.join(cache, entry.name));
}
