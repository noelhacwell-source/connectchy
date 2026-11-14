"use client";
import GameReferences from "./GameReferences";
import WorkspaceDialog from "./WorkspaceDialog";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Code2,
  FolderTree,
  Hash,
  LayoutDashboard,
  Lightbulb,
  Menu,
  MessageSquare,
  MoreHorizontal,
  NotebookPen,
  Package,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  X,
  Camera,
  Activity,
  ExternalLink,
  PanelLeftClose,
  Link2,
  FileText,
} from "lucide-react";
import { rememberConnection, type Status } from "@/lib/client";
import { modules, type ModuleId } from "@/lib/modules";
import { DEFAULT_TEAM, type TeamPlan } from "@/lib/team-types";
import { requestJson, postJson, type EntryKind } from "@/lib/workspace-client";
import AgentChat, { AgentAvatar } from "./AgentChat";
import FeatureControls from "./FeatureControls";
import WorkspaceTools, { AssetLibrary, ReviewPanel } from "./WorkspaceTools";
import SetupPanel from "./SetupPanel";
import ExtensionsPanel from "./ExtensionsPanel";
import ActivityPanel from "./ActivityPanel";
import ExplorerPanel from "./ExplorerPanel";
import ConsolePanel from "./ConsolePanel";
import { Button, Notice } from "./ui";
function subscribeDesktop(callback: () => void) {
  const query = window.matchMedia("(min-width: 801px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
type Room = {
  id: number;
  name: string;
  createdAt: string;
  deletedAt: string | null;
};
type View =
  | "chat"
  | EntryKind
  | "references"
  | "assets"
  | "reviews"
  | "activity"
  | "explorer"
  | "console"
  | "insights";
const NAV = [
  {
    id: "references",
    name: "Game references",
    icon: Sparkles,
    feature: "gameReferences",
  },
  { id: "task", name: "Task board", icon: ClipboardList, feature: "taskBoard" },
  { id: "note", name: "Notebook", icon: NotebookPen, feature: "notes" },
  { id: "decision", name: "Decisions", icon: Lightbulb, feature: "decisions" },
  { id: "bookmark", name: "Bookmarks", icon: Bookmark, feature: "bookmarks" },
  { id: "handoff", name: "Handoffs", icon: FileText, feature: "handoffs" },
  {
    id: "assets",
    name: "Asset library",
    icon: Package,
    feature: "assetLibrary",
  },
  {
    id: "checkpoint",
    name: "Checkpoints",
    icon: Camera,
    feature: "checkpoints",
  },
  { id: "check", name: "Project checks", icon: ShieldCheck, feature: "checks" },
  { id: "reviews", name: "Review queue", icon: Shield, feature: "reviewQueue" },
  { id: "activity", name: "Activity", icon: Activity, feature: "activity" },
  { id: "explorer", name: "Explorer", icon: FolderTree, feature: "explorer" },
  { id: "console", name: "Console", icon: Code2, feature: "console" },
  {
    id: "insights",
    name: "Insights",
    icon: LayoutDashboard,
    feature: "insights",
  },
] as const;
export default function Workspace({ token }: { token: string }) {
  const [status, setStatus] = useState<Status | null>(null),
    [missing, setMissing] = useState(false),
    [error, setError] = useState(""),
    [rooms, setRooms] = useState<Room[]>([]),
    [activeId, setActiveId] = useState<number | null>(null),
    [selectedId, setSelectedId] = useState<number | null>(null),
    [view, setView] = useState<View>("chat"),
    [team, setTeam] = useState<TeamPlan>(DEFAULT_TEAM),
    [selectedAgent, setSelectedAgent] = useState(""),
    [sidebar, setSidebar] = useState<boolean | null>(null),
    [settings, setSettings] = useState<
      "features" | "connection" | "integrations" | null
    >(null),
    [roomEdit, setRoomEdit] = useState<{
      action: "create" | "rename" | "delete";
      id?: number;
      name: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [archived, setArchived] = useState<Room[] | null>(null),
    [agentMenu, setAgentMenu] = useState(false);
  const desktop = useSyncExternalStore(
      subscribeDesktop,
      () => window.matchMedia("(min-width: 801px)").matches,
      () => true,
    ),
    sidebarOpen = sidebar ?? desktop;
  const base = `/api/agent/${token}`,
    remembered = useRef(false),
    enabled = modules(status?.modules);
  const refresh = useCallback(async () => {
    const r = await fetch(base + "/status", { cache: "no-store" });
    if (r.status === 404) {
      setMissing(true);
      return;
    }
    if (!r.ok) throw new Error("Cannot reach the project.");
    const d = (await r.json()) as Status;
    setStatus(d);
    if (!remembered.current) {
      remembered.current = true;
      rememberConnection({ token, name: d.name });
    }
  }, [base, token]);
  useEffect(() => {
    let live = true;
    const poll = () =>
      refresh().catch((e) => {
        if (live) setError(e.message);
      });
    void poll();
    const t = setInterval(poll, 4000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [refresh]);
  const loadRooms = useCallback(async () => {
    const d = await requestJson<{ rooms: Room[]; activeRoomId: number }>(
      base + "/rooms",
    );
    setRooms(d.rooms);
    setActiveId(d.activeRoomId);
    return d;
  }, [base]);
  useEffect(() => {
    if (!status?.features.room) return;
    let live = true;
    const poll = () =>
      loadRooms().catch((e) => {
        if (live) setError(e.message);
      });
    void poll();
    const t = setInterval(poll, 4000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [status?.features.room, loadRooms]);
  const selected =
      rooms.find((r) => r.id === selectedId) ??
      rooms.find((r) => r.id === activeId),
    roomId = selected?.id ?? null;
  const updateTeam = useCallback((next: TeamPlan) => setTeam(next), []);
  useEffect(() => {
    if (!roomId || !status?.features.room) return;
    let live = true;
    const poll = () =>
      requestJson<{ team: TeamPlan }>(base + `/room/team?room=${roomId}`)
        .then((d) => {
          if (live) setTeam(d.team);
        })
        .catch(() => {});
    void poll();
    const t = setInterval(poll, 5000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [base, roomId, status?.features.room]);
  const roomAction = async (action: string, id?: number, name?: string) => {
    setBusy(true);
    setError("");
    try {
      const d = await postJson<{ room?: Room; activeRoomId: number }>(
        base + "/rooms",
        { action, id, name },
      );
      await loadRooms();
      if (action === "create") setSelectedId(d.room?.id ?? d.activeRoomId);
      if (action === "delete") setSelectedId(d.activeRoomId);
      setRoomEdit(null);
      if (archived !== null) {
        const a = await requestJson<{ rooms: Room[] }>(
          base + "/rooms?archived=1",
        );
        setArchived(a.rooms);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Room change failed.");
    } finally {
      setBusy(false);
    }
  };
  const pause = async () => {
    setBusy(true);
    try {
      await postJson(
        base + "/control",
        status?.paused ? { paused: false } : { action: "stop" },
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update pause.");
    } finally {
      setBusy(false);
    }
  };
  const selectRoom = (room: Room) => {
    setSelectedId(room.id);
    setView("chat");
    setSelectedAgent("");
    if (window.innerWidth < 800) setSidebar(false);
  };
  if (missing)
    return (
      <main className="missing-project">
        <div className="empty-symbol">
          <Link2 size={28} />
        </div>
        <h1>This project link is no longer active.</h1>
        <p>Choose a saved project or create a new one to keep building.</p>
        <Link href="/" className="primary-link">
          Back to projects
          <ArrowRight size={16} />
        </Link>
      </main>
    );
  const navItem = NAV.find((n) => n.id === view),
    viewEnabled = !navItem || enabled[navItem.feature as ModuleId];
  return (
    <div
      className={`agent-shell ${enabled.workspaceAnimations ? "animated-workspace" : "no-workspace-motion"} ${enabled.chatColoredAvatars ? "" : "monochrome-avatars"} ${enabled.chatLargeText ? "large-chat-text" : ""}`}
    >
      <header className="workspace-topbar">
        <div className="flex min-w-0 items-center gap-2">
          <button
            className="icon-button"
            aria-label="Toggle sidebar"
            onClick={() => setSidebar(!sidebarOpen)}
          >
            <Menu size={19} />
          </button>
          <Link
            href="/"
            className="brand-mark"
            aria-label="Studio Link projects"
          >
            <span className="brand-glyph">
              s<span>l</span>
            </span>
          </Link>
          <span className="topbar-divider" />
          <div className="agent-switcher">
            <button
              className="agent-select-button"
              aria-expanded={agentMenu}
              onClick={() => setAgentMenu(!agentMenu)}
            >
              {selectedAgent ? (
                <AgentAvatar name={selectedAgent} size="sm" />
              ) : (
                <span className="agent-stack">
                  <span />
                  <span />
                  <span />
                </span>
              )}
              <span>{selectedAgent || "All agents"}</span>
              <ChevronDown size={14} />
            </button>
            {agentMenu && (
              <div className="agent-menu">
                <p className="eyebrow">FOCUS THE CONVERSATION</p>
                <button
                  onClick={() => {
                    setSelectedAgent("");
                    setAgentMenu(false);
                    setView("chat");
                  }}
                >
                  <Users size={17} />
                  All agents{!selectedAgent && <Check size={14} />}
                </button>
                {team.participants.map((p) => (
                  <button
                    key={p.agent}
                    onClick={() => {
                      setSelectedAgent(p.agent);
                      setAgentMenu(false);
                      setView("chat");
                    }}
                  >
                    <AgentAvatar name={p.agent} size="sm" />
                    <span>
                      <strong>{p.agent}</strong>
                      <small>{p.role}</small>
                    </span>
                    {selectedAgent === p.agent && <Check size={14} />}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setSelectedAgent("Owner");
                    setAgentMenu(false);
                    setView("chat");
                  }}
                >
                  <AgentAvatar name="Owner" size="sm" />
                  Your messages
                </button>
                {!team.participants.length && (
                  <p className="p-2 text-xs text-dim">
                    Agents appear here when they register in the room.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="topbar-project">
          <span
            className={`connection-dot ${status?.online ? "online" : ""}`}
          />
          <span>{status?.name ?? "Connecting…"}</span>
          <span className="text-dim">/</span>
          <span className="text-muted">
            {navItem?.name ?? selected?.name ?? "Agent workspace"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {(enabled.pauseControl || status?.paused) && (
            <button
              title={
                status?.paused
                  ? "Resume Studio commands"
                  : "Block commands, cancel queued edits and ask every agent to stop"
              }
              aria-label={
                status?.paused ? "Resume commands" : "Stop all agents"
              }
              className={`stop-agents-button ${status?.paused ? "resumable" : ""}`}
              disabled={busy}
              onClick={() => void pause()}
            >
              {status?.paused ? (
                <Play size={15} />
              ) : (
                <span className="stop-square" />
              )}
              <span>{status?.paused ? "Resume" : "Stop"}</span>
            </button>
          )}
          <button
            aria-label="Settings"
            className="settings-button"
            onClick={() => setSettings("features")}
          >
            <Settings2 size={17} />
            <span>Settings</span>
          </button>
        </div>
      </header>
      <div className="workspace-body">
        {sidebarOpen && (
          <>
            <button
              className="mobile-sidebar-backdrop"
              aria-label="Close sidebar"
              onClick={() => setSidebar(false)}
            />
            <aside className="workspace-sidebar">
              <div className="sidebar-project">
                <span className="project-icon">
                  <Sparkles size={17} />
                </span>
                <div className="min-w-0">
                  <strong>{status?.name ?? "Studio Link"}</strong>
                  <small>
                    {status?.online
                      ? (status.placeName ?? "Studio connected")
                      : "Studio offline"}
                  </small>
                </div>
                <button
                  className="icon-button ml-auto"
                  aria-label="Connection setup"
                  onClick={() => setSettings("connection")}
                >
                  <MoreHorizontal size={16} />
                </button>
              </div>
              <button
                className={`sidebar-link ${view === "chat" ? "active" : ""}`}
                onClick={() => { setView("chat"); if (window.innerWidth < 800) setSidebar(false); }}
              >
                <MessageSquare size={16} />
                <span>Agent chat</span>
                <span className="nav-count">{team.participants.length}</span>
              </button>
              <div className="sidebar-section">
                <div className="sidebar-section-heading">
                  <span>ROOMS</span>
                  {enabled.roomManagement && (
                    <button
                      aria-label="New room"
                      className="icon-button"
                      onClick={() =>
                        setRoomEdit({ action: "create", name: "" })
                      }
                    >
                      <Plus size={15} />
                    </button>
                  )}
                </div>
                {rooms.map((r) => (
                  <div
                    className={`room-nav-row ${r.id === roomId ? "selected" : ""}`}
                    key={r.id}
                  >
                    <button
                      className="room-nav-main"
                      onClick={() => selectRoom(r)}
                    >
                      <Hash size={14} />
                      <span>{r.name}</span>
                      {r.id === activeId && <span className="room-live-dot" />}
                    </button>
                    {enabled.roomManagement && (
                      <details className="room-options">
                        <summary aria-label={`Options for ${r.name}`}>
                          <MoreHorizontal size={14} />
                        </summary>
                        <div className="popover">
                          <button
                            onClick={() =>
                              setRoomEdit({
                                action: "rename",
                                id: r.id,
                                name: r.name,
                              })
                            }
                          >
                            Rename room
                          </button>
                          {r.id !== activeId && (
                            <button
                              onClick={() => void roomAction("activate", r.id)}
                            >
                              Use for AI work
                            </button>
                          )}
                          <button
                            disabled={rooms.length < 2}
                            onClick={() =>
                              setRoomEdit({
                                action: "delete",
                                id: r.id,
                                name: r.name,
                              })
                            }
                          >
                            Move to archive
                          </button>
                        </div>
                      </details>
                    )}
                  </div>
                ))}
                {status && !status.features.room && (
                  <button
                    className="sidebar-muted-action"
                    onClick={() => setSettings("features")}
                  >
                    Enable communication to use rooms
                  </button>
                )}
                {enabled.roomManagement && (
                  <button
                    className="sidebar-muted-action"
                    onClick={async () => {
                      try {
                        const d = await requestJson<{ rooms: Room[] }>(
                          base + "/rooms?archived=1",
                        );
                        setArchived(d.rooms);
                      } catch (e) {
                        setError(
                          e instanceof Error
                            ? e.message
                            : "Could not open archive.",
                        );
                      }
                    }}
                  >
                    <Archive size={13} />
                    Room archive
                  </button>
                )}
              </div>
              <div className="sidebar-section flex-1">
                <div className="sidebar-section-heading">
                  <span>WORKSPACE</span>
                  <Settings2 size={12} />
                </div>
                <nav>
                  {NAV.filter((n) => enabled[n.feature as ModuleId]).map(
                    (n) => (
                      <button
                        key={n.id}
                        className={`sidebar-link ${view === n.id ? "active" : ""}`}
                        onClick={() => {
                          setView(n.id);
                          if (window.innerWidth < 800) setSidebar(false);
                        }}
                      >
                        <n.icon size={16} />
                        <span>{n.name}</span>
                        {n.id === "reviews" && (
                          <span className="nav-indicator" />
                        )}
                      </button>
                    ),
                  )}
                </nav>
              </div>
              <div className="sidebar-footer">
                <span
                  className={`connection-dot ${status?.tunnelReady ? "online" : ""}`}
                />
                <span>
                  {status?.tunnelReady
                    ? "Public link connected"
                    : "Public tunnel offline"}
                </span>
                <button
                  aria-label="Open connection settings"
                  onClick={() => setSettings("connection")}
                >
                  <ArrowRight size={14} />
                </button>
              </div>
            </aside>
          </>
        )}
        <main className="workspace-canvas">
          {status?.paused && (
            <div className="paused-banner">
              <Pause size={14} />
              <span>
                Project stopped. You can still message your team. Already-running
                commands may finish.
              </span>
              <button onClick={() => void pause()}>Resume</button>
            </div>
          )}
          {error && (
            <div className="global-error">
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={14} />
              </button>
            </div>
          )}
          {!status ? (
            <div className="workspace-loading">
              <span className="loading-orbit" />
              Opening your workspace…
            </div>
          ) : !viewEnabled ? (
            <div className="collection-empty">
              <Settings2 size={32} />
              <h2>This feature is switched off.</h2>
              <p>Your saved data is still here.</p>
              <Button onClick={() => setSettings("features")}>
                Feature settings
              </Button>
            </div>
          ) : view === "chat" ? (
            status.features.room && selected ? (
              <AgentChat
                key={`${token}:${roomId}`}
                token={token}
                roomId={selected.id}
                roomName={selected.name}
                active={selected.id === activeId}
                selectedAgent={selectedAgent}
                enabled={enabled}
                onTeam={updateTeam}
                activate={() => void roomAction("activate", selected.id)}
              />
            ) : status.features.room ? (
              <div className="workspace-loading">
                <span className="loading-orbit" />
                Opening the conversation…
              </div>
            ) : (
              <div className="chat-disabled">
                <div className="empty-symbol">
                  <MessageSquare size={30} />
                </div>
                <p className="eyebrow">YOUR AGENT WORKSPACE</p>
                <h1>Give your team a place to think.</h1>
                <p>
                  Enable communication to chat with your connected AIs, agree
                  roles and keep the build moving.
                </p>
                <Button
                  variant="primary"
                  onClick={() => setSettings("features")}
                >
                  Open feature settings
                  <ArrowRight size={15} />
                </Button>
                <button
                  className="mt-4 text-sm text-muted"
                  onClick={() => setSettings("connection")}
                >
                  Connect Roblox Studio
                </button>
              </div>
            )
          ) : view === "references" ? (
            <div className="canvas-scroll">
              <GameReferences token={token} />
            </div>
          ) : view === "assets" ? (
            <div className="canvas-scroll">
              <AssetLibrary token={token} />
            </div>
          ) : view === "reviews" ? (
            <div className="canvas-scroll">
              <ReviewPanel token={token} />
            </div>
          ) : view === "activity" ? (
            <div className="canvas-scroll standard-tool">
              <div className="tool-heading">
                <div>
                  <p className="eyebrow">ACTIVITY</p>
                  <h1>The work, as it happens.</h1>
                  <p>Commands from your team and the local dashboard.</p>
                </div>
              </div>
              <ActivityPanel token={token} />
            </div>
          ) : view === "explorer" ? (
            <div className="canvas-scroll standard-tool">
              <ExplorerPanel token={token} online={status.online} />
            </div>
          ) : view === "console" ? (
            <div className="canvas-scroll standard-tool">
              <div className="tool-heading">
                <div>
                  <p className="eyebrow">CONSOLE</p>
                  <h1>A direct line to Studio.</h1>
                  <p>Manual actions use your local dashboard permissions.</p>
                </div>
              </div>
              <ConsolePanel token={token} online={status.online} />
            </div>
          ) : view === "insights" ? (
            <div className="canvas-scroll">
              <ProjectInsights token={token} />
            </div>
          ) : (
            <div className="canvas-scroll">
              <WorkspaceTools
                key={`${view}:${roomId}`}
                token={token}
                kind={view as EntryKind}
                roomId={roomId}
                team={team}
              />
            </div>
          )}
        </main>
      </div>
      {settings && (
        <WorkspaceDialog
          close={() => setSettings(null)}
          label="Workspace settings"
          wide
        >
          <div className="settings-heading">
            <p className="eyebrow">STUDIO LINK</p>
            <h2>Workspace settings</h2>
          </div>
          <div className="settings-tabs">
            <button
              className={settings === "features" ? "active" : ""}
              onClick={() => setSettings("features")}
            >
              Features
            </button>
            <button
              className={settings === "connection" ? "active" : ""}
              onClick={() => setSettings("connection")}
            >
              Connection & prompt
            </button>
            <button
              className={settings === "integrations" ? "active" : ""}
              onClick={() => setSettings("integrations")}
            >
              Connections & assets
            </button>
          </div>
          <div className="settings-content">
            {settings === "features" ? (
              <FeatureControls token={token} changed={() => void refresh()} />
            ) : settings === "connection" && status ? (
              <SetupPanel token={token} status={status} />
            ) : (
              <ExtensionsPanel token={token} changed={() => void refresh()} />
            )}
          </div>
        </WorkspaceDialog>
      )}
      {roomEdit && (
        <WorkspaceDialog close={() => setRoomEdit(null)} label="Manage room">
          <div className="p-7">
            <p className="eyebrow">PROJECT ROOM</p>
            <h2 className="mb-4 mt-2 text-2xl font-semibold">
              {roomEdit.action === "create"
                ? "A fresh place to start."
                : roomEdit.action === "rename"
                  ? "Give this room a name."
                  : "Archive this conversation?"}
            </h2>
            {roomEdit.action === "delete" ? (
              <p className="text-sm text-muted">
                “{roomEdit.name}” moves to the room archive. Its messages and
                roles are preserved and can be restored.
              </p>
            ) : (
              <label className="field-label">
                Room name
                <input
                  autoFocus
                  className="workspace-input"
                  maxLength={80}
                  value={roomEdit.name}
                  onChange={(e) =>
                    setRoomEdit({ ...roomEdit, name: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      void roomAction(
                        roomEdit.action,
                        roomEdit.id,
                        roomEdit.name,
                      );
                  }}
                  placeholder="e.g. Delivery system planning"
                />
              </label>
            )}
            {error && <Notice tone="bad">{error}</Notice>}
            <div className="mt-6 flex justify-end gap-2">
              <Button onClick={() => setRoomEdit(null)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={
                  busy ||
                  (!roomEdit.name.trim() && roomEdit.action !== "delete")
                }
                onClick={() =>
                  void roomAction(roomEdit.action, roomEdit.id, roomEdit.name)
                }
              >
                {busy
                  ? "Saving…"
                  : roomEdit.action === "create"
                    ? "Create room"
                    : roomEdit.action === "rename"
                      ? "Save name"
                      : "Archive room"}
              </Button>
            </div>
          </div>
        </WorkspaceDialog>
      )}
      {archived !== null && (
        <WorkspaceDialog close={() => setArchived(null)} label="Room archive">
          <div className="p-7">
            <p className="eyebrow">ROOM ARCHIVE</p>
            <h2 className="mb-5 mt-2 text-2xl font-semibold">
              Older rooms, kept safe.
            </h2>
            {!archived.length && (
              <p className="text-sm text-muted">No archived rooms.</p>
            )}
            {archived.map((r) => (
              <div
                className="flex items-center justify-between border-b border-line py-3"
                key={r.id}
              >
                <div>
                  <strong className="text-sm">{r.name}</strong>
                  <p className="text-xs text-dim">
                    {r.deletedAt
                      ? new Date(r.deletedAt).toLocaleDateString()
                      : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => void roomAction("restore", r.id)}
                >
                  Restore
                </Button>
              </div>
            ))}
            {error && <Notice tone="bad">{error}</Notice>}
          </div>
        </WorkspaceDialog>
      )}
    </div>
  );
}
function ProjectInsights({ token }: { token: string }) {
  const [data, setData] = useState<{
      commands: { total: number; errors: number; reviews: number };
      tasks: { total: number; done: number };
      messages: number;
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const poll = () =>
      requestJson<NonNullable<typeof data>>(
        `/api/agent/${token}/workspace?kind=overview`,
      )
        .then((d) => {
          if (live) setData(d);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    void poll();
    const t = setInterval(poll, 5000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [token]);
  return (
    <section className="tool-page">
      <div className="tool-heading">
        <div>
          <p className="eyebrow">PROJECT INSIGHTS</p>
          <h1>The shape of your progress.</h1>
          <p>
            Live activity across this project. Counts describe recorded actions,
            not gameplay quality.
          </p>
        </div>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="insight-grid">
        {[
          ["Commands", data?.commands.total],
          ["Failed commands", data?.commands.errors],
          ["Waiting for review", data?.commands.reviews],
          [
            "Tasks completed",
            data ? `${data.tasks.done} / ${data.tasks.total}` : undefined,
          ],
          ["Room messages", data?.messages],
        ].map(([label, value]) => (
          <div className="insight-card" key={label}>
            <span>{label}</span>
            <strong>{value ?? "—"}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
