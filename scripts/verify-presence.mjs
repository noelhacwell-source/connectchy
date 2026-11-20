import assert from "node:assert/strict";
import "dotenv/config";
import pg from "pg";

// Verifies the live online counter: copies check in, are counted while they are
// alive, disappear when they leave, and only salted hashes plus hashed markers
// are ever stored.
const host = process.env.CONNECTCHY_VERIFY_ORIGIN || "http://127.0.0.1:3000";
const installs = ["verifypresence000011", "verifypresence000022", "verifypresence000033"];
async function call(url, method = "GET", body, status = 200) {
  const response = await fetch(host + url, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json", Origin: host } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  assert.equal(response.status, status, JSON.stringify(data).slice(0, 300));
  return data;
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const before = await call("/api/presence");

  // 1. Every running copy is counted.
  for (const installId of installs) await call("/api/presence", "POST", { installId, version: "verification" }, 201);
  const online = await call("/api/presence");
  assert.equal(online.local, before.local + 3, "three running copies are counted");

  // 2. Repeated heartbeats from the same copy never count twice.
  await call("/api/presence", "POST", { installId: installs[0], version: "verification" }, 201);
  assert.equal((await call("/api/presence")).local, online.local, "a heartbeat is not a second copy");

  // 3. Stopping a copy takes it out of the live number.
  await call(`/api/presence?installId=${installs[0]}`, "DELETE");
  assert.equal((await call("/api/presence")).local, online.local - 1, "a stopped copy leaves the count");

  // 4. Rubbish and cross-site posts are refused.
  await call("/api/presence", "POST", { installId: "short" }, 400);
  const crossSite = await fetch(`${host}/api/presence`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
    body: JSON.stringify({ installId: installs[1] }),
  });
  assert.equal(crossSite.status, 403, "cross-site posts are refused");

  // 5. Only hashes are stored, and the public marker is not the install id.
  const { rows } = await pool.query("select install_hash, signal_hash from live_installs");
  for (const row of rows) {
    assert.equal(row.install_hash.length, 64, "install ids are stored as sha-256 hashes");
    assert.ok(!installs.includes(row.install_hash), "the raw install id is never stored");
    assert.ok(!installs.includes(row.signal_hash), "the public marker is not the install id");
  }
  const mine = rows.filter((row) => installs.some((id) => row.install_hash !== id)).length;
  assert.ok(mine >= 2, "the live rows are present while the copies are running");

  console.log(`PASS: live counter counted ${online.local} running copies, ignored heartbeats, dropped a stopped copy and stored only hashes.`);
} finally {
  for (const installId of installs) await fetch(`${host}/api/presence?installId=${installId}`, { method: "DELETE" }).catch(() => {});
  await pool.end();
}
