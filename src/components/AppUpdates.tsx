"use client";
import { useEffect, useState } from "react";
import { Download, History, PanelsTopLeft, Check } from "lucide-react";
import releaseNotes from "../../release-notes.json";
import WorkspaceDialog from "./WorkspaceDialog";

type Release = { title: string; changes: string[] };
type Status = {
  phase: string;
  installed: string;
  available: string | null;
  message: string;
  notes?: {title:string; changes:string[]}[];
};
export default function AppUpdates() {
  const [state, setState] = useState<Status | null>(null),
    [open, setOpen] = useState(false),
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
        if (data.phase === "idle" && !data.available && data.installed) {
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
  return (
    <>
      <button
        type="button"
        className={"release-launch" + (state.available ? " available" : "")}
        onClick={() => setOpen(true)}
      >
        {state.available ? <Download size={15} /> : <History size={15} />}
        {working
          ? "Updating…"
          : state.available
            ? "Update available"
            : "Changelog"}
      </button>
      {open && (
        <WorkspaceDialog
          label="Updates and changelog"
          close={() => setOpen(false)}
        >
          <section className="release-panel">
            <header className="release-heading">
              <span className="release-symbol"><PanelsTopLeft size={25}/></span>
              <h2>{release.title}</h2>
            </header>
            <ul className="release-changes">
              {release.changes.map(change => (
                <li key={change}><Check size={15} aria-hidden="true"/><span>{change}</span></li>
              ))}
            </ul>
            <footer className="release-footer">
              <p role="status">{error || state.message || (working ? "Updating…" : state.available ? "Ready to install." : "You're up to date.")}</p>
              {state.available && <button type="button" disabled={working} onClick={update}><Download size={15}/>{working ? "Updating…" : "Update and restart"}</button>}
            </footer>
          </section>
        </WorkspaceDialog>
      )}
    </>
  );
}
