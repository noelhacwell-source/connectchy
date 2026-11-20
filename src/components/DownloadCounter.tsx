"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, BarChart3, Download, Users } from "lucide-react";
import WorkspaceDialog from "./WorkspaceDialog";
import { installId, installPlatform } from "@/lib/install-id";
import { DOWNLOAD_KINDS, DOWNLOAD_LABELS } from "@/lib/download-versions";

type Count = {
  total: number;
  downloads: number;
  lastDownloadAt: string | null;
  byKind: { kind: string; installs: number; downloads: number }[];
  trend: { day: string; installs: number }[];
  counted: string[];
  previousDownloads: Record<string, number>;
};

const number = new Intl.NumberFormat("en-US");

function when(value: string | null) {
  if (!value) return "no downloads yet";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "no downloads yet";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function failure(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return new Error(body?.error || fallback);
}

/** Downloads the VS Code extension through the counted route and saves it. */
export async function downloadExtension(token?: string) {
  const response = await fetch("/api/downloads/vscode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, installId: installId(), platform: installPlatform() }),
  });
  if (!response.ok) throw await failure(response, "The extension could not be downloaded.");
  save(await response.blob(), "connectchy-vscode.vsix");
}

/**
 * The counter. Every number comes from GET /api/downloads, which reads the rows
 * this server wrote while handing out a real plugin or extension file, so the
 * badge is never a hard-coded guess.
 */
export default function DownloadCounter({ token }: { token?: string }) {
  const [count, setCount] = useState<Count | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/downloads?installId=${encodeURIComponent(installId())}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      setCount((await response.json()) as Count);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    let live = true;
    const tick = () => {
      if (live) void load();
    };
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 20000);
    return () => {
      live = false;
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load]);

  const downloadPlugin = async () => {
    if (!token) throw new Error("Open a workspace and use Connection setup to get the plugin for it.");
    const response = await fetch("/api/plugin/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        origin: window.location.origin,
        format: "rbxmx",
        installId: installId(),
        platform: installPlatform(),
      }),
    });
    if (!response.ok) throw await failure(response, "The plugin file could not be downloaded.");
    save(await response.blob(), "StudioLink.rbxmx");
  };

  const download = async (kind: "plugin" | "vscode") => {
    setBusy(true);
    setError("");
    try {
      if (kind === "vscode") await downloadExtension(token);
      else await downloadPlugin();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The download could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const peak = useMemo(() => Math.max(1, ...(count?.trend.map((day) => day.installs) ?? [0])), [count]);
  const label = failed || !count ? "—" : number.format(count.total);

  return (
    <>
      <button
        type="button"
        className={"download-counter" + (failed ? " unavailable" : "")}
        onClick={() => setOpen(true)}
        aria-label={count ? `${number.format(count.total)} people downloaded Connectchy` : "Download counter"}
        title={
          failed
            ? "The download counter needs its local database."
            : count
              ? `${number.format(count.total)} installs · ${number.format(count.downloads)} files sent`
              : "Loading the real download count"
        }
      >
        <Download size={14} aria-hidden="true" />
        <strong>{label}</strong>
        <span>downloads</span>
      </button>
      {open && (
        <WorkspaceDialog label="Download counter" close={() => setOpen(false)}>
          <section className="release-panel download-panel">
            <header className="release-heading">
              <span className="release-symbol"><BarChart3 size={25} /></span>
              <h2>New Download Counter</h2>
              <p>Real installs recorded by this dashboard.</p>
            </header>
            <div className="download-totals">
              <div>
                <strong>{count ? number.format(count.total) : "—"}</strong>
                <span><Users size={13} /> people installed Connectchy</span>
              </div>
              <div>
                <strong>{count ? number.format(count.downloads) : "—"}</strong>
                <span><ArrowDownToLine size={13} /> files downloaded</span>
              </div>
            </div>
            {failed && (
              <p className="download-note" role="alert">
                The counter cannot reach its database, so it shows no number instead of a guess.
              </p>
            )}
            <div className="download-breakdown">
              {DOWNLOAD_KINDS.map((kind) => {
                const row = count?.byKind.find((item) => item.kind === kind);
                const counted = count?.counted.includes(kind);
                return (
                  <article key={kind}>
                    <h3>{DOWNLOAD_LABELS[kind]}</h3>
                    <p>
                      <strong>{row ? number.format(row.installs) : "—"}</strong> installs · {row ? number.format(row.downloads) : "—"} files
                    </p>
                    <button
                      type="button"
                      disabled={busy || (kind === "plugin" && !token)}
                      title={kind === "plugin" && !token ? "Open this from a workspace to get its plugin." : undefined}
                      onClick={() => void download(kind)}
                    >
                      <Download size={14} />
                      {busy ? "Downloading…" : counted ? "Download again" : "Download"}
                    </button>
                  </article>
                );
              })}
            </div>
            <div className="download-trend" aria-label="Installs in the last 30 days">
              {count?.trend.length ? (
                count.trend.map((day) => (
                  <span key={day.day} title={`${day.day}: ${day.installs}`} style={{ height: `${Math.max(6, (day.installs / peak) * 100)}%` }} />
                ))
              ) : (
                <p className="download-note">New installs from the last 30 days appear here.</p>
              )}
            </div>
            <footer className="release-footer">
              <p role="status">{error || `Last install ${when(count?.lastDownloadAt ?? null)}.`}</p>
              <p>
                Each browser or VS Code install counts once, so the number is real installs rather than page views. The counter keeps a salted hash of a random
                install id, never an IP address or an account.
              </p>
            </footer>
          </section>
        </WorkspaceDialog>
      )}
    </>
  );
}
