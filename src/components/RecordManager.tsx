"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, ListFilter, RefreshCw, Trash2 } from "lucide-react";
import {
  RECORD_COLLECTIONS,
  type ManagedRecord,
} from "@/lib/record-collections";
import { downloadText, requestJson } from "@/lib/workspace-client";
import { Button, Notice } from "./ui";
import WorkspaceDialog from "./WorkspaceDialog";

export default function RecordManager({
  token,
  room,
  kinds,
  close,
  changed,
}: {
  token: string;
  room: number | null;
  kinds: string[];
  close: () => void;
  changed?: () => void;
}) {
  const [kind, setKind] = useState(kinds[0]);
  return (
    <WorkspaceDialog label="Manage records" close={close} wide>
      <div className="record-manager">
        <header>
          <div>
            <p className="eyebrow">WORKSPACE RECORDS</p>
            <h2>Manage records</h2>
          </div>
          {kinds.length > 1 && (
            <label className="field-label">
              Collection
              <select
                className="workspace-input"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                {kinds.map((id) => (
                  <option key={id} value={id}>
                    {RECORD_COLLECTIONS[id].label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </header>
        <Collection
          key={kind}
          token={token}
          room={room}
          kind={kind}
          changed={changed}
        />
      </div>
    </WorkspaceDialog>
  );
}

function Collection({
  token,
  room,
  kind,
  changed,
}: {
  token: string;
  room: number | null;
  kind: string;
  changed?: () => void;
}) {
  const definition = RECORD_COLLECTIONS[kind];
  const url = `/api/agent/${token}/records?kind=${encodeURIComponent(kind)}${room && definition.scope === "room" ? "&room=" + room : ""}`;
  const [rows, setRows] = useState<ManagedRecord[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [sort, setSort] = useState("new");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [confirmation, setConfirmation] = useState<"selected" | "all" | null>(
    null,
  );
  const load = useCallback(
    async (cursor?: number, signal?: AbortSignal) => {
      setBusy(true);
      setError("");
      try {
        const data = await requestJson<{
          records: ManagedRecord[];
          next: number | null;
        }>(url + (cursor ? "&before=" + cursor : ""), { signal });
        if (signal?.aborted) return;
        setRows((previous) =>
          cursor
            ? [
                ...previous,
                ...data.records.filter(
                  (row) => !previous.some((old) => old.id === row.id),
                ),
              ]
            : data.records,
        );
        setNext(data.next);
        if (!cursor) setSelected([]);
      } catch (e) {
        if (!signal?.aborted)
          setError(e instanceof Error ? e.message : "Could not load records.");
      } finally {
        if (!signal?.aborted) setBusy(false);
      }
    },
    [url],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void load(undefined, controller.signal), 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter(
        (r) =>
          (!state || r.state === state) &&
          [r.title, r.detail, r.author, String(r.id)]
            .join(" ")
            .toLowerCase()
            .includes(query),
      )
      .sort((a, b) =>
        sort === "title"
          ? a.title.localeCompare(b.title)
          : sort === "old"
            ? a.date.localeCompare(b.date) || a.id - b.id
            : b.date.localeCompare(a.date) || b.id - a.id,
      );
  }, [rows, search, state, sort]);
  const states = Array.from(new Set(rows.map((row) => row.state)))
    .filter(Boolean)
    .sort();
  async function remove(mode: "selected" | "all") {
    setBusy(true);
    setError("");
    try {
      const data = await requestJson<{ count: number }>(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "all" ? { mode } : { mode, ids: selected },
        ),
      });
      setConfirmation(null);
      setResult(
        `Removed ${data.count} ${data.count === 1 ? "record" : "records"}.`,
      );
      changed?.();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete records.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="record-filters">
        <label className="search-field">
          <ListFilter size={15} />
          <input
            aria-label="Search loaded records"
            placeholder="Search loaded records"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          className="workspace-input"
          aria-label="Record status"
          value={state}
          onChange={(e) => setState(e.target.value)}
        >
          <option value="">Any status</option>
          {states.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          className="workspace-input"
          aria-label="Sort records"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="new">Newest first</option>
          <option value="old">Oldest first</option>
          <option value="title">Title A–Z</option>
        </select>
        <Button
          size="sm"
          aria-label="Refresh records"
          disabled={busy}
          onClick={() => void load()}
        >
          <RefreshCw size={14} />
        </Button>
      </div>
      <div className="record-actions">
        <Button
          size="sm"
          disabled={!visible.length || busy}
          onClick={() =>
            setSelected([
              ...new Set([...selected, ...visible.map((r) => r.id)]),
            ])
          }
        >
          Select visible
        </Button>
        <Button
          size="sm"
          disabled={!selected.length || busy}
          onClick={() => setSelected([])}
        >
          Clear selection
        </Button>
        <Button
          size="sm"
          disabled={!visible.length}
          onClick={() =>
            downloadText(
              kind.replaceAll(":", "-") + ".json",
              JSON.stringify(visible, null, 2),
              "application/json",
            )
          }
        >
          <Download size={14} />
          Export list
        </Button>
        <span>
          {visible.length} shown · {selected.length} selected
        </span>
      </div>
      <ul className="record-list">
        {visible.map((row) => (
          <li key={row.id}>
            <label>
              <input
                type="checkbox"
                checked={selected.includes(row.id)}
                disabled={busy}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, row.id]
                      : selected.filter((id) => id !== row.id),
                  )
                }
              />
              <span>
                <strong>{row.title || `Record #${row.id}`}</strong>
                <small>{row.detail}</small>
              </span>
            </label>
            <span className="record-row-meta">
              <small>
                {row.state} {row.author && "· " + row.author}
              </small>
              <time dateTime={row.date}>
                {new Date(row.date).toLocaleDateString()}
              </time>
            </span>
          </li>
        ))}
        {!visible.length && (
          <li className="record-empty">
            {busy ? "Loading records…" : "No matching records."}
          </li>
        )}
      </ul>
      {next && (
        <Button size="sm" disabled={busy} onClick={() => void load(next)}>
          Load older records
        </Button>
      )}
      {error && <Notice tone="bad">{error}</Notice>}
      {result && <Notice tone="ok">{result}</Notice>}
      {confirmation ? (
        <div className="record-confirm">
          <p>
            {confirmation === "all"
              ? `Remove all ${definition.label.toLowerCase()} in this ${definition.scope}, including records beyond the current list?`
              : `Remove ${selected.length} selected records?`}{" "}
            {definition.behavior ?? "This action is permanent."}
          </p>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => setConfirmation(null)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={busy}
            onClick={() => void remove(confirmation)}
          >
            Confirm removal
          </Button>
        </div>
      ) : (
        <div className="record-actions record-destructive">
          <Button
            size="sm"
            variant="danger"
            disabled={!selected.length || busy}
            onClick={() => setConfirmation("selected")}
          >
            <Trash2 size={14} />
            Delete selected
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={!rows.length || busy}
            onClick={() => setConfirmation("all")}
          >
            Delete all {definition.label.toLowerCase()}
          </Button>
        </div>
      )}
    </>
  );
}
