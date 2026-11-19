import { readFileSync } from "node:fs";
import path from "node:path";

/** The tunnel belongs to this server, never to the browser's localhost address. */
export function publicOrigin(): string | null {
  const configured = process.env.PUBLIC_ORIGIN?.replace(/\/+$/, "");
  if (configured && /^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?$/.test(configured)) return configured;
  try {
    const { origin, pid: statePid } = JSON.parse(readFileSync(path.join(process.env.CONNECTCHY_DATA_DIR || path.join(process.cwd(), ".local-runtime"), "public-origin.json"), "utf8"));
    // Older, still-running launchers may rewrite the URL file without a process ID.
    let pid = statePid;
    if (!pid) {
      const owner = JSON.parse(readFileSync(path.join(process.env.CONNECTCHY_DATA_DIR || path.join(process.cwd(), ".local-runtime"), "tunnel-process.json"), "utf8"));
      if (owner.origin === origin) pid = owner.pid;
    }
    if (!Number.isInteger(pid) || pid <= 0) return null;
    process.kill(pid, 0);
    return typeof origin === "string" && /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin) ? origin : null;
  } catch { return null; }
}
