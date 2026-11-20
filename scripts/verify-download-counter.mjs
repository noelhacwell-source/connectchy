import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import "dotenv/config";
import pg from "pg";

// Verifies the real download counter: downloads are counted once per install,
// only hashes are stored, and the shown totals match the database rows.
const host = process.env.CONNECTCHY_VERIFY_ORIGIN || "http://127.0.0.1:3000";
const installs = ["verifyinstall0001", "verifyinstall0002"];
const salt = process.env.CONNECTCHY_DOWNLOAD_SALT || "connectchy-install-v1";
const hashes = installs.map((id) => createHash("sha256").update(salt + ":" + id).digest("hex"));
async function call(url, method = "GET", body, status = 200) {
  const response = await fetch(host + url, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json", Origin: host } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = response.headers.get("content-type") ?? "";
  const data = type.includes("json") ? await response.json() : await response.arrayBuffer();
  assert.equal(response.status, status, JSON.stringify(data).slice(0, 300));
  return data;
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const tokens = [];
try {
  const before = await call("/api/downloads?installId=" + installs[0]);
  const { token } = await call("/api/connections", "POST", { name: "Download counter verification", mode: "roblox" }, 201);
  tokens.push(token);

  // 1. A real Studio plugin download is counted, and its file still arrives.
  const plugin = await fetch(host + "/api/plugin/download", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: host },
    body: JSON.stringify({ token, installId: installs[0], platform: "Verification", format: "lua" }),
  });
  assert.equal(plugin.status, 200);
  const lua = await plugin.text();
  assert.ok(lua.includes("PLUGIN_VERSION"), "the plugin file is still generated");

  // 2. A repeat download from the same install is a real file but not a new person.
  await call("/api/plugin/download", "POST", { token, installId: installs[0], platform: "Verification" });
  await call("/api/downloads", "POST", { kind: "plugin", installId: installs[0], version: "1.4.1" }, 201);

  // 3. The VS Code route serves the packaged VSIX and counts a different install.
  const vsix = await fetch(host + "/api/downloads/vscode", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: host },
    body: JSON.stringify({ installId: installs[1], platform: "Verification" }),
  });
  assert.equal(vsix.status, 200);
  assert.equal(vsix.headers.get("content-type"), "application/vsix");
  assert.ok((await vsix.arrayBuffer()).byteLength > 1000, "the VSIX has content");

  // 4. Rejections: unknown kind, missing install id, cross-site post, bad token.
  await call("/api/downloads", "POST", { kind: "sneaky", installId: installs[0] }, 400);
  await call("/api/downloads", "POST", { kind: "plugin" }, 400);
  await call("/api/downloads", "POST", { kind: "plugin", installId: installs[0], token: "sl_notreal" }, 404);

  const after = await call("/api/downloads?installId=" + installs[0]);
  const kindsBefore = Object.fromEntries(before.byKind.map((row) => [row.kind, row]));
  const kinds = Object.fromEntries(after.byKind.map((row) => [row.kind, row]));
  assert.equal(after.total, before.total + 2, "two new installs are counted");
  assert.equal(kinds.plugin.installs, kindsBefore.plugin.installs + 1, "one new plugin install");
  assert.equal(kinds.plugin.downloads, kindsBefore.plugin.downloads + 3, "repeat plugin downloads are still counted as files");
  assert.equal(kinds.vscode.installs, kindsBefore.vscode.installs + 1, "one new extension install");
  assert.ok(after.counted.includes("plugin"), "this install is reported as already counted");
  assert.ok(after.trend.some((day) => day.installs >= 1), "today appears in the 30-day trend");

  // 5. Only salted hashes are stored, never the id the browser sent.
  const { rows } = await pool.query("select install_hash, kind, connection_id from install_downloads where install_hash = any($1)", [hashes]);
  assert.equal(rows.length, 2, "one row per install and kind");
  assert.ok(rows.every((row) => !installs.includes(row.install_hash) && row.install_hash.length === 64));
  assert.ok(rows.some((row) => row.kind === "plugin" && row.connection_id), "the plugin download is tied to its workspace");

  console.log(`PASS: download counter counted ${after.total} real installs and ${after.downloads} files, stored only salted hashes, not the browser id.`);
} finally {
  await pool.query("delete from install_downloads where install_hash = any($1)", [hashes]).catch(() => {});
  for (const token of tokens) await fetch(`${host}/api/agent/${token}`, { method: "DELETE" }).catch(() => {});
  await pool.end();
}
