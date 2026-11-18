"use client";
import DeleteRecord from "./DeleteRecord";
import { copyText } from "@/lib/clipboard";
import WorkspaceDialog from "./WorkspaceDialog";
import { diffLines } from "diff";
import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Plus,
  Search,
  ChevronRight,
  ClipboardList,
  NotebookPen,
  Lightbulb,
  Bookmark,
  Save,
  Trash2,
  X,
  Copy,
  ShieldCheck,
  Camera,
  CheckCircle2,
  Link2,
  Clock,
  Package,
  AlertTriangle,
  Send,
  ArrowRight,
} from "lucide-react";
import {
  requestJson,
  postJson,
  downloadText,
  type WorkspaceEntry,
  type EntryKind,
} from "@/lib/workspace-client";
import type { TeamPlan } from "@/lib/team-types";
import { Button, Notice, JsonView } from "./ui";
const LABELS: Record<
  EntryKind,
  { title: string; subtitle: string; singular: string }
> = {
  task: {
    title: "A little structure. A lot more progress.",
    subtitle: "Give every piece of work an owner and a clear next step.",
    singular: "task",
  },
  note: {
    title: "One shared source of context.",
    subtitle:
      "Write contracts, references and instructions that everyone can find.",
    singular: "note",
  },
  decision: {
    title: "Keep the why behind the work.",
    subtitle: "A persistent record of choices your team can build on.",
    singular: "decision",
  },
  bookmark: {
    title: "Keep the useful things close.",
    subtitle: "Links and Studio paths, shared with your whole team.",
    singular: "bookmark",
  },
  handoff: {
    title: "Pick up where the team left off.",
    subtitle: "Saved snapshots of the room, roles, tasks and recent decisions.",
    singular: "handoff",
  },
  checkpoint: {
    title: "A way back to a known source.",
    subtitle:
      "Capture selected script sources before the next round of changes.",
    singular: "checkpoint",
  },
  check: {
    title: "Check the assumptions.",
    subtitle:
      "Verify configured instance paths against the open Studio session.",
    singular: "check",
  },
};
const STATES = [
  ["backlog", "To do"],
  ["doing", "In progress"],
  ["blocked", "Blocked"],
  ["review", "In review"],
  ["done", "Done"],
] as const;
export default function WorkspaceTools({
  token,
  kind,
  roomId,
  team,
}: {
  token: string;
  kind: EntryKind;
  roomId: number | null;
  team: TeamPlan;
}) {
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [editor, setEditor] = useState(false),
    [editing, setEditing] = useState<WorkspaceEntry | null>(null),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [owner, setOwner] = useState(""),
    [state, setState] = useState("backlog"),
    [priority, setPriority] = useState("normal"),
    [deps, setDeps] = useState<number[]>([]),
    [url, setUrl] = useState(""),
    [due, setDue] = useState(""),
    [paths, setPaths] = useState(""),
    [expanded, setExpanded] = useState<number | null>(null),
    [confirmRestore, setConfirmRestore] = useState<number | null>(null),
    [confirmDelete, setConfirmDelete] = useState<number | null>(null),
    [notice, setNotice] = useState("");
  const endpoint = `/api/agent/${token}/workspace`,
    labels = LABELS[kind];
  const load = useCallback(async () => {
    const d = await requestJson<{ entries: WorkspaceEntry[] }>(
      endpoint + `?kind=${kind}${roomId ? `&room=${roomId}` : ""}`,
    );
    setEntries(d.entries);
  }, [endpoint, kind, roomId]);
  useEffect(() => {
    let live = true;
    const poll = () =>
      load().catch((e) => {
        if (live) setError(e.message);
      });
    void poll();
    const timer = setInterval(poll, 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [load]);
  const action = async (data: object) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const d = await postJson<{
        ok?: boolean;
        error?: string;
        allOk?: boolean;
        result?: { allOk?: boolean; failed?: number };
      }>(endpoint + (roomId ? `?room=${roomId}` : ""), data);
      if (d.ok === false)
        throw new Error(d.error ?? "The Studio command failed.");
      if (d.result?.allOk === false)
        throw new Error(
          "Restore was only partially applied. Inspect Activity and use Studio undo if necessary.",
        );
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const openEditor = (entry?: WorkspaceEntry) => {
    setEditing(entry ?? null);
    setTitle(entry?.title ?? "");
    setBody(entry?.body ?? "");
    setOwner(entry?.owner ?? "");
    setState(entry?.status ?? "backlog");
    setPriority(entry?.priority ?? "normal");
    setDeps(entry?.data.dependencies ?? []);
    setUrl(entry?.data.url ?? "");
    setDue(entry?.data.due?.slice(0, 10) ?? "");
    setEditor(true);
  };
  const save = async () => {
    if (
      await action({
        action: editing ? "update" : "create",
        id: editing?.id,
        revision: editing?.revision,
        entry: {
          kind,
          title,
          body,
          owner,
          status: state,
          priority,
          data: {
            dependencies: deps,
            tags: [],
            ...(url ? { url } : {}),
            ...(due ? { due } : {}),
          },
        },
      })
    )
      setEditor(false);
  };
  const filtered = entries.filter((e) =>
    `${e.title} ${e.body} ${e.owner}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const card = (entry: WorkspaceEntry) => (
    <article className={`work-card priority-${entry.priority}`} key={entry.id}>
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow">
          {kind === "task" ? `TASK ${entry.id}` : kind.toUpperCase()}
        </span>
        <span className={`priority-label ${entry.priority}`}>
          {entry.priority === "normal" ? "" : entry.priority}
        </span>
      </div>
      <button
        className="mt-3 block w-full text-left font-medium text-text"
        onClick={() =>
          kind === "task" || ["note", "decision", "bookmark"].includes(kind)
            ? openEditor(entry)
            : setExpanded(expanded === entry.id ? null : entry.id)
        }
      >
        {entry.title}
      </button>
      {entry.body && (
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">
          {entry.body}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-dim">
        <span>{entry.owner || "Unassigned"}</span>
        {entry.data.due && (
          <span>
            <Clock size={11} className="mr-1 inline" />
            {new Date(entry.data.due).toLocaleDateString()}
          </span>
        )}
        {!!entry.data.dependencies?.length && (
          <span>
            {entry.data.dependencies.length} dependenc
            {entry.data.dependencies.length === 1 ? "y" : "ies"}
          </span>
        )}
      </div>
    </article>
  );
  return (
    <section className="tool-page">
      <div className="tool-heading">
        <div>
          <p className="eyebrow">
            {kind === "task" ? "THE TASK BOARD" : kind.toUpperCase() + "S"}
          </p>
          <h1>{labels.title}</h1>
          <p>{labels.subtitle}</p>
        </div>
        {["task", "note", "decision", "bookmark"].includes(kind) && (
          <Button variant="primary" onClick={() => openEditor()}>
            <Plus size={15} />
            New {labels.singular}
          </Button>
        )}
        {kind === "handoff" && (
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void action({ action: "handoff" })}
          >
            <Save size={15} />
            Save room handoff
          </Button>
        )}
      </div>
      {error && (
        <div className="mb-4">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
      {notice && (
        <div className="mb-4">
          <Notice tone="ok">{notice}</Notice>
        </div>
      )}
      {["checkpoint", "check"].includes(kind) && (
        <div className="capture-card">
          <div className="flex items-start gap-3">
            {kind === "checkpoint" ? (
              <Camera size={22} className="text-signal" />
            ) : (
              <ShieldCheck size={22} className="text-signal" />
            )}
            <div>
              <h2 className="font-medium">
                {kind === "checkpoint"
                  ? "Capture script sources"
                  : "Check instance paths"}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {kind === "checkpoint"
                  ? "Sources only. Restoring does not recreate deleted scripts or restore models, terrain or properties."
                  : "Checks whether the listed paths can be read. This is not a gameplay test or a script compiler."}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="field-label">
              Name
              <input
                className="workspace-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  kind === "checkpoint"
                    ? "Before the next build"
                    : "Delivery system checks"
                }
              />
            </label>
            <label className="field-label">
              Exact paths · one per line
              <textarea
                className="workspace-input"
                rows={3}
                value={paths}
                onChange={(e) => setPaths(e.target.value)}
                placeholder={
                  "ServerScriptService/GameLogic\nStarterGui/HUD/Controller"
                }
              />
            </label>
          </div>
          <Button
            className="mt-3"
            disabled={busy || !paths.trim()}
            onClick={async () => {
              if (
                await action({
                  action: kind === "checkpoint" ? "checkpoint" : "check",
                  title,
                  paths: paths
                    .split("\n")
                    .map((p) => p.trim())
                    .filter(Boolean),
                })
              )
                setNotice(
                  kind === "checkpoint"
                    ? "Script checkpoint saved."
                    : "Checks completed. See the report below.",
                );
            }}
          >
            {busy
              ? "Working with Studio…"
              : kind === "checkpoint"
                ? "Capture checkpoint"
                : "Run checks"}
          </Button>
        </div>
      )}
      <div className="mb-5 flex items-center justify-between gap-3">
        <label className="search-field max-w-sm">
          <Search size={15} />
          <input
            aria-label={`Search ${kind}s`}
            placeholder={`Search ${kind}s…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <span className="text-xs text-dim">
          {filtered.length} saved{" "}
          {filtered.length === 1 ? labels.singular : labels.singular + "s"}
        </span>
      </div>
      {kind === "task" ? (
        <div className="task-board">
          {STATES.map(([status, label]) => (
            <div className="task-column" key={status}>
              <div className="task-column-title">
                <span className={`status-dot ${status}`} />
                {label}
                <span>
                  {filtered.filter((e) => e.status === status).length}
                </span>
                <button
                  aria-label={`Add ${label} task`}
                  onClick={() => {
                    openEditor();
                    setState(status);
                  }}
                >
                  <Plus size={14} />
                </button>
              </div>
              <div className="space-y-3">
                {filtered.filter((e) => e.status === status).map(card)}
                {!filtered.some((e) => e.status === status) && (
                  <div className="empty-column">Nothing here yet</div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="entries-list">
          {filtered.map((entry) => (
            <article key={entry.id} className="entry-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="eyebrow">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                  <h3 className="mt-2 text-lg font-medium">{entry.title}</h3>
                  {entry.owner && (
                    <p className="mt-1 text-xs text-dim">{entry.owner}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  {["note", "decision", "bookmark"].includes(kind) && (
                    <button
                      className="icon-button"
                      aria-label="Edit item"
                      onClick={() => openEditor(entry)}
                    >
                      <Save size={15} />
                    </button>
                  )}
                  <button
                    className="icon-button"
                    aria-label="Copy item"
                    onClick={() =>
                      copyText(`${entry.title}\n\n${entry.body}`)
                        .catch(() =>
                          setError(
                            "Clipboard unavailable. Select and copy the text.",
                          ),
                        )
                    }
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Archive item"
                    onClick={() => setConfirmDelete(entry.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              {entry.data.url && (
                <a
                  href={entry.data.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 text-sm text-signal"
                >
                  <Link2 size={14} />
                  {entry.data.url}
                </a>
              )}
              <div
                className={`message-prose mt-4 ${kind === "handoff" && expanded !== entry.id ? "max-h-48 overflow-hidden" : ""}`}
              >
                <ReactMarkdown>{entry.body}</ReactMarkdown>
              </div>
              {kind === "handoff" && (
                <button
                  className="mt-3 text-xs text-signal"
                  onClick={() =>
                    setExpanded(expanded === entry.id ? null : entry.id)
                  }
                >
                  {expanded === entry.id ? "Collapse" : "Read full handoff"}
                </button>
              )}
              {kind === "checkpoint" && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      downloadText(
                        `checkpoint-${entry.id}.json`,
                        JSON.stringify(entry.data, null, 2),
                        "application/json",
                      )
                    }
                  >
                    Export sources
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => setConfirmRestore(entry.id)}
                  >
                    Restore scripts…
                  </Button>
                </div>
              )}
              {kind === "check" && (
                <span
                  className={`tiny-badge mt-3 ${entry.data.passed ? "live" : ""}`}
                >
                  {entry.data.passed
                    ? "All listed paths readable"
                    : "Some checks failed"}
                </span>
              )}
              {confirmDelete === entry.id && (
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <DeleteRecord token={token} kind={kind} id={entry.id} revision={entry.revision} title={entry.title} done={load}/><span>or</span>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      await action({ action: "delete", id: entry.id });
                      setConfirmDelete(null);
                    }}
                  >
                    Archive
                  </Button>
                  <Button size="sm" onClick={() => setConfirmDelete(null)}>
                    Cancel
                  </Button>
                </div>
              )}
              {confirmRestore === entry.id && (
                <div className="mt-4 rounded-xl border border-bad/30 bg-bad/5 p-4">
                  <p className="text-sm">
                    Replace the current source of these scripts with this
                    checkpoint? Changes are sent as a Studio undo step. Other
                    agents should stop editing these scripts first.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={busy}
                      onClick={async () => {
                        if (await action({ action: "restore", id: entry.id })) {
                          setConfirmRestore(null);
                          setNotice(
                            "Restore command completed. Review Activity and inspect the scripts.",
                          );
                        }
                      }}
                    >
                      Restore sources
                    </Button>
                    <Button size="sm" onClick={() => setConfirmRestore(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {!filtered.length && kind !== "task" && (
        <div className="collection-empty">
          <NotebookPen size={28} />
          <h3>No {labels.singular}s yet.</h3>
          <p>
            {["checkpoint", "check"].includes(kind)
              ? "Choose exact paths above to get started."
              : kind === "handoff"
                ? "Save a room handoff to carry context into the next session."
                : `Add your first ${labels.singular} to give the team more context.`}
          </p>
        </div>
      )}
      {editor && (
        <WorkspaceDialog
          close={() => setEditor(false)}
          label={editing ? "Edit item" : "Create item"}
        >
          <div className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                {editing ? "Edit" : "New"} {labels.singular}
              </h2>
            </div>
            <label className="field-label mt-5">
              Title
              <input
                autoFocus
                className="workspace-input"
                maxLength={160}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="field-label mt-3">
              {kind === "task" ? "Description" : "Content"}
              <textarea
                className="workspace-input"
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            {kind === "bookmark" && (
              <label className="field-label mt-3">
                URL (optional)
                <input
                  className="workspace-input"
                  placeholder="https://…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </label>
            )}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="field-label">
                Owner
                <select
                  className="workspace-input"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  <option value="Owner">You</option>
                  {team.participants.filter(p => p.control !== "removed").map((p) => (
                    <option key={p.agent} value={p.agent}>
                      {p.agent}
                    </option>
                  ))}
                  {owner &&
                    ![
                      "Owner",
                      ...team.participants.filter(p => p.control !== "removed").map((p) => p.agent),
                    ].includes(owner) && <option>{owner}</option>}
                </select>
              </label>
              {kind === "task" && (
                <>
                  <label className="field-label">
                    Status
                    <select
                      className="workspace-input"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                    >
                      {STATES.map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Priority
                    <select
                      className="workspace-input"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                    >
                      {["low", "normal", "high", "urgent"].map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Due date
                    <input
                      type="date"
                      className="workspace-input"
                      value={due}
                      onChange={(e) => setDue(e.target.value)}
                    />
                  </label>
                </>
              )}
            </div>
            {kind === "task" && (
              <fieldset className="mt-4">
                <legend className="field-label">Dependencies</legend>
                <div className="mt-2 max-h-28 space-y-2 overflow-auto">
                  {entries
                    .filter((e) => e.id !== editing?.id)
                    .map((e) => (
                      <label
                        className="flex items-center gap-2 text-sm text-muted"
                        key={e.id}
                      >
                        <input
                          type="checkbox"
                          checked={deps.includes(e.id)}
                          onChange={(ev) =>
                            setDeps(
                              ev.target.checked
                                ? [...deps, e.id]
                                : deps.filter((d) => d !== e.id),
                            )
                          }
                        />
                        {e.title} · {e.status}
                      </label>
                    ))}
                  {entries.length === 0 && (
                    <p className="text-xs text-dim">
                      Add more tasks to link dependencies.
                    </p>
                  )}
                </div>
              </fieldset>
            )}
            {error && (
              <div className="mt-3">
                <Notice tone="bad">{error}</Notice>
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              {editing&&<DeleteRecord token={token} kind={kind} id={editing.id} revision={editing.revision} title={editing.title} done={async()=>{await load();setEditor(false);}}/>}
              {editing && (
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={async () => {
                    if (await action({ action: "delete", id: editing.id }))
                      setEditor(false);
                  }}
                >
                  Archive
                </Button>
              )}
              <Button onClick={() => setEditor(false)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={busy || !title.trim()}
                onClick={() => void save()}
              >
                {busy ? "Saving…" : "Save " + labels.singular}
              </Button>
            </div>
          </div>
        </WorkspaceDialog>
      )}
    </section>
  );
}

type Review = {
  id: number;
  agent: string | null;
  type: string;
  payload: unknown;
  before: { path: string; source: string }[] | null;
};
export function ReviewPanel({ token }: { token: string }) {
  const [rows, setRows] = useState<Review[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState<number | null>(null);
  const base = `/api/agent/${token}/reviews`;
  const load = useCallback(
    () =>
      requestJson<{ reviews: Review[] }>(base).then((d) => setRows(d.reviews)),
    [base],
  );
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    const t = setInterval(
      () => void load().catch((e) => setError(e.message)),
      4000,
    );
    return () => clearInterval(t);
  }, [load]);
  const handle = async (id: number, action: string) => {
    setBusy(id);
    setError("");
    try {
      await postJson(base, { id, action });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review failed.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="tool-page">
      <div className="tool-heading">
        <div>
          <p className="eyebrow">REVIEW QUEUE</p>
          <h1>A second look before it lands.</h1>
          <p>
            Agent changes wait here. Approval queues them for Studio; rejection
            keeps them out.
          </p>
        </div>
        <span className="tiny-badge">{rows.length} waiting</span>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      {!rows.length && (
        <div className="collection-empty">
          <ShieldCheck size={32} />
          <h3>All clear.</h3>
          <p>New agent edit proposals will appear here.</p>
        </div>
      )}
      <div className="entries-list">
        {rows.map((r) => (
          <article key={r.id} className="entry-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-dim">
                  PROPOSAL #{r.id} · {r.agent ?? "Agent"}
                </p>
                <h3 className="mt-2 font-semibold">{r.type}</h3>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void handle(r.id, "reject")}
                >
                  Reject
                </Button><DeleteRecord token={token} kind="review" id={r.id} done={load}/>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void handle(r.id, "approve")}
                >
                  {busy === r.id ? "Checking…" : "Approve"}
                </Button>
              </div>
            </div>
            {r.before?.length ? (
              <div className="source-comparison">
                {r.before.map((b) => (
                  <div key={b.path}>
                    <p className="mb-2 text-xs text-dim">{b.path} · Before</p>
                    <pre>{b.source}</pre>
                  </div>
                ))}
                <div>
                  <p className="mb-2 text-xs text-dim">Changes</p>
                  {(() => {
                    const payload = r.payload as { source?: unknown };
                    const original = r.before?.[0]?.source ?? "";
                    if (typeof payload.source !== "string")
                      return <JsonView value={r.payload} />;
                    const next =
                      r.type === "append_source"
                        ? original + payload.source
                        : payload.source;
                    return (
                      <pre className="script-diff">
                        {diffLines(original, next).map((part, index) => (
                          <span
                            key={index}
                            className={
                              part.added
                                ? "diff-added"
                                : part.removed
                                  ? "diff-removed"
                                  : ""
                            }
                          >
                            {part.value.split("\n").map((line, n) => (
                              <span className="diff-row" key={n}>
                                {part.added ? "+ " : part.removed ? "− " : "  "}
                                {line}
                                {"\n"}
                              </span>
                            ))}
                          </span>
                        ))}
                      </pre>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <JsonView value={r.payload} />
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
export function AssetLibrary({ token }: { token: string }) {
  const [assets, setAssets] = useState<
      {
        id: number;
        filename: string;
        assetType: string;
        result: { response?: { assetId?: string } } | null;
      }[]
    >([]),
    [q, setQ] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    requestJson<{ assets: typeof assets }>(
      `/api/agent/${token}/workspace?kind=assets`,
    )
      .then((d) => {
        if (live) setAssets(d.assets);
      })
      .catch((e) => setError(e.message));
    return () => {
      live = false;
    };
  }, [token]);
  return (
    <section className="tool-page">
      <div className="tool-heading">
        <div>
          <p className="eyebrow">ASSET LIBRARY</p>
          <h1>Good building blocks, kept together.</h1>
          <p>
            Completed uploads from this project. Add new images, models and audio in
            Settings → Connections & assets.
          </p>
        </div>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <label className="search-field mb-6 max-w-md">
        <Search size={16} />
        <input
          aria-label="Search assets"
          placeholder="Find an uploaded asset…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <div className="asset-grid">
        {assets
          .filter((a) => a.filename.toLowerCase().includes(q.toLowerCase()))
          .map((a) => (
            <article className="asset-card" key={a.id}>
              <div className="asset-placeholder">
                <Package size={35} />
                <span>{a.assetType}</span>
              </div>
              <div className="p-4">
                <h3 className="truncate text-sm font-medium">{a.filename}</h3><DeleteRecord token={token} kind="asset" id={a.id} title={a.filename} done={()=>setAssets(prev=>prev.filter(item=>item.id!==a.id))}/>
                <p className="mt-1 text-xs text-dim">
                  Asset {a.result?.response?.assetId ?? "ID unavailable"}
                </p>
                <Button
                  className="mt-3"
                  size="sm"
                  disabled={!a.result?.response?.assetId}
                  onClick={() =>
                    copyText(`rbxassetid://${a.result?.response?.assetId}`)
                      .catch(() => setError("Clipboard unavailable."))
                  }
                >
                  <Copy size={13} />
                  Copy asset ID
                </Button>
              </div>
            </article>
          ))}
      </div>
      {!assets.length && (
        <div className="collection-empty">
          <Package size={32} />
          <h3>Your library is ready for its first asset.</h3>
          <p>Only successfully processed Roblox uploads appear here.</p>
        </div>
      )}
    </section>
  );
}
