import path from "node:path";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile, appendFile, readdir, readFile, rm, unlink } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import "dotenv/config";
import {
  buildRevision,
  git,
  OFFICIAL_REPO,
  OFFICIAL_BRANCH,
  pruneBuilds,
  writeJsonAtomic,
  readJson,
  validSha,
} from "../src/lib/update-engine.mjs";

/**
 * Detached installer, started by the app when the owner clicks Update.
 *
 *  1. build the published revision in its own folder (the running app keeps
 *     serving the whole time),
 *  2. ask the running server to exit so the port is free,
 *  3. start the new revision, wait until /api/health reports it,
 *  4. forget the previous build.
 *
 * If anything fails, the running app is restarted unchanged and the failure is
 * written to the log, so a bad publish can never leave someone without a
 * working Connectchy.
 */
const dataDir = process.env.CONNECTCHY_DATA_DIR || path.resolve(".local-runtime");
const cache = path.join(dataDir, "updates");
const mirror = path.join(cache, "official.git");
const pointer = path.join(cache, "active.json");
const statusFile = path.join(cache, "status.json");
const logFile = path.join(cache, "install.log");
const tokenFile = path.join(cache, "exit-token");

const [, , command, sha, port = "3000", origin = `http://127.0.0.1:${port}`] = process.argv;

async function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await mkdir(cache, { recursive: true }).catch(() => {});
  await appendFile(logFile, line).catch(() => {});
  process.stdout.write(line);
}

/**
 * The app starts this script detached with no console attached, so an
 * unexpected failure would otherwise disappear and leave the badge stuck.
 * Anything that slips through is written to the same log, and the app is told
 * to keep running as it was.
 */
process.on("uncaughtException", (error) => {
  void log("Installer stopped: " + (error?.stack || error?.message || String(error)))
    .then(() => publish({ phase: "error", message: "The update stopped unexpectedly. Connectchy keeps running." }))
    .catch(() => {})
    .finally(() => process.exit(1));
});
process.on("unhandledRejection", (reason) => {
  void log("Installer stopped: " + (reason?.stack || reason?.message || String(reason)))
    .then(() => publish({ phase: "error", message: "The update stopped unexpectedly. Connectchy keeps running." }))
    .catch(() => {})
    .finally(() => process.exit(1));
});

async function publish(patch) {
  const current = (await readJson(statusFile)) ?? {};
  await writeJsonAtomic(statusFile, {
    installed: current.installed ?? "",
    available: current.available ?? null,
    phase: "idle",
    message: "",
    notes: current.notes ?? null,
    ...current,
    ...patch,
  });
}

async function waitForExit(timeout = 25000) {
  // The running server exits by itself once the installer asks it to.
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1200) });
    } catch {
      return true;
    }
    await delay(400);
  }
  return false;
}

async function ready(revision, timeout = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1500) });
      if (response.ok && (await response.json()).revision === revision) return true;
    } catch {
      /* Not up yet. */
    }
    await delay(400);
  }
  return false;
}

function start(revision, cwd) {
  const child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", String(port)],
    {
      cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: { ...process.env, CONNECTCHY_DATA_DIR: dataDir, CONNECTCHY_REVISION: revision },
    },
  );
  child.unref();
  return child;
}

/**
 * Ask the running server to stop so this revision can take the port.
 *
 * The process that actually holds the port is the `next start` child, not the
 * wrapper, so it is targeted by port rather than by process tree: on Windows
 * `netstat` + `taskkill /T`, elsewhere `lsof`/`fuser`. The polite HTTP request
 * is tried first because it lets the server close cleanly.
 */
