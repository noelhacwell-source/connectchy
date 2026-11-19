import path from "node:path";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Keep this entry point in the original installation so existing desktop shortcuts work.
const cache = path.resolve(".local-runtime/updates");
let launcher = path.resolve("scripts/serve.mjs");
try {
  const slot = JSON.parse(
    await readFile(path.join(cache, "active.json"), "utf8"),
  );
  if (!/^build-[\w-]+$/.test(slot.folder) || !/^[0-9a-f]{40}$/.test(slot.sha))
    throw Error("Invalid update installation.");
  launcher = path.join(cache, slot.folder, "scripts/serve.mjs");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await import(pathToFileURL(launcher).href);
