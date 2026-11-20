import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import pg from "pg";
import { ensureLocalDatabaseConfig } from "./database-config.mjs";
import { ensureDatabase } from "./local-database.mjs";

// Setup and `npm start` share one bootstrap, so a fresh checkout never asks the
// owner to invent a DATABASE_URL.
ensureLocalDatabaseConfig();
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
