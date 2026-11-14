"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Link2,
  Plus,
  Sparkles,
  Users,
  ArrowUpRight,
  FolderOpen,
} from "lucide-react";
import {
  extractToken,
  parseSaved,
  readSavedRaw,
  rememberConnection,
  subscribeNever,
  type Status,
} from "@/lib/client";
import { requestJson } from "@/lib/workspace-client";
import { Button, Notice } from "./ui";
export default function Home() {
  const router = useRouter(),
    raw = useSyncExternalStore(subscribeNever, readSavedRaw, () => null),
    saved = useMemo(() => (raw === null ? [] : parseSaved(raw)), [raw]);
  const [name, setName] = useState(""),
    [paste, setPaste] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [statuses, setStatuses] = useState<Record<string, Status | "gone">>({});
  useEffect(() => {
    let live = true;
    for (const item of saved)
      void fetch(`/api/agent/${item.token}/status`)
        .then(async (r) => {
          const d = r.status === 404 ? "gone" : await r.json();
          if (live) setStatuses((p) => ({ ...p, [item.token]: d }));
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [saved]);
  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await requestJson<{ token: string; name: string }>(
        "/api/connections",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, origin: window.location.origin }),
        },
      );
      rememberConnection(d);
      router.push(`/c/${d.token}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create project.");
      setBusy(false);
    }
  };
  const open = (e: FormEvent) => {
    e.preventDefault();
    const token = extractToken(paste);
    if (!token) {
      setError("Paste a Studio Link project or agent link.");
      return;
    }
    router.push(`/c/${token}`);
  };
  const projects = saved.filter((p) => statuses[p.token] !== "gone");
  return (
    <div className="home-shell">
      <header className="home-header">
        <Link href="/" className="flex items-center gap-3">
          <span className="brand-glyph">
            s<span>l</span>
          </span>
          <span className="text-sm font-semibold tracking-tight">
            studio link
            <span className="ml-2 text-[10px] font-normal text-dim">
              WORKSPACE
            </span>
          </span>
        </Link>
        <span className="flex items-center gap-2 text-xs text-muted">
          <span className="connection-dot online" />
          Built for building together
        </span>
      </header>
      <main className="home-main">
        <section className="home-hero">
          <p className="eyebrow">ONE STUDIO. A WHOLE TEAM OF IDEAS.</p>
          <h1>
            Your agents.
            <br />A shared place to create.
          </h1>
          <p>
            Connect your AI team to Roblox Studio. Plan in rooms, build with
            clear roles, and keep the changes in view. You bring the direction.
          </p>
        </section>
        {error && (
          <div className="mb-5">
            <Notice tone="bad">{error}</Notice>
          </div>
        )}
        <div className="home-grid">
          <section className="home-card">
            <div className="mb-4 flex items-center gap-3">
              <span className="project-icon">
                <Plus size={18} />
              </span>
              <h2>Start a project</h2>
            </div>
            <p>
              A private workspace for your game, agents and shared decisions.
            </p>
            <form className="mt-5" onSubmit={create}>
              <label className="field-label">
                Project name
                <input
                  className="workspace-input mt-2"
                  placeholder="The next great idea"
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <Button
                className="mt-4 w-full"
                type="submit"
                variant="primary"
                disabled={busy}
              >
                {busy ? "Creating workspace…" : "Create workspace"}
                <ArrowRight size={15} />
              </Button>
            </form>
          </section>
          <section className="home-card">
            <div className="mb-4 flex items-center gap-3">
              <span className="project-icon">
                <Link2 size={18} />
              </span>
              <h2>Open an existing project</h2>
            </div>
            <p>
              Have a project link already? Pick up the conversation where you
              left off.
            </p>
            <form className="mt-5" onSubmit={open}>
              <label className="field-label">
                Project or agent link
                <input
                  className="workspace-input mt-2"
                  placeholder="Paste your Studio Link URL"
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                />
              </label>
              <Button
                className="mt-4 w-full"
                type="submit"
                disabled={!paste.trim()}
              >
                Open workspace
                <ArrowUpRight size={15} />
              </Button>
            </form>
          </section>
        </div>
        <section className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Your workspaces</h2>
            <span className="text-xs text-dim">Saved in this browser</span>
          </div>
          <div className="project-list">
            {projects.map((p) => {
              const status = statuses[p.token];
              return (
                <Link
                  href={`/c/${p.token}`}
                  key={p.token}
                  className="saved-project"
                >
                  <div className="flex items-center justify-between">
                    <FolderOpen size={20} className="text-signal" />
                    <ArrowUpRight size={15} className="text-dim" />
                  </div>
                  <h3 className="mt-5">{p.name}</h3>
                  <p className="flex items-center gap-2">
                    <span
                      className={`connection-dot ${status && status !== "gone" && status.online ? "online" : ""}`}
                    />
                    {status && status !== "gone" && status.online
                      ? (status.placeName ?? "Studio connected")
                      : "Open project"}
                  </p>
                </Link>
              );
            })}
          </div>
          {!projects.length && (
            <div className="mt-5 rounded-xl border border-dashed border-line p-7 text-sm text-muted">
              Your projects will appear here after you create or open one.
            </div>
          )}
        </section>
        <footer className="mt-16 border-t border-line pt-6 text-xs leading-relaxed text-dim">
          AI clients connect through your private link. Studio Link does not run
          AI models for you.
          <br />
          Keep the app and Studio open while your agents work.
        </footer>
      </main>
    </div>
  );
}
