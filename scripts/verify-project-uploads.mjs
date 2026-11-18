import assert from "node:assert/strict";
import { ZipWriter, BlobWriter, TextReader } from "@zip.js/zip.js";
const base =
  (process.env.TEST_ORIGIN || "http://127.0.0.1:3000") + "/api/project-uploads";
async function archive(paths) {
  const writer = new ZipWriter(new BlobWriter(), { useWebWorkers: false });
  for (const path of paths) await writer.add(path, new TextReader(path));
  return writer.close();
}
const original = await archive(["one/.env.example", "two/src/index.js"]);
const edited = await archive(["two/src/renamed.js"]);
const headers = { "Content-Type": "application/zip" };
const keys = [];
try {
  for (const name of ["roundtrip", "isolated"]) {
    const response = await fetch(base + "?name=" + name, {
      method: "POST",
      headers,
      body: original,
    });
    assert.equal(response.status, 201, await response.clone().text());
    keys.push((await response.json()).key);
  }
  const url = base + "/" + keys[0],
    remote = { "cf-ray": "test" };
  assert((await (await fetch(url)).text()).includes("extractall"));
  assert.equal((await fetch(base, { headers: remote })).status, 403);
  assert.equal(
    (await fetch(url, { method: "DELETE", headers: remote })).status,
    403,
  );
  const push = (body, v) =>
    fetch(url, {
      method: "PUT",
      body,
      headers: { ...headers, ...remote, "X-Project-Version": String(v) },
    });
  assert.equal((await push("invalid zip", 1)).status, 400);
  assert.equal((await push(edited, 1)).status, 200);
  assert.equal((await push(original, 1)).status, 409);
  for (const [key, expected] of [
    [keys[0], edited],
    [keys[1], original],
  ]) {
    const download = await fetch(base + "/" + key + "?download=1");
    assert.deepEqual(
      Buffer.from(await download.arrayBuffer()),
      Buffer.from(await expected.arrayBuffer()),
    );
  }
  assert.equal(
    (
      await fetch(url, {
        method: "PATCH",
        body: JSON.stringify({ name: "Renamed" }),
      })
    ).status,
    200,
  );
  assert((await (await fetch(url)).text()).startsWith("Renamed"));
  console.log(
    "Verified independent project links, full replacement, stale and invalid pushes, download bytes, rename and owner access.",
  );
} finally {
  for (const key of keys) {
    assert.equal(
      (await fetch(base + "/" + key, { method: "DELETE" })).status,
      200,
    );
    assert.equal((await fetch(base + "/" + key)).status, 404);
  }
}
