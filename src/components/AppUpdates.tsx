"use client";
import { useEffect, useState } from "react";
import { Download, History, PanelsTopLeft, Check, ArrowRight, RefreshCw } from "lucide-react";
import releaseNotes from "../../release-notes.json";
import WorkspaceDialog from "./WorkspaceDialog";

type Release = { title: string; changes: string[] };
type Status = {
  phase: string;
  progress?: number;
  installed: string;
  available: string | null;
  message: string;
  notes?: { title: string; changes: string[] }[];
};
export default function AppUpdates() {
  const [state, setState] = useState<Status | null>(null),
    [open, setOpen] = useState(() => {
      try {
        return sessionStorage.getItem("connectchy:installing") === "1";
      } catch {
        return false;
      }
    }),
    [requested, setRequested] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let stopped = false,
      timer: ReturnType<typeof setTimeout>,
      firstRevision: string | undefined;
    async function poll() {
      let interval = 10000;
      try {
        const response = await fetch("/api/app-updates", { cache: "no-store" });
        if (response.status === 403) return;
        if (!response.ok) throw Error();
        const data: Status = await response.json();
        if (stopped) return;
        if (firstRevision !== undefined && firstRevision !== data.installed) {
          location.reload();
          return;
        }
        firstRevision = data.installed;
        setState(data);
        if (
          data.phase === "installing" ||
          data.phase === "checking" ||
          requested
        )
          interval = 1200;
        if (data.phase === "error") setRequested(false);
        if (data.phase === "installing")
          try {
            sessionStorage.setItem("connectchy:installing", "1");
          } catch {}
        if (data.phase === "idle" && !data.available && data.installed) {
          try {
            if (sessionStorage.getItem("connectchy:installing") === "1") {
              sessionStorage.removeItem("connectchy:installing");
              setOpen(true);
            }
          } catch {}
          try {
            const last = localStorage.getItem("connectchy:release-seen");
            if (
              (last && last !== data.installed) ||
              sessionStorage.getItem("connectchy:introduce") === data.installed
            )
              setOpen(true);
            sessionStorage.removeItem("connectchy:introduce");
            localStorage.setItem("connectchy:release-seen", data.installed);
          } catch {}
        }
      } catch {
        // The server restarts itself during a self-install. Keep the window open
        // and reload as soon as the new revision answers.
        interval = 2000;
      }
      if (!stopped) timer = setTimeout(poll, interval);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [requested]);
  async function update() {
    setRequested(true);
    setError("");
    try {
      const r = await fetch("/api/app-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha: state?.available }),
      });
      if (!r.ok)
        throw Error((await r.json()).error || "Could not request update.");
      try {
        sessionStorage.setItem("connectchy:introduce", state!.available!);
      } catch {}
    } catch (e) {
      setRequested(false);
      setError(e instanceof Error ? e.message : "Could not request update.");
    }
  }
  if (!state) return null;
  const release = (state.available && state.notes?.[0]) || releaseNotes.releases[0];
  const working = state.phase === "installing" || requested;
  const hasUpdate = !!state.available;
  const short = (s: string | null) => (s ? s.slice(0, 7) : "");
  const statusText =
    error ||
    state.message ||
    (working ? "Preparing the update…" : hasUpdate ? "Ready to install." : "You're up to date.");
  const statusKind = error ? "bad" : working ? "working" : hasUpdate ? "ready" : "current";
  return (
    <>
      <button
        type="button"
        className={"release-launch" + (state.available ? " available" : "")}
        onClick={() => setOpen(true)}
        title={
          state.available
            ? "A newer version is on GitHub. Open to update."
            : "Changelog. Connectchy checks GitHub every 10 minutes."
        }
      >
        {state.available ? <Download size={14} /> : <History size={14} />}
        {working
          ? `Updating ${state.phase === "installing" ? state.progress ?? 0 : 0}%`
          : state.available
            ? "Update"
            : "Changelog"}
        {state.available && !working && <span className="release-dot" aria-label="new version" />}
      </button>
      {open && (
        <WorkspaceDialog label="Updates and changelog" close={() => setOpen(false)}>
          <section className="release-panel">
            <div className="release-card">
              <header className="release-head">
                <span className={`release-kind ${statusKind}`}>
                  {hasUpdate ? <Download size={13} strokeWidth={2} /> : <Check size={13} strokeWidth={2} />}
                  {hasUpdate ? "Update available" : "Up to date"}
                </span>
                <div className="release-symbol">
                  {hasUpdate ? (
                    <PanelsTopLeft size={34} strokeWidth={2.2} />
                  ) : (
                    <History size={34} strokeWidth={2.2} />
                  )}
                </div>
                <h2 className="release-title">{release.title}</h2>
                <p className="release-sub">
                  {hasUpdate
                    ? "A newer version is ready on GitHub. Connectchy checks for updates every 10 minutes."
                    : "You're on the latest release. Connectchy checks GitHub every 10 minutes."}
                </p>
                {hasUpdate && (
                  <div className="version-compare">
                    <div className="ver-item">
                      <span className="ver-label">Installed</span>
                      <span className="ver-sha">{short(state.installed)}</span>
                    </div>
                    <span className="ver-arrow"><ArrowRight size={11} strokeWidth={2} /></span>
                    <div className="ver-item">
                      <span className="ver-label">Available</span>
                      <span className="ver-sha">{short(state.available)}</span>
                    </div>
                  </div>
                )}
              </header>

              <ul className="release-changes">
                {release.changes.map((change, i) => (
                  <li key={i} className="change-item">
                    <div className="change-mark"><Check size={12} strokeWidth={2.2} fill="#ffffff" /></div>
                    <span className="change-text">{change}</span>
                  </li>
                ))}
              </ul>

              <footer className="release-foot">
                {working && <label className="install-progress">Installation steps completed · {state.phase === "installing" ? state.progress ?? 0 : 0}%<progress aria-label="Installation steps completed" max={100} value={state.phase === "installing" ? state.progress ?? 0 : 0}/></label>}
                <p className="status-text" role="status">
                  {statusText}
                </p>
                <div className="release-actions">
                  {hasUpdate && (
                    <button
                      type="button"
                      className={`update-btn ${working ? "working" : ""}`}
                      disabled={working}
                      onClick={update}
                    >
                      {working ? (
                        <>
                          <RefreshCw size={14} strokeWidth={2.2} className="spin" />
                          <span>Updating…</span>
                        </>
                      ) : (
                        <>
                          <Download size={14} />
                          <span>Update and restart</span>
                        </>
                      )}
                    </button>
                  )}
                  {!hasUpdate && (
                    <button type="button" className="close-btn" onClick={() => setOpen(false)}>
                      Got it
                    </button>
                  )}
                </div>
              </footer>
            </div>
          </section>
        </WorkspaceDialog>
      )}
    </>
  );
}
