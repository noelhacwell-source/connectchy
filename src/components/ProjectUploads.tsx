"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FolderUp } from "lucide-react";
import { Button, CopyButton, Notice } from "./ui";
import { requestJson } from "@/lib/workspace-client";

type Project = {
  key: string;
  name: string;
  link: string;
  version: number;
  files: number;
  bytes: string;
};
type Item = { path: string; file?: File };
async function collect(entry: FileSystemEntry, parent: string, items: Item[]) {
  const path = parent + entry.name;
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    items.push({ path, file });
    return;
  }
  items.push({ path: path + "/" });
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (!batch.length) break;
    for (const child of batch) await collect(child, path + "/", items);
  }
}
const base = "/api/project-uploads";
export default function ProjectUploads() {
  const input = useRef<HTMLInputElement>(null);
  const [projects, list] = useState<Project[]>([]),
    [items, setItems] = useState<Item[]>([]),
    [name, setName] = useState("");
  const [replace, setReplace] = useState<Project | null>(null),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    list((await requestJson<{ projects: Project[] }>(base)).projects);
  }, []);
  useEffect(() => {
    const load = () => void refresh().catch((e) => setError(e.message));
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [refresh]);
  function clear() {
    setItems([]);
    setName("");
    setReplace(null);
  }
  function add(next: Item[]) {
    const roots = new Set(items.map((i) => i.path.split("/")[0]));
    if (next.some((i) => roots.has(i.path.split("/")[0]))) {
      setError("A folder with that name is already selected.");
      return;
    }
    setItems([...items, ...next]);
    if (!name && !replace && next.length) setName(next[0].path.split("/")[0]);
    setError("");
  }
  async function upload() {
    if (!items.length) return;
    setError("");
    setStatus("Preparing archive…");
    try {
      const { ZipWriter, BlobWriter, BlobReader } =
        await import("@zip.js/zip.js");
      const zip = new ZipWriter(new BlobWriter("application/zip"), {
        useWebWorkers: false,
      });
      for (const [i, item] of items.entries()) {
        setStatus("Packing " + (i + 1) + " of " + items.length);
        await zip.add(
          item.path,
          item.file ? new BlobReader(item.file) : undefined,
          {
            directory: !item.file,
            lastModDate: item.file
              ? new Date(item.file.lastModified)
              : undefined,
          },
        );
      }
      const body = await zip.close();
      setStatus("Uploading archive…");
      await requestJson(
        replace
          ? base + "/" + replace.key
          : base + "?name=" + encodeURIComponent(name),
        {
          method: replace ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/zip",
            ...(replace
              ? { "X-Project-Version": String(replace.version) }
              : {}),
          },
          body,
        },
      );
      clear();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setStatus("");
    }
  }
  async function manage(p: Project, action: "rename" | "delete") {
    const newName =
      action === "rename" ? window.prompt("Project name", p.name) : null;
    if (
      (action === "rename" && !newName?.trim()) ||
      (action === "delete" &&
        !window.confirm("Delete " + p.name + " and revoke its project link?"))
    )
      return;
    try {
      setError("");
      await requestJson(base + "/" + p.key, {
        method: action === "rename" ? "PATCH" : "DELETE",
        ...(newName
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: newName }),
            }
          : {}),
      });
      if (action === "delete" && replace?.key === p.key) clear();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update project.");
    }
  }
  const roots = [...new Set(items.map((i) => i.path.split("/")[0]))];
  return (
    <div className="project-upload-panel">
      <h3>{replace ? "New version of " + replace.name : "Upload a project"}</h3>
      <fieldset disabled={!!status}>
        {!replace && (
          <label className="field-label">
            Project name
            <input
              className="workspace-input"
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        <button
          type="button"
          className="folder-drop"
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            e.preventDefault();
            if (status) return;
            const entries = Array.from(e.dataTransfer.items, (item) =>
              item.webkitGetAsEntry?.(),
            ).filter((x): x is FileSystemEntry => !!x);
            if (!entries.length) {
              setError("Use Choose folders in this browser.");
              return;
            }
            setStatus("Reading folders…");
            try {
              const next: Item[] = [];
              for (const entry of entries) await collect(entry, "", next);
              add(next);
            } catch {
              setError("Could not read the dropped folders.");
            } finally {
              setStatus("");
            }
          }}
        >
          <FolderUp size={24} />
          <strong>Choose folders or drop them here</strong>
          <small>Add several folders to the same project.</small>
        </button>
        <input
          hidden
          ref={input}
          type="file"
          multiple
          {...{ webkitdirectory: "" }}
          onChange={(e) => {
            const next = Array.from(e.target.files ?? [], (file) => ({
              path: file.webkitRelativePath || file.name,
              file,
            }));
            e.target.value = "";
            add(next);
          }}
        />
        {roots.map((root) => (
          <div className="upload-folder" key={root}>
            {root}
            <button
              type="button"
              onClick={() =>
                setItems(items.filter((i) => i.path.split("/")[0] !== root))
              }
            >
              Remove
            </button>
          </div>
        ))}
        {replace && (
          <p>
            The upload replaces all files in version {replace.version}. The
            share link stays the same.
          </p>
        )}
        <div className="record-actions">
          <Button
            type="button"
            variant="primary"
            disabled={!items.length || (!replace && !name.trim())}
            onClick={upload}
          >
            {status || (replace ? "Replace version" : "Upload project")}
          </Button>
          {replace && (
            <Button type="button" onClick={clear}>
              Cancel
            </Button>
          )}
        </div>
      </fieldset>
      {error && <Notice tone="bad">{error}</Notice>}
      <h3>Uploaded projects</h3>
      <p>
        Anyone with a project link can download that project and push a
        replacement version.
      </p>
      {projects.map((p) => (
        <article className="shared-project" key={p.key}>
          <strong>{p.name}</strong>
          <small>
            Version {p.version} · {p.files} files ·{" "}
            {(Number(p.bytes) / 1000000).toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}{" "}
            MB
          </small>
          <div className="record-actions">
            <CopyButton text={p.link} label="Copy project link" />
            <a href={base + "/" + p.key + "?download=1"} download>
              Download ZIP
            </a>
            <Button
              type="button"
              disabled={!!status}
              onClick={() => {
                if (
                  items.length &&
                  !confirm("Discard the current folder selection?")
                )
                  return;
                clear();
                setReplace(p);
                input.current?.click();
              }}
            >
              Upload new version
            </Button>
            <Button
              type="button"
              disabled={!!status}
              onClick={() => manage(p, "rename")}
            >
              Rename
            </Button>
            <Button
              type="button"
              disabled={!!status}
              onClick={() => manage(p, "delete")}
            >
              Delete
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}
