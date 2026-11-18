"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  CirclePlay,
  Download,
  Film,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import {
  VIDEO_SECTIONS,
  orderedItems,
  type LayoutSettings,
} from "@/lib/layout-settings";
import { type ManagedRecord } from "@/lib/record-collections";
import { requestJson } from "@/lib/workspace-client";
import { AskAgent } from "./AgentDirectory";
import { VideoAttachment } from "./VideoAttachment";
import { Button, Notice } from "./ui";
import WorkspaceDialog from "./WorkspaceDialog";

export default function VideoLibrary({
  token,
  activeRoom,
  activeName,
  manage,
  limitMb,
  customizeUploads,
  layout,
}: {
  token: string;
  activeRoom: number | null;
  activeName?: string;
  manage: () => void;
  limitMb: number | null;
  customizeUploads: () => void;
  layout: LayoutSettings;
}) {
  const base = `/api/agent/${token}`;
  const url = base + "/records?kind=video";
  const [records, setRecords] = useState<ManagedRecord[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [caption, setCaption] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{
    id: number;
    name: string;
    caption: string;
  } | null>(null);
  const load = useCallback(
    async (cursor?: number) => {
      const result = await requestJson<{
        records: ManagedRecord[];
        next: number | null;
      }>(url + (cursor ? "&before=" + cursor : ""));
      setRecords((previous) =>
        cursor
          ? [
              ...previous,
              ...result.records.filter(
                (row) => !previous.some((old) => old.id === row.id),
              ),
            ]
          : result.records,
      );
      setNext(result.next);
      setLoaded(true);
    },
    [url],
  );
  useEffect(() => {
    const timer = setTimeout(
      () => void load().catch((e) => setError(e.message)),
      0,
    );
    return () => clearTimeout(timer);
  }, [load]);
  async function remove(id: number) {
    setBusy(true);
    setError("");
    try {
      await requestJson(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "selected", ids: [id] }),
      });
      setConfirm(null);
      if (selected === id) setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete video.");
    } finally {
      setBusy(false);
    }
  }
  async function saveDetails() {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      await requestJson(base + "/videos?id=" + editing.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editing.name, caption: editing.caption }),
      });
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not edit clip details.");
    } finally {
      setBusy(false);
    }
  }
  const visible = records.filter((r) =>
    [r.title, r.detail, r.author, r.state]
      .join(" ")
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const blocks: Record<string, ReactNode> = {
    "video-heading": (
      <header className="video-page-head">
        <div className="video-heading-icon">
          <Film size={26} />
        </div>
        <div>
          <h1>{layout.labels["video-heading"] || "Videos & images"}</h1>
          <details className="clip-access-help">
            <summary>How agents view clips</summary>
            <p>
              Linked agents can fetch a shared clip if their client supports it.
              Ask about clip sends still frames to a vision model, or the
              caption and your description to a text model.
            </p>
          </details>
        </div>
        <Button size="sm" onClick={manage}>
          Manage videos
        </Button>
      </header>
    ),
    "video-upload": (
      <div className="video-uploader">
        {layout.labels["video-upload"] && (
          <h2>{layout.labels["video-upload"]}</h2>
        )}
        <label className="field-label">
          Caption <span className="text-dim">optional</span>
          <input
            className="workspace-input"
            placeholder="Describe what the clip shows"
            maxLength={4000}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
        </label>
        <div className="video-upload-actions">
          <small>
            {activeName
              ? `Posts to #${activeName} · MP4, WebM, MOV, JPEG, PNG, WebP or GIF · ${limitMb === null ? "Unlimited size" : `${limitMb} MB`}`
              : "Open an active room to upload."}
          </small>
          <div className="record-actions">
            <button
              className="studio-inline video-settings-launch"
              onClick={customizeUploads}
            >
              Upload settings
            </button>
            {activeRoom && (
              <VideoAttachment
                url={`${base}/videos?room=${activeRoom}`}
                caption={caption}
                limitMb={limitMb}
                label="Add videos or images"
                error={setError}
                done={() => {
                  setCaption("");
                  setError("");
                  void load().catch((e) => setError(e.message));
                }}
              />
            )}
          </div>
        </div>
      </div>
    ),
    "video-library": (
      <>
        {layout.labels["video-library"] && (
          <h2>{layout.labels["video-library"]}</h2>
        )}
        <div className="video-library-bar">
          <span>
            {visible.length} {visible.length === 1 ? "attachment" : "attachments"} loaded
          </span>
          <label className="search-field">
            <Search size={15} />
            <input
              aria-label="Search videos"
              placeholder="Search attachments"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <div className="video-cards">
          {visible.map((clip) => (
            <article key={clip.id} className="video-card">
              {clip.mime?.startsWith("image/") ? <img loading="lazy" className="attachment-image" alt={clip.detail || clip.title} src={`${base}/videos?id=${clip.id}`}/> : selected === clip.id ? (
                <video
                  aria-label={clip.title}
                  src={`${base}/videos?id=${clip.id}`}
                  controls
                  autoPlay
                  preload="metadata"
                />
              ) : (
                <button
                  className="video-preview"
                  onClick={() => setSelected(clip.id)}
                  aria-label={`Play ${clip.title}`}
                >
                  <CirclePlay size={32} />
                </button>
              )}
              <div className="video-card-body">
                <small>
                  #{clip.state} · {new Date(clip.date).toLocaleDateString()}
                </small>
                <h2>{clip.title}</h2>
                {clip.detail && <p>{clip.detail}</p>}
                {confirm === clip.id ? (
                  <div className="record-actions">
                    <span>Remove this clip?</span>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy}
                      onClick={() => void remove(clip.id)}
                    >
                      Remove
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => setConfirm(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="record-actions">
                    <button
                      className="studio-inline"
                      onClick={() => {
                        setError("");
                        setEditing({
                          id: clip.id,
                          name: clip.title,
                          caption: clip.detail,
                        });
                      }}
                    >
                      <Pencil size={14} />
                      Edit details
                    </button>
                    {clip.roomId === activeRoom && activeRoom && (
                      <AskAgent
                        token={token}
                        roomId={activeRoom}
                        videoId={clip.id}
                        done={() => {}}
                      />
                    )}
                    <a
                      className="studio-inline"
                      href={`${base}/videos?id=${clip.id}`}
                      download={clip.title}
                    >
                      <Download size={14} />
                      Download
                    </a>
                    <button
                      className="studio-inline text-bad"
                      aria-label={`Remove ${clip.title}`}
                      onClick={() => setConfirm(clip.id)}
                    >
                      <Trash2 size={14} />
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
        {!visible.length && (
          <div className="video-empty">
            <Film size={28} />
            <p>
              {!loaded
                ? "Loading videos…"
                : records.length
                  ? "No videos match your search."
                  : "No attachments yet."}
            </p>
          </div>
        )}
        {next && (
          <Button
            className="mt-4"
            onClick={() => void load(next).catch((e) => setError(e.message))}
          >
            Load older clips
          </Button>
        )}
      </>
    ),
  };
  return (
    <section className="tool-page video-page">
      {error && !editing && <Notice tone="bad">{error}</Notice>}
      {orderedItems(VIDEO_SECTIONS, layout.video)
        .filter((item) => !layout.hidden.includes(item.id))
        .map((item) => (
          <Fragment key={item.id}>{blocks[item.id]}</Fragment>
        ))}
      {editing && (
        <WorkspaceDialog
          label="Edit clip details"
          close={() => setEditing(null)}
        >
          <form
            className="studio-form p-6"
            onSubmit={(event) => {
              event.preventDefault();
              void saveDetails();
            }}
          >
            <h2>Edit clip details</h2>
            <label className="field-label">
              Title
              <input
                required
                maxLength={160}
                className="workspace-input"
                value={editing.name}
                onChange={(event) =>
                  setEditing({ ...editing, name: event.target.value })
                }
              />
            </label>
            <label className="field-label">
              Caption or description
              <textarea
                rows={5}
                maxLength={4000}
                className="workspace-input"
                value={editing.caption}
                onChange={(event) =>
                  setEditing({ ...editing, caption: event.target.value })
                }
              />
            </label>
            {error && <Notice tone="bad">{error}</Notice>}
            <Button type="submit" variant="primary" disabled={busy}>
              Save details
            </Button>
          </form>
        </WorkspaceDialog>
      )}
    </section>
  );
}
