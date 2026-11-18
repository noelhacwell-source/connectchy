import "dotenv/config";
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const address = new URL(process.env.DATABASE_URL);
const directory = path.resolve(".local-runtime/postgres-data");
const server = new EmbeddedPostgres({
  databaseDir: directory,
  user: decodeURIComponent(address.username),
  password: decodeURIComponent(address.password),
  port: Number(address.port),
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-h", "127.0.0.1"],
  autoRehydrateSymlinks: true,
});
if (!existsSync(path.join(directory, "PG_VERSION"))) await server.initialise();
await server.start();
const client = server.getPgClient("postgres", "127.0.0.1");
await client.connect();
const found = await client.query("SELECT 1 FROM pg_database WHERE datname='studio_link'");
await client.end();
if (!found.rowCount) await server.createDatabase("studio_link");
console.log("Local database ready.");
setInterval(() => {}, 60_000);
