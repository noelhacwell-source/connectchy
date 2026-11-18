import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import dotenv from "dotenv";
import pg from "pg";
import { ensureDatabase } from "./local-database.mjs";

mkdirSync(".local-runtime", { recursive: true });
if (!existsSync(".env") && !process.env.DATABASE_URL) {
  const probe = createServer();
  async function available(port) {
    await new Promise((resolve,reject)=>{
      const fail=err=>{probe.off("listening",ready);reject(err)};
      const ready=()=>{probe.off("error",fail);resolve()};
      probe.once("error",fail).once("listening",ready).listen(port,"127.0.0.1");
    });
  }
  try {await available(55432)} catch(err){if(err.code!=="EADDRINUSE")throw err;await available(0)}
  const port=probe.address().port;
  await new Promise(resolve=>probe.close(resolve));
  writeFileSync(".local-runtime/embedded-port",String(port));
  const password = randomBytes(32).toString("hex");
  writeFileSync(".env", `DATABASE_URL=postgresql://postgres:${password}@127.0.0.1:${port}/studio_link\n`, {flag:"wx", mode:0o600});
}
dotenv.config();
await ensureDatabase(process.env.DATABASE_URL);
const client = new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
let initialized;
try {
  const {rows:[row]} = await client.query("select to_regclass('public.connections') is not null as initialized");
  initialized = row.initialized;
} finally { await client.end(); }
if (!initialized) {
  const result = spawnSync(process.execPath, ["node_modules/drizzle-kit/bin.cjs","push"],{stdio:"inherit"});
  if(result.status !== 0) throw new Error("Database setup failed.");
}
