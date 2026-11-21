import { readFile, writeFile, rename, mkdir, mkdtemp, unlink, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile, execSync, spawn } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

/**
 * The update engine, shared by every way of starting Connectchy.
 *
 * It answers three questions for the dashboard, no matter how the app was
 * launched: which revision is running, which revision GitHub publishes, and how
 * to install that revision safely (build beside the running app, switch, verify,
 * and fall back to the previous build on any failure).
 */
const exec = promisify(execFile);
export const OFFICIAL_REPO = process.env.CONNECTCHY_UPDATE_REPO || "https://github.com/noelhacwell-source/connectchy.git";
/** Branch that holds published releases (overridable for testing). */
export const OFFICIAL_BRANCH = process.env.CONNECTCHY_UPDATE_BRANCH || "main";
export const validSha = (s) => typeof s === "string" && /^[0-9a-f]{40}$/.test(s);

export async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

export async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = file + "." + randomUUID();
  await writeFile(tmp, JSON.stringify(value));
  await rename(tmp, file);
}

export function git(args, cwd) {
  return exec("git", ["-c", "credential.interactive=false", ...args], {
    cwd,
    windowsHide: true,
    timeout: 60000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).then((r) => r.stdout.trim());
}

export function runNode(args, cwd, log = null) {
  const p = spawn(process.execPath, args, {
    cwd,
    stdio: log ? ["ignore", "pipe", "pipe"] : "inherit",
    windowsHide: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  if (log) {
    p.stdout?.on("data", (chunk) => log(String(chunk).trimEnd()));
    p.stderr?.on("data", (chunk) => log(String(chunk).trimEnd()));
  }
  return once(p, "exit").then(([code]) => {
    if (code !== 0) throw Error("Build command exited with " + code);
  });
}

/**
 * npm's CLI entry point. The app may be started by a shortcut, a service or a
 * bare `next start`, so npm is not always on PATH. Try: the npm that started us,
 * npm beside this Node, npm on PATH, and the usual global locations.
 */
export function npmCli() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  const installedCli = candidates.find(candidate => candidate && existsSync(candidate));
  if (installedCli) return installedCli;
  for (const name of ["npm", "npm.cmd"]) {
    try {
      const found = execSync(`${name} --version`, { windowsHide: true, stdio: "pipe", encoding: "utf8", timeout: 15000 }).trim();
      if (/^\d+\./.test(found)) {
        const stdout = execSync(`${name} root -g`, { windowsHide: true, stdio: "pipe", encoding: "utf8", timeout: 15000 });
        candidates.push(path.join(stdout.trim(), "npm", "bin", "npm-cli.js"));
      }
    } catch {
      /* Not on PATH under this name. */
    }
  }
  for (const candidate of candidates) {
    // Build-time tracing cannot follow these paths; they are only probed at run time.
    if (candidate && existsSync(/*turbopackIgnore: true*/ candidate)) return candidate;
  }
  // Last resort: let the shell resolve npm; a failure is reported in the log.
  return "npm";
}

/**
 * Fetch the published revision, its changelog and its commit subject into a
 * bare mirror. Returns null when the repository cannot be read (offline).
 */
export async function fetchPublished(mirror, root) {
  if (!existsSync(mirror)) await git(["init", "--bare", mirror], root);
  await git(["fetch", "--depth=30", "--no-tags", OFFICIAL_REPO, `+refs/heads/${OFFICIAL_BRANCH}:refs/heads/published`], mirror);
  const sha = await git(["rev-parse", "refs/heads/published"], mirror);
  if (!validSha(sha)) throw Error("Invalid published revision.");
  let notes = null;
  try {
    notes = JSON.parse(await git(["show", sha + ":release-notes.json"], mirror)).releases;
  } catch {
    notes = null;
  }
  const summary = await git(["log", "-1", "--format=%s", sha], mirror);
  const history = (await git(["log", "--first-parent", "-15", "--format=%s", sha], mirror)).split("\n");
  return { sha, notes, summary, history };
}

/**
 * Is `published` genuinely newer than `installed`?
 *
 * Only the published branch head can be downloaded, so a copy that already
 * contains it (a build made after the release, or a newer branch) must never be
 * told to "update" to something older. When the two commits cannot be compared
 * the update is offered, because missing a real update is the worse mistake.
 */
export async function isNewer(mirror, root, published, installed) {
  if (!validSha(published)) return false;
  // An abbreviated revision (a short commit hash in a launch script) is still a
  // real answer; only give up when the installed revision is unknown.
  if (!/^[0-9a-f]{7,40}$/.test(String(installed ?? "")) || installed === published) return false;
  if (String(installed).length !== 40) {
    const full = await git(["rev-parse", "--verify", `${installed}^{commit}`], mirror).catch(() => "");
    if (validSha(full)) installed = full;
  }
  const contains = async () => {
    try {
      await git(["merge-base", "--is-ancestor", published, installed], mirror);
      return true; // `installed` already includes `published`.
    } catch {
      return false;
    }
  };
  const known = async () => {
    try {
      await git(["cat-file", "-e", `${installed}^{commit}`], mirror);
      return true;
    } catch {
      return false;
    }
  };
  // The mirror only has the published branch; ask for the installed commit too.
  if (!(await known())) await git(["fetch", "--depth=1", OFFICIAL_REPO, installed], mirror).catch(() => {});
  if (await contains()) return false;
  // A commit git has never seen cannot be compared; offer the update.
  return true;
}

/** Clone one published revision into its own build slot and install + build it. */
export async function buildRevision({ mirror, cache, root, sha, onProgress = () => {}, log = null }) {
  if (!validSha(sha)) throw Error("Refusing an invalid revision.");
  const next = await mkdtemp(path.join(cache, "build-"));
  await git(["clone", "--no-checkout", "--no-hardlinks", mirror, next], root);
  await git(["checkout", "--detach", sha], next);
  await onProgress("Installing dependencies…", 25);
  await runNode([npmCli(), "ci", "--include=dev", "--no-audit", "--no-fund"], next, log);
  await onProgress("Building Connectchy…", 50);
  await runNode([npmCli(), "run", "build"], next, log);
  if (!existsSync(path.join(next, ".next", "BUILD_ID"))) {
    throw Error("The new version did not produce a build.");
  }
  return next;
}

/** Only remove build slots this updater created; keep what is in use. */
export async function pruneBuilds(cache, keep) {
  for (const entry of await readdir(cache, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^build-[A-Za-z0-9]{6}$/.test(entry.name)) continue;
    const directory = path.resolve(cache, entry.name);
    if (path.dirname(directory) !== path.resolve(cache) || keep.includes(directory)) continue;
    await rm(directory, { recursive: true, force: true, maxRetries: 2 }).catch(() => {});
  }
}

/** Refuse concurrent installs and stale requests. */
export function updateRequestGuard({ signal }) {
  return async function accept(sha, state) {
    if (!signal) return "no-signal";
    if (!validSha(sha)) return "bad-sha";
    if (sha !== state.available) return "unavailable";
    if (!["error", "idle"].includes(state.phase)) return "running";
    try {
      await writeFile(signal, JSON.stringify({ sha }), { flag: "wx" });
      return "accepted";
    } catch {
      return "duplicate";
    }
  };
}

export async function clearSignal(signal) {
  await unlink(signal).catch(() => {});
}
