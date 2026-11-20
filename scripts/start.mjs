import { existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { spawn } from "node:child_process";
import { once } from "node:events";
import "dotenv/config";
import { ensureLocalDatabaseConfig } from "./database-config.mjs";

/**
 * `npm start` on a fresh clone should just work: no .bat file, no manual build,
 * no DATABASE_URL to invent. This entry point
 *   1. creates the private local database config when it is missing,
 *   2. builds the app the first time (and whenever the source is newer),
 *   3. hands over to scripts/serve.mjs, which starts the database, the tunnel,
 *      the update checker and the dashboard itself.
 */
ensureLocalDatabaseConfig();

const buildId = ".next/BUILD_ID";

function buildTimes() {
  // Cheap freshness check: compare the build against the newest commit.
  try {
    const committed = Number(execFileSync("git", ["log", "-1", "--format=%ct", "HEAD"], { encoding: "utf8" }).trim()) * 1000;
    const built = existsSync(buildId) ? statSync(buildId).mtimeMs : 0;
    return { committed, built };
  } catch {
    return null;
  }
}

const needsBuild = () => {
  if (!existsSync(buildId)) return true;
  const times = buildTimes();
  // Without git (a ZIP download) only a missing build triggers a rebuild.
  return times ? times.committed > times.built : false;
};

if (needsBuild()) {
  console.log("Building Connectchy for the first time. This can take a minute…");
  const build = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
    stdio: "inherit",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  const [code] = await once(build, "exit");
  if (code !== 0) {
    console.error("The build failed. Run npm install, then npm start again.");
    process.exit(code ?? 1);
  }
}

// Hand over to the launcher. It keeps the update checker, the public tunnel and
// the live presence counter running, so "Update" appears at the top of the app.
const serve = spawn(process.execPath, ["scripts/serve.mjs", "--production"], {
  stdio: "inherit",
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});
const stop = (signal) => () => serve.kill(signal);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop(signal));
const [code] = await once(serve, "exit");
process.exit(code ?? 0);
