import { ApiError, apiError, ownerRequest } from "@/lib/http-utils";
import { pool } from "@/db";
import { publicOrigin } from "@/lib/public-origin";
import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { crc32 } from "node:zlib";
import { open as openZip, type Entry } from "yauzl";

export { apiError, ownerRequest };
export const noStore = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};
export function projectName(input: unknown) {
  if (typeof input !== "string" || !input.trim() || input.trim().length > 100)
    throw new ApiError(400, "Enter a project name of 1–100 characters.");
  return input.trim();
}
export function linkFor(req: Request, key: string) {
  return (
    (publicOrigin() ?? new URL(req.url).origin) + "/api/project-uploads/" + key
  );
}
function inspectZip(file: string) {
  return new Promise<number>((resolve, reject) => {
    openZip(file, { lazyEntries: true, strictFileNames: true }, (err, zip) => {
      const invalid = () =>
        new ApiError(
          400,
          "Upload a valid ZIP containing regular files and folders with portable relative paths.",
        );
      if (err || !zip) {
        reject(invalid());
        return;
      }
      let count = 0;
      const entries = new Map<string, "file" | "folder">();
      const explicit = new Set<string>();
      const fail = () => {
        zip.close();
        reject(invalid());
      };
      zip.on("error", fail);
      zip.on("entry", (entry: Entry) => {
        const dir = entry.fileName.endsWith("/");
        const names: string[] = entry.fileName.replace(/\/$/, "").split("/");
        const type = (entry.externalFileAttributes >>> 16) & 0xf000;
        if (
          (type && type !== (dir ? 0x4000 : 0x8000)) ||
          entry.generalPurposeBitFlag & 1 ||
          ![0, 8].includes(entry.compressionMethod) ||
          names.some(
            (n) =>
              !n ||
              /^\.{1,2}$|[<>:"|?*\\\x00-\x1f]|[. ]$|^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(
                n,
              ),
          )
        ) {
          fail();
          return;
        }
        let key = "";
        for (const [i, n] of names.entries()) {
          key += "/" + n.normalize("NFC").toLowerCase();
          const kind = i === names.length - 1 && !dir ? "file" : "folder";
          if (entries.has(key) && entries.get(key) !== kind) {
            fail();
            return;
          }
          entries.set(key, kind);
        }
        if (explicit.has(key)) {
          fail();
          return;
        }
        explicit.add(key);
        if (dir) {
          zip.readEntry();
          return;
        }
        count++;
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) {
            fail();
            return;
          }
          let checksum = 0;
          stream.on("data", (chunk) => {
            checksum = crc32(chunk, checksum);
          });
          stream.on("error", fail);
          stream.on("end", () =>
            checksum === entry.crc32 ? zip.readEntry() : fail(),
          );
        });
      });
      zip.on("end", () => (explicit.size ? resolve(count) : reject(invalid())));
      zip.readEntry();
    });
  });
}
export async function saveArchive(
  req: Request,
  target: { name: string } | { key: string; version: number },
) {
  if (
    !req.body ||
    req.headers.get("content-type")?.split(";")[0] !== "application/zip"
  )
    throw new ApiError(415, "Send a ZIP with Content-Type application/zip.");
  const dir = await mkdtemp(path.join(tmpdir(), "connectchy-upload-"));
  const file = path.join(dir, "project.zip");
  try {
    await pipeline(
      Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]),
      createWriteStream(file),
    );
    const count = await inspectZip(file);
    const size = (await stat(file)).size;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      let key: string, version: number;
      if ("name" in target) {
        key = randomBytes(32).toString("hex");
        version = 1;
        await client.query(
          "insert into shared_projects (key,name,files,bytes) values ($1,$2,$3,$4)",
          [key, target.name, count, size],
        );
      } else {
        key = target.key;
        version = target.version + 1;
        const updated = await client.query(
          "update shared_projects set version=version+1,files=$3,bytes=$4,updated=now() where key=$1 and version=$2",
          [key, target.version, count, size],
        );
        if (!updated.rowCount)
          throw new ApiError(
            409,
            "This project changed or was deleted. Download the latest version before replacing it.",
          );
        await client.query("delete from shared_project_parts where key=$1", [
          key,
        ]);
      }
      let part = 0;
      for await (const bytes of createReadStream(file, {
        highWaterMark: 4 * 1024 * 1024,
      }))
        await client.query(
          "insert into shared_project_parts values ($1,$2,$3)",
          [key, part++, bytes],
        );
      await client.query("COMMIT");
      return { key, version };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
export async function downloadArchive(key: string, version: number | null) {
  const client = await pool.connect();
  let part = 0,
    finished = false;
  async function finish() {
    if (finished) return;
    finished = true;
    try {
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  }
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const {
      rows: [project],
    } = await client.query(
      "select version,bytes from shared_projects where key=$1",
      [key],
    );
    if (!project) throw new ApiError(404, "Project unavailable.");
    if (version !== null && version !== project.version)
      throw new ApiError(
        409,
        "A newer version is available. Open the project link again.",
      );
    const body = new ReadableStream<Uint8Array>({
      async pull(control) {
        try {
          const {
            rows: [row],
          } = await client.query(
            "select bytes from shared_project_parts where key=$1 and part=$2",
            [key, part++],
          );
          if (finished) return;
          if (row) control.enqueue(row.bytes);
          else {
            control.close();
            await finish();
          }
        } catch (err) {
          if (!finished) control.error(err);
          await finish();
        }
      },
      cancel: finish,
    });
    return new Response(body, {
      headers: {
        ...noStore,
        "Content-Type": "application/zip",
        "Content-Length": String(project.bytes),
        "Content-Disposition":
          'attachment; filename="project-v' + project.version + '.zip"',
        ETag: '"' + project.version + '"',
      },
    });
  } catch (err) {
    await finish();
    throw err;
  }
}
