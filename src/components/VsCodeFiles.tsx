"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { clientId } from "@/lib/client-id";
import { postJson, requestJson } from "@/lib/workspace-client";
import { Button, Notice, Panel } from "./ui";

type FileReport = { files: string[]; truncated: boolean };
type TrashReport = {
  trashed: string[];
  skipped: { path: string; error: string }[];
};
type CommandResult<T> = {
  id: number;
  status: string;
  ok: boolean;
  result?: T;
  error?: string;
};

export default function VsCodeFiles({
  token,
  online,
}: {
  token: string;
  online: boolean;
}) {
  const [report, setReport] = useState<FileReport | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const run = useCallback(
    async <T,>(type: string, payload: object): Promise<T> => {
      const url = `/api/agent/${token}/`;
      let data = await postJson<CommandResult<T>>(url + "command", {
        type,
        payload,
        source: "dashboard",
        nonce: clientId(),
        wait: false,
      });
      for (
        let attempts = 0;
        ["pending", "sent"].includes(data.status);
        attempts++
      ) {
        if (attempts >= 180)
          throw new Error(
            "The editor did not finish. Check Activity before retrying.",
          );
        await new Promise((resolve) => setTimeout(resolve, 1000));
        data = await requestJson<CommandResult<T>>(
          url + "commands?id=" + data.id,
        );
      }
      if (!data.ok || !data.result)
        throw new Error(data.error ?? "Editor command failed.");
      return data.result;
    },
    [token],
  );
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setReport(await run<FileReport>("code_list_files", {}));
      setSelected([]);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not read project files.",
      );
    } finally {
      setBusy(false);
    }
  }, [run]);
  useEffect(() => {
    if (!online) return;
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [online, load]);
  const visible = (report?.files ?? []).filter((file) =>
    file.toLowerCase().includes(search.trim().toLowerCase()),
  );
  async function trash() {
    setBusy(true);
    setError("");
    try {
      const result = await run<TrashReport>("code_trash_files", {
        paths: selected,
      });
      setConfirm(false);
      setNotice(`${result.trashed.length} moved to trash.`);
      await load();
      if (result.skipped.length)
        setError(
          result.skipped
            .map((item) => item.path + " · " + item.error)
            .join("\n"),
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not trash files.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      title="VS Code files"
      action={
        <Button
          size="sm"
          disabled={!online || busy}
          onClick={() => void load()}
        >
          Refresh
        </Button>
      }
    >
      {error && <Notice tone="bad">{error}</Notice>}
      {notice && <Notice tone="ok">{notice}</Notice>}
      {!online && (
        <p className="my-3 text-sm text-muted">
          Connect your folder in VS Code to manage project files.
        </p>
      )}
      <div className="record-filters mb-3">
        <label className="search-field">
          <Search size={15} />
          <input
            aria-label="Search project files"
            placeholder="Search path"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <ul className="record-list">
        {visible.map((file) => (
          <li key={file}>
            <label>
              <input
                type="checkbox"
                aria-label={file}
                checked={selected.includes(file)}
                disabled={
                  busy || (!selected.includes(file) && selected.length >= 20)
                }
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, file]
                      : selected.filter((path) => path !== file),
                  )
                }
              />
              <span>
                <strong>{file}</strong>
              </span>
            </label>
          </li>
        ))}
        {!visible.length && (
          <li className="record-empty">
            {busy ? "Reading project…" : "No files shown."}
          </li>
        )}
      </ul>
      {report?.truncated && (
        <p className="my-2 text-xs text-muted">
          Showing the first 2,000 files.
        </p>
      )}
      <div className="record-actions mt-3">
        <Button
          size="sm"
          disabled={busy || !visible.length || visible.length > 20}
          onClick={() => setSelected(visible)}
        >
          Select shown
        </Button>
        <Button
          size="sm"
          disabled={busy || !selected.length}
          onClick={() => setSelected([])}
        >
          Clear
        </Button>
        <span>{selected.length} / 20 selected</span>
        <Button
          size="sm"
          variant="danger"
          disabled={busy || !online || !selected.length}
          onClick={() => setConfirm(true)}
        >
          <Trash2 size={14} />
          Move to trash
        </Button>
      </div>
      {confirm && (
        <div className="record-actions mt-3">
          <span>Confirm the file list in the connected VS Code window.</span>
          <Button size="sm" disabled={busy} onClick={() => setConfirm(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={busy || !selected.length}
            onClick={() => void trash()}
          >
            {busy ? "Waiting for VS Code…" : "Send to VS Code"}
          </Button>
        </div>
      )}
    </Panel>
  );
}
