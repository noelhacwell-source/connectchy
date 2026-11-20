"use client";
import AppUpdates from "./AppUpdates";
import DownloadCounter from "./DownloadCounter";

import ConnectchyLogo from "./ConnectchyLogo";
import ProjectUploads from "./ProjectUploads";
import ButtonDesigner from "./ButtonDesigner";
import Link from "next/link";
import WorkspaceDialog from "./WorkspaceDialog";
import CustomizeLayout from "./CustomizeLayout";
import { useLayoutSettings } from "./useLayoutSettings";
import { AppearancePanel, useAppearance } from "./Appearance";
import { HOME_SECTIONS, orderedItems } from "@/lib/layout-settings";
import { SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
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
  ArrowUpRight,
  Box,
  Code2,
  FolderOpen,
  FolderUp,
  Link2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  extractToken,
  parseSaved,
  readSavedRaw,
  rememberConnection,
  subscribeSaved,
  type Saved,
  type Status,
} from "@/lib/client";
import { requestJson } from "@/lib/workspace-client";
import DeleteWorkspaceDialog from "./DeleteWorkspaceDialog";
import { Button, Notice } from "./ui";

export default function Home() {
  const router = useRouter();
  const customization = useLayoutSettings("home");
  const appearance = useAppearance("home");
  const { layout } = customization;
  const [customizing, setCustomizing] = useState<
    "layout" | "appearance" | null
  >(null);
  const raw = useSyncExternalStore(subscribeSaved, readSavedRaw, () => "[]");
  const saved = useMemo(() => parseSaved(raw), [raw]);
  const [name, setName] = useState("");
  const [mode, setMode] = useState("roblox");
  const [paste, setPaste] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [statuses, setStatuses] = useState<Record<string, Status | "gone">>({});
  const [deleting, setDeleting] = useState<Saved | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    for (const item of saved) {
      void fetch(`/api/agent/${item.token}/status`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (response.status !== 404 && !response.ok) return;
          const value =
            response.status === 404 ? "gone" : await response.json();
          if (!controller.signal.aborted)
            setStatuses((previous) => ({ ...previous, [item.token]: value }));
        })
        .catch(() => {});
    }
    return () => controller.abort();
  }, [saved]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await requestJson<Saved>("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, origin: window.location.origin, mode }),
      });
      rememberConnection(result);
      router.push(`/c/${result.token}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create workspace.");
      setBusy(false);
    }
  }
  function open(event: FormEvent) {
    event.preventDefault();
    const token = extractToken(paste);
    if (!token) {
      setError("Paste a Connectchy project or agent link.");
      return;
    }
    router.push(`/c/${token}`);
  }

  const projects = saved.filter(
    (p) =>
      statuses[p.token] !== "gone" &&
      p.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const sections = orderedItems(HOME_SECTIONS, layout.home).filter(
    (item) => !layout.hidden.includes(item.id),
  );
  if (layout.homeSort !== "recent")
    projects.sort((a, b) => {
      const mode = (token: string) => {
        const item = statuses[token];
        return item && item !== "gone" ? (item.mode ?? "") : "";
      };
      return (
        (layout.homeSort === "editor"
          ? mode(a.token).localeCompare(mode(b.token))
          : 0) || a.name.localeCompare(b.name)
      );
    });
  const modes = [
    {id:"roblox",name:"Roblox Studio",detail:"Connect an open place",icon:Box},
    {id:"vscode",name:"VS Code",detail:"Work in a local codebase",icon:Code2},
    {id:"upload",name:"Project Upload",detail:"Share folders and versions",icon:FolderUp},
  ];
  const hasHeading=sections.some(item=>item.id==="home-heading");
  const hasCreate=sections.some(item=>item.id==="home-create");
  function modePicker(jump:boolean){
    return <div className="design-modes" aria-label="Workspace type">{modes.map(({id,name,detail,icon:Icon})=><button key={id} type="button" aria-pressed={mode===id} onClick={()=>{
      setMode(id);
      if(jump)requestAnimationFrame(()=>{const card=document.getElementById("create-workspace");card?.scrollIntoView({behavior:"instant",block:"center"});card?.querySelector<HTMLInputElement>('input:not([hidden])')?.focus({preventScroll:true})});
    }}><Icon size={22}/><span><strong>{name}</strong><small>{detail}</small></span><ArrowRight size={15}/></button>)}</div>
  }
  const blocks: Record<string, ReactNode> = {
    "home-heading": (
      <header className="design-hero">
        <div aria-hidden="true" className="bg-grid design-grid"/>
        <h1>{layout.labels["home-heading"] || <>Your agent <span className="text-shimmer">workspace</span></>}</h1>
        <p>Connect your editor, chat with your agents, or share a project.</p>
        {hasCreate && modePicker(true)}
      </header>
    ),
    "home-saved": (
      <section
        className="hub-projects"
        aria-label={layout.labels["home-saved"] || "Saved workspaces"}
      >
        <h2 className="saved-heading">{layout.labels["home-saved"] || "Saved workspaces"} <span>{saved.filter(p=>statuses[p.token]!=="gone").length}</span></h2>
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label="Find workspace"
            placeholder="Find a workspace"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {projects.length ? (
          <ul className="hub-project-list">
            {projects.map((project) => {
              const status = statuses[project.token];
              const connection = status && status !== "gone" ? status : null;
              return (
                <li key={project.token}>
                  <Link
                    href={`/c/${project.token}`}
                    className="hub-project-link"
                  >
                    <span className="project-icon">
                      {connection ? (
                        connection.mode === "vscode" ? (
                          <Code2 size={19} />
                        ) : (
                          <Box size={19} />
                        )
                      ) : (
                        <FolderOpen size={19} />
                      )}
                    </span>
                    <span>
                      <strong>{project.name}</strong>
                      <small>
                        {connection
                          ? connection.mode === "vscode"
                            ? "VS Code"
                            : "Roblox Studio"
                          : "Saved workspace"}
                        {connection?.online ? " · Connected" : ""}
                      </small>
                    </span>
                    <ArrowUpRight size={16} />
                  </Link>
                  <button
                    className="icon-button hub-delete"
                    aria-label={`Delete ${project.name}`}
                    title="Delete workspace"
                    onClick={() => setDeleting(project)}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="hub-empty">
            <FolderOpen size={30} />
            <h2>
              {search.trim() ? "No matching workspaces" : "No workspaces yet"}
            </h2>
            <p>
              {search.trim()
                ? "Try a different project name."
                : "Create a workspace or open a shared link to get started."}
            </p>
          </div>
        )}
      </section>
    ),
    "home-create": (
      <section className="home-card" id="create-workspace">
        <h2>
          <Plus size={18} />
          {layout.labels["home-create"] || modes.find(item=>item.id===mode)?.name}
        </h2>
        <div>
          {!hasHeading && modePicker(false)}
          {mode==="upload"?<ProjectUploads/>:<form onSubmit={create}><label className="field-label">
            Project name
            <input
              className="workspace-input"
              value={name}
              maxLength={60}
              placeholder="New project"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <Button
            className="w-full"
            variant="primary"
            type="submit"
            disabled={busy}
          >
            {busy ? "Creating…" : "Create workspace"}
            <ArrowRight size={15} />
          </Button>
        </form>}</div>
      </section>
    ),
    "home-open": (
      <section className="home-card">
        <h2>
          <Link2 size={17} />
          {layout.labels["home-open"] || "Open a workspace"}
        </h2>
        <form onSubmit={open}>
          <label className="field-label">
            Project or agent link
            <input
              className="workspace-input"
              placeholder="Paste a Connectchy link"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
          </label>
          <Button className="w-full" type="submit" disabled={!paste.trim()}>
            Open workspace
            <ArrowUpRight size={15} />
          </Button>
        </form>
      </section>
    ),
  };
  return (
    <div
      className="home-shell project-hub custom-home"
      {...appearance.attributes}
      style={{ ...appearance.style, ...customization.style }}
      data-density={layout.density}
      data-motion={layout.motion}
    >
      <ButtonDesigner layout={layout} update={customization.update}/>
      <header className="home-header">
        <Link href="/" className="flex items-center gap-3">
          <ConnectchyLogo className="design-logo"/>
          <strong>Connectchy</strong>
        </Link>
        <div className="record-actions">
          <DownloadCounter/>
          <AppUpdates/>
          {sections.some((item) => item.id === "home-create") && (
            <a href="#create-workspace" className="hub-header-action">
              <Plus size={15} />
              New workspace
            </a>
          )}
          <button
            className="settings-button"
            onClick={() => setCustomizing("layout")}
          >
            <SlidersHorizontal size={16} />
            Customize
          </button>
        </div>
      </header>
      <main className="home-main">
        {error && <Notice tone="bad">{error}</Notice>}
        {layout.homeColumns === "stacked" ? (
          <div className="hub-custom-stack">
            {sections.map((item) => (
              <div key={item.id}>{blocks[item.id]}</div>
            ))}
          </div>
        ) : (
          <>
            {sections.some((item) => item.id === "home-heading") &&
              blocks["home-heading"]}
            <div className="hub-layout" data-form-side={layout.homeFormSide}>
              {sections.some((item) => item.id === "home-saved") &&
                blocks["home-saved"]}
              <aside className="hub-forms">
                {sections
                  .filter(
                    (item) =>
                      item.id === "home-create" || item.id === "home-open",
                  )
                  .map((item) => (
                    <div key={item.id}>{blocks[item.id]}</div>
                  ))}
              </aside>
            </div>
          </>
        )}
      </main>
      {customizing && (
        <WorkspaceDialog
          label="Customize home"
          wide
          close={() => setCustomizing(null)}
        >
          <div className="settings-tabs">
            <button
              className={customizing === "layout" ? "active" : ""}
              onClick={() => setCustomizing("layout")}
            >
              Layout
            </button>
            <button
              className={customizing === "appearance" ? "active" : ""}
              onClick={() => setCustomizing("appearance")}
            >
              Appearance
            </button>
          </div>
          <div className="settings-content">
            {customizing === "layout" ? (
              <CustomizeLayout {...customization} />
            ) : (
              <AppearancePanel prefs={appearance} />
            )}
          </div>
        </WorkspaceDialog>
      )}
      {deleting && (
        <DeleteWorkspaceDialog
          workspace={deleting}
          close={() => setDeleting(null)}
          done={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
