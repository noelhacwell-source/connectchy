import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

/**
 * Connectchy runs on the owner's own computer, so it must be able to start
 * without anyone hand-writing a database URL. When no DATABASE_URL is set we
 * create .env with a generated password and a private embedded PostgreSQL port,
 * exactly once. An existing .env or an explicitly exported DATABASE_URL is
 * always left alone.
 *
 * The embedded server may already exist with a cluster on disk, so the port it
 * was created with is always reused. Picking a fresh port there would orphan the
 * existing data directory and fail to start.
 */
export function ensureLocalDatabaseConfig() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  mkdirSync(".local-runtime", { recursive: true });
  const port = managedPort();
  const url = `postgresql://postgres:${randomBytes(32).toString("hex")}@127.0.0.1:${port}/studio_link`;
  try {
    // A random password can never match an existing cluster, so this .env is
    // reused only when this run created it. Otherwise the owner's .env wins.
    writeFileSync(".env", `DATABASE_URL=${url}\n`, { flag: "wx", mode: 0o600 });
    process.env.DATABASE_URL = url;
    console.log("Created .env with a private local database for this computer.");
    return url;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    return undefined;
  }
}

/** The port the embedded database was created with, or a free one on first run. */
export function managedPort() {
  const saved = readPort();
  // A cluster on disk is bound to the port that created it, even when nothing is
  // listening right now, so never move it.
  if (saved) return saved;
  mkdirSync(".local-runtime", { recursive: true });
  const port = portIsFree(55432) ? 55432 : anyFreePort();
  if (port) writeFileSync(".local-runtime/embedded-port", String(port));
  return port;
}

function readPort() {
  try {
    const saved = Number(readFileSync(".local-runtime/embedded-port", "utf8").trim());
    if (Number.isInteger(saved) && saved > 0) return saved;
  } catch {
    /* First run: no port has been chosen yet. */
  }
  return 0;
}

function anyFreePort() {
  try {
    const output = execFileSync(
      process.execPath,
      [
        "-e",
        "const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})",
      ],
      { encoding: "utf8" },
    );
    const found = Number(output.trim());
    if (Number.isInteger(found) && found > 0) return found;
  } catch {
    /* Fall through to the well-known port. */
  }
  return 55432;
}

function portIsFree(port) {
  try {
    execFileSync(
      process.execPath,
      [
        "-e",
        `const s=require('node:net').createServer();s.once('error',()=>process.exit(1));s.listen(${port},'127.0.0.1',()=>s.close(()=>process.exit(0)))`,
      ],
      { stdio: "ignore" },
    );
    return true;
  } catch {
    return false;
  }
}
