import {
  readFile,
  writeFile,
  rename,
  mkdir,
  mkdtemp,
  unlink,
  readdir,
  rm,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import {
  OFFICIAL_REPO as official,
  OFFICIAL_BRANCH as officialBranch,
  isNewer,
  validSha,
  readJson as json,
  writeJsonAtomic as atomic,
  git,
  runNode,
  pruneBuilds,
} from "../src/lib/update-engine.mjs";

const exec = promisify(execFile);

export async function serveWithUpdates({ root, dir, port, onExit }) {
  const cache = path.join(dir, "updates");
  await mkdir(cache, { recursive: true });
  const pointer = path.join(cache, "active.json"),
    statusFile = path.join(cache, "status.json");
  const signal = path.join(cache, "install-" + randomUUID() + ".json");
  // A badge asking GitHub right now writes here; the launcher picks it up in its
  // next tick, so "refresh" works whether or not the launcher is in charge.
  const refreshSignal = path.join(cache, "refresh-request.json");
  const mirror = path.join(cache, "official.git");
  const slot = await json(pointer);
  let active =
    slot && validSha(slot.sha) && /^build-[\w-]+$/.test(slot.folder)
      ? path.join(cache, slot.folder)
      : root;
  let installed =
    active !== root
      ? slot.sha
      : await git(["rev-parse", "HEAD"], root).catch(() => "");
  let localNotes =
    (await json(path.join(active, "release-notes.json")))?.releases ?? [];
  let state = {
    installed,
    available: null,
    phase: "checking",
    notes: localNotes,
    message: "Checking GitHub…",
  };
  const publish = async (patch) => {
    state = { ...state, ...patch };
    await atomic(statusFile, state);
  };
  let child,
    switching = false,
    closed = false;
  async function launch(cwd, revision) {
    const schema = await import(
      pathToFileURL(path.join(cwd, "scripts/collaboration-schema.mjs")).href
    );
    await schema.ensureCollaborationSchema(process.env.DATABASE_URL);
    child = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "0.0.0.0",
        "--port",
        String(port),
      ],
      {
        cwd,
        stdio: "inherit",
        windowsHide: true,
        env: {
          ...process.env,
          CONNECTCHY_DATA_DIR: dir,
          CONNECTCHY_UPDATE_SIGNAL: signal,
          CONNECTCHY_REVISION: revision,
        },
      },
    );
    child.on("exit", (code) => {
      if (!switching && !closed) {
        closed = true;
        clearInterval(timer);
        onExit(code ?? 1);
      }
    });
  }
  async function halt() {
    if (child && child.exitCode === null && !child.signalCode) {
      const done = once(child, "exit");
      child.kill();
      await done;
    }
  }
  async function ready(sha) {
    for (let i = 0; i < 80; i++) {
      try {
        const r = await fetch("http://127.0.0.1:" + port + "/api/health", {
          signal: AbortSignal.timeout(1500),
        });
        if (r.ok && (await r.json()).revision === sha) return;
      } catch {}
      if (child.exitCode !== null || child.signalCode) break;
      await delay(350);
    }
    throw Error("Updated server did not become ready.");
  }
  async function check() {
    if (!existsSync(mirror)) await git(["init", "--bare", mirror], root);
    await git(
      [
        "fetch",
        "--depth=30",
        "--no-tags",
        official,
        `+refs/heads/${officialBranch}:refs/heads/published`,
      ],
      mirror,
    );
    const sha = await git(["rev-parse", "refs/heads/published"], mirror);
    if (!validSha(sha)) throw Error("Invalid published revision.");
    let notes;
    try {
      notes = JSON.parse(
        await git(["show", sha + ":release-notes.json"], mirror),
      ).releases;
    } catch {
      notes = localNotes;
    }
    const summary = await git(["log", "-1", "--format=%s", sha], mirror);
    const history = (
      await git(["log", "--first-parent", "-15", "--format=%s", sha], mirror)
    ).split("\n");
    await publish({
      history,
      phase: "idle",
      available: await isNewer(mirror, root, sha, installed) ? sha : null,
      notes,
      summary,
      message: "",
    });
  }
  // Only remove updater-created build slots. Keep the current and fallback installations.
  async function pruneBuilds(keep) {
    for(const entry of await readdir(cache,{withFileTypes:true})){
      if(!entry.isDirectory() || !/^build-[A-Za-z0-9]{6}$/.test(entry.name))continue;
      const directory=path.resolve(cache, entry.name);
      if(path.dirname(directory)!==path.resolve(cache) || keep.includes(directory))continue;
      await rm(directory,{recursive:true,force:true,maxRetries:2}).catch(()=>{});
    }
  }
  async function install(sha) {
    if (!validSha(sha) || sha !== state.available) return;
    const previous = active,
      previousSha = installed;
    try {
      await publish({ phase: "installing", message: "Preparing the update…" });
      const next = await mkdtemp(path.join(cache, "build-"));
      await git(
        ["clone", "--no-checkout", "--no-hardlinks", mirror, next],
        root,
      );
      await git(["checkout", "--detach", sha], next);
      await publish({
        message:
          "Installing dependencies and building. You can keep using Connectchy.",
      });
      const npm =
        process.env.npm_execpath ||
        path.join(
          path.dirname(process.execPath),
          "node_modules/npm/bin/npm-cli.js",
        );
      await runNode(
        [npm, "ci", "--include=dev", "--no-audit", "--no-fund"],
        next,
      );
      await runNode([npm, "run", "build"], next);
      if(closed)return;
      await publish({ message: "Restarting Connectchy…" });
      switching = true;
      await halt();
      await launch(next, sha);
      await ready(sha);
      await atomic(pointer, { sha, folder: path.basename(next) });
      installed = sha;
      active = next;
      localNotes = state.notes;
      await publish({
        installed,
        available: null,
        phase: "idle",
        message: "Update installed.",
      });
      await pruneBuilds([next,previous]).catch(()=>{});
    } catch (e) {
      if (switching) {
        await halt();
        await launch(previous, previousSha);
      }
      await publish({
        phase: "error",
        message:
          "Update failed. The previous version is selected. " + e.message,
      });
    } finally {
      switching = false;
    }
  }
  let busy = true,
    last = Date.now();
  await publish({});
  const timer = setInterval(async () => {
    if (busy || closed) return;
    busy = true;
    try {
      const refresh = await json(refreshSignal);
      if (refresh) {
        await unlink(refreshSignal).catch(() => {});
        last = Date.now();
        await check();
      }
      const request = await json(signal);
      if (request) {
        await unlink(signal);
        await install(request.sha);
      } else if (Date.now() - last > 10 * 60_000) {
        // GitHub is re-checked every 10 minutes while the app runs, so the
        // Update badge at the top appears without restarting Connectchy.
        last = Date.now();
        await check();
      }
    } catch {
      await publish({
        phase: "error",
        message: "Could not check GitHub. Connectchy is available offline.",
      });
    } finally {
      busy = false;
    }
  }, 700);
  await launch(active, installed);
  void check()
    .catch(() =>
      publish({
        phase: "error",
        message: "Could not reach GitHub. Showing the installed changelog.",
      }),
    )
    .finally(() => {
      busy = false;
    });
  return () => {
    closed = true;
    clearInterval(timer);
    child?.kill();
  };
}