async function askToExit() {
  // Prove to the running server that this is its own installer: a single-use
  // token inside the application's runtime folder, not anything about headers.
  const token = randomBytes(24).toString("hex");
  await writeFile(tokenFile, token, { mode: 0o600 }).catch(() => {});
  await log("Asking the running server to stop.");
  let answer = "";
  try {
    const response = await fetch(`${origin}/api/self-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "exit", token }),
      signal: AbortSignal.timeout(4000),
    });
    answer = String(response.status);
  } catch (error) {
    answer = "no answer (" + error.message + ")";
  }
  await unlink(tokenFile).catch(() => {});
  await log("Exit request answered with " + answer + ".");
  // Give the old server a moment to let go of the port by itself.
  for (let i = 0; i < 20; i++) {
    if (await portFree()) return;
    await delay(500);
  }
  await log("Port " + port + " is still busy; stopping the process that holds it.");
  await freePort();
}

async function portFree() {
  // Ask the OS whether anything still listens on the port; fall back to a
  // health request where the OS cannot tell us.
  const pids = listenerPids(port);
  if (pids.length) return false;
  try {
    await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1200) });
    return false;
  } catch {
    return true;
  }
}

/**
 * PIDs listening on a TCP port, using only what the OS always provides.
 *
 * The result is always validated: only real, still-existing processes other
 * than this one are returned. Killing PID 0 or 1 (or a negative number) would
 * take down this installer — or the machine — so those are never passed on.
 */
function listenerPids(port) {
  const desired = Number(port);
  const safe = (value) => {
    const pid = Number(value);
    // PID 0 means "my whole process group" and PID 1 is the system; never those.
    if (!Number.isInteger(pid) || pid < 2 || pid === process.pid) return false;
    try {
      process.kill(pid, 0); // Signals nothing; throws when the process is gone.
      return true;
    } catch {
      return false;
    }
  };
  const run = (command, args) => {
    try {
      return execFileSync(command, args, { windowsHide: true, encoding: "utf8", stdio: "pipe", timeout: 15000 });
    } catch {
      return "";
    }
  };

  if (process.platform === "win32") {
    const pids = [];
    for (const line of run("netstat", ["-ano", "-p", "TCP"]).split("\n")) {
      const columns = line.trim().split(/\s+/);
      if (!/LISTENING/i.test(line) || !columns[1]?.endsWith(`:${desired}`)) continue;
      const pid = columns[columns.length - 1];
      if (/^\d+$/.test(pid ?? "")) pids.push(Number(pid));
    }
    return [...new Set(pids)].filter(safe);
  }

  // Linux and macOS: map the listening socket's inode back to its process.
  const inodes = new Set();
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let table = "";
    try {
      table = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of table.split("\n").slice(1)) {
      const columns = line.trim().split(/\s+/);
      if (columns.length < 10 || columns[3] !== "0A") continue; // 0A = LISTEN
      if (parseInt(columns[1].split(":").pop(), 16) === desired) inodes.add(columns[9]);
    }
  }
  const pids = [];
  if (inodes.size) {
    for (const entry of run("ls", ["/proc"]).split("\n")) {
      if (!/^\d+$/.test(entry)) continue;
      const target = inodes.size
        ? run("ls", [`/proc/${entry}/fd`])
            .split("\n")
            .filter(Boolean)
            .map((fd) => run("readlink", [`/proc/${entry}/fd/${fd}`]))
            .find((link) => link.startsWith("socket:[") && inodes.has(link.slice(8, -1)))
        : undefined;
      if (target) pids.push(Number(entry));
    }
  }
  // Ask the helper tools only when /proc could not answer, and read their real
  // "pid" fields rather than every digit in the output (a port number is not a PID).
  for (const [command, args] of [
    ["lsof", ["-nP", `-iTCP:${desired}`, "-sTCP:LISTEN", "-t"]],
    ["ss", ["-lptH", `sport = :${desired}`]],
    ["fuser", [`${desired}/tcp`]],
  ]) {
    if (pids.length) break;
    const output = run(command, args);
    if (!output) continue;
    if (command === "ss") {
      for (const match of output.matchAll(/pid=(\d+)/g)) pids.push(Number(match[1]));
    } else if (command === "lsof") {
      for (const line of output.split("\n")) if (/^\d+$/.test(line.trim())) pids.push(Number(line.trim()));
    } else {
      for (const match of output.matchAll(/\b(\d+)\b/g)) pids.push(Number(match[1]));
    }
  }
  return [...new Set(pids)].filter(safe);
}

async function freePort() {
  const pids = listenerPids(port);
  await log("Port " + port + " is held by process " + (pids.join(", ") || "nothing") + ".");
  if (!pids.length) {
    await log("No process could be found holding port " + port + ".");
    return;
  }
  for (const pid of pids) {
    try {
      if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "pipe" });
      else process.kill(pid, "SIGKILL");
      await log("Stopped process " + pid + " that was holding port " + port + ".");
    } catch (error) {
      await log("Could not stop process " + pid + ": " + error.message);
    }
  }
}

if (command === "install") {
  if (!validSha(sha)) {
    await log("Refusing an invalid revision.");
    process.exit(2);
  }
  const root = process.cwd();
  await log(`Installing ${sha.slice(0, 7)} on port ${port}.`);
  await publish({ phase: "installing", available: sha, message: "Installing the update. Connectchy will restart itself." });

  let built = null;
  try {
    if (!existsSync(mirror)) await git(["init", "--bare", mirror], root);
    await git(
      ["fetch", "--depth=30", "--no-tags", OFFICIAL_REPO, `+refs/heads/${OFFICIAL_BRANCH}:refs/heads/published`],
      mirror,
    ).catch(() => {});
    built = await buildRevision({
      mirror,
      cache,
      root,
      sha,
      // Progress must be awaited before the build runs, otherwise the final
      // lines of a long build are still queued when the swap starts.
      onProgress: (message) => log(message),
      log: (line) => log("  " + line),
    });
    await log(`Built ${path.basename(built)}.`);
  } catch (error) {
    await log("Build failed: " + error.message);
    if (built) await rm(built, { recursive: true, force: true, maxRetries: 2 }).catch(() => {});
    await publish({
      phase: "error",
      available: null,
      message: "Update failed: " + error.message + " The version you were using is still running.",
    });
    process.exit(1);
  }

  await log("Build finished; restarting the app.");
  await publish({ phase: "installing", message: "Restarting Connectchy…" });
  await askToExit();
  if (!(await waitForExit())) await log("The old server did not stop; starting the new one anyway.");

  await log("Starting the new version on port " + port + ".");
  start(sha, built);
  if (await ready(sha)) {
    await writeJsonAtomic(pointer, { sha, folder: path.basename(built) });
    const notes = (await readJson(path.join(built, "release-notes.json")))?.releases ?? null;
    await publish({
      installed: sha,
      available: null,
      phase: "idle",
      notes,
      message: "Update installed.",
      summary: "Update installed",
    });
    await log(`Update installed: ${sha.slice(0, 7)}.`);
    await pruneBuilds(cache, [built]).catch(() => {});
    process.exit(0);
  }

  await log("The new version did not start. Restoring the previous one.");
  await freePort();
  start(process.env.CONNECTCHY_REVISION ?? "", process.cwd());
  await publish({ phase: "error", available: null, message: "The new version did not start. The previous one is running." });
  process.exit(1);
}

await log("Unknown installer command: " + String(command));
process.exit(2);
