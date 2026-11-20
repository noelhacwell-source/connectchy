"use client";
import AppUpdates from "./AppUpdates";
import DownloadCounter from "./DownloadCounter";
import LiveCounter from "./LiveCounter";
import ButtonDesigner from "./ButtonDesigner";
import { Fragment } from "react";
import RecordManager from "./RecordManager";
import VsCodeFiles from "./VsCodeFiles";
import CustomizeLayout from "./CustomizeLayout";
import VideoSettings from "./VideoSettings";
import { useLayoutSettings } from "./useLayoutSettings";
import { SIDEBAR_SECTIONS, WORKSPACE_TOOLBAR, NAV_SECTIONS, orderedItems } from "@/lib/layout-settings";
import VideoLibrary from "./VideoLibrary";
import DeleteWorkspaceDialog from "./DeleteWorkspaceDialog";
import { COLLECTIONS_BY_TAB, RECORD_COLLECTIONS } from "@/lib/record-collections";
import Collaboration from "./Collaboration";
import ConnectchyLogo from "./ConnectchyLogo";
import AgentDirectory from "./AgentDirectory";
import {AppearancePanel,useAppearance} from "./Appearance";
import GameReferences from "./GameReferences";
import WorkspaceDialog from "./WorkspaceDialog";
import CommandPalette, { type PaletteAction } from "./CommandPalette";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  LayoutDashboard, Box,
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
  FileText, Film, ListChecks, SlidersHorizontal,
  PanelLeft,
} from "lucide-react";
import { parseSaved,readSavedRaw,subscribeSaved,rememberConnection, type Status } from "@/lib/client";
import { modules, type ModuleId } from "@/lib/modules";
import { DEFAULT_TEAM, type TeamPlan } from "@/lib/team-types";
import { requestJson, postJson, type EntryKind } from "@/lib/workspace-client";
import AgentChat from "./AgentChat";
import { AgentAvatar } from "./AgentAvatar";
import FeatureControls from "./FeatureControls";
import WorkspaceTools, { AssetLibrary, ReviewPanel } from "./WorkspaceTools";
import SetupPanel from "./SetupPanel";
import CodeWorkspace, { CodeSetup } from "./CodeWorkspace";
import MissionControl from "./MissionControl";
import {useBoardCards} from "./useBoardCards";
import FeatureCatalog from "./FeatureCatalog";
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
  | "videos"
  | "activity"
  | "explorer"
  | "console"
  | "mission"
  | "collaboration"
  | "catalog"
  | "insights";
const NAV_GROUPS = [
  { id: "planning", ids: ["mission", "task", "note", "decision", "handoff", "bookmark"] },
  { id: "files", ids: ["explorer", "assets", "references", "checkpoint", "check"] },
  { id: "operations", ids: ["console", "reviews", "activity", "insights", "catalog"] },
];
const NAV = [
  {id:"mission",name:"Mission Control",icon:LayoutDashboard,feature:"missionControl"},
  {id:"catalog",name:"Feature catalog",icon:Sparkles,feature:"missionControl"},
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
      "features" | "connection" | "integrations" | "appearance" | "agents" | "layout" | "video-settings" | null
    >(null),
    [roomEdit, setRoomEdit] = useState<{
      action: "create" | "rename" | "delete" | "purge";
      id?: number;
      name: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [manageRecords, setManageRecords] = useState(false),
    [recordRevision, setRecordRevision] = useState(0),
    [deleteProject, setDeleteProject] = useState(false),
    [archived, setArchived] = useState<Room[] | null>(null),
    [agentMenu, setAgentMenu] = useState(false),
    [paletteOpen, setPaletteOpen] = useState(false);
  const prefs=useAppearance(token);
  const customization = useLayoutSettings(token);
  const { layout } = customization;
  const showBlock = (id: string) => !layout.hidden.includes(id);
  const label = (id: string, fallback: string) => layout.labels[id]?.trim() || fallback;
  const router = useRouter();
  const savedProjects=parseSaved(useSyncExternalStore(subscribeSaved,readSavedRaw,()=>"[]"));
  const desktop = useSyncExternalStore(
      subscribeDesktop,
      () => window.matchMedia("(min-width: 801px)").matches,
      () => true,
    ),
    sidebarOpen = sidebar ?? (layout.sidebarDefault === "automatic" ? desktop : layout.sidebarDefault === "open");
  const base = `/api/agent/${token}`,
    remembered = useRef(false),
    enabled = modules(status?.modules);
  const editorMode = status?.mode === "vscode";
  const videosEnabled = !!status?.features.room && enabled.chatAttachments;
  const kinds = (COLLECTIONS_BY_TAB[view] ?? []).filter(kind => {
    const feature = RECORD_COLLECTIONS[kind].feature;
    return (!feature || enabled[feature]) && (RECORD_COLLECTIONS[kind].scope !== "room" || !!status?.features.room);
  });
  const visibleNav = NAV.filter(n=>enabled[n.feature as ModuleId]&&(!editorMode||!["references","assets","checkpoint","check"].includes(n.id)));
  const navItems = orderedItems([
    { id: "chat", name: "Agent chat", icon: MessageSquare, group: "team" },
    ...(status?.features.room ? [{ id: "collaboration", name: "Collaboration", icon: Users, group: "team" }] : []),
    ...(videosEnabled ? [{ id: "videos", name: "Videos & images", icon: Film, group: "team" }] : []),
    ...visibleNav.map(item => ({ ...item, group: NAV_GROUPS.find(group => group.ids.includes(item.id))?.id ?? "operations" })),
  ] as { id: View; name: string; icon: typeof MessageSquare; group: string }[], layout.navigation);
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
    if (missing) return;
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
  }, [refresh, missing]);
  const loadRooms = useCallback(async () => {
    const d = await requestJson<{ rooms: Room[]; activeRoomId: number }>(
      base + "/rooms",
    );
    setRooms(d.rooms);
    setActiveId(d.activeRoomId);
    return d;
  }, [base]);
  useEffect(() => {
    if (missing || !status?.features.room) return;
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
  }, [status?.features.room, loadRooms, missing]);
  const selected =
      rooms.find((r) => r.id === selectedId) ??
      rooms.find((r) => r.id === activeId),
    roomId = selected?.id ?? null;
  const updateTeam = useCallback((next: TeamPlan) => setTeam(next), []);
  useEffect(() => {
    if (missing || !roomId || !status?.features.room) return;
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
  }, [base, roomId, status?.features.room, missing]);
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
      if (action === "delete" || action === "purge") setSelectedId(d.activeRoomId);
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
  const queueControl = async (stop:boolean) => {
    setBusy(true);
    try {
      await postJson(
        base + "/control",
        stop ? { action:"stop" } : { paused:!status?.paused },
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update pause.");
    } finally {
      setBusy(false);
    }
  };
  const pause = () => queueControl(!status?.paused);
  const selectRoom = (room: Room) => {
    setSelectedId(room.id);
    setView("chat");
    setSelectedAgent("");
    if (window.innerWidth < 800) setSidebar(false);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const paletteActions: PaletteAction[] = [
    {id:"customize",label:"Customize workspace",hint:"Settings",icon:SlidersHorizontal,run:()=>setSettings("layout")},
    {id:"appearance",label:"Customize background",hint:"Settings",icon:Settings2,run:()=>setSettings("appearance")},
    {id:"directory",label:"Import an agent",hint:"Settings",icon:Users,run:()=>setSettings("agents")},
    ...(status?.features.room?[{id:"collaborate",label:"Surveys, questions and private chats",hint:"Collaboration",icon:MessageSquare,run:()=>setView("collaboration")}]:[]),
    ...(videosEnabled ? [{ id: "videos", label: "Videos & images", hint: "Workspace", icon: Film, run: () => setView("videos") }] : []),
    ...visibleNav.map((n) => ({
      id: `view:${n.id}`,
      label: n.name,
      hint: "View",
      icon: n.icon,
      run: () => {
        setView(n.id);
        if (window.innerWidth < 800) setSidebar(false);
      },
    })),
    ...rooms
      .filter((r) => !r.deletedAt)
      .map((r) => ({
        id: `room:${r.id}`,
        label: `#${r.name}`,
        hint: r.id === activeId ? "Room · active" : "Room",
        icon: Hash,
        run: () => selectRoom(r),
      })),
    ...team.participants.filter(p => p.control !== "removed").map((p) => ({
      id: `agent:${p.agent}`,
      label: `Focus ${p.agent}`,
      hint: p.role,
      icon: Users,
      run: () => {
        setSelectedAgent(p.agent);
        setView("chat");
      },
    })),
    {
      id: "action:all-agents",
      label: "Show all agents",
      hint: "Chat",
      icon: Users,
      run: () => {
        setSelectedAgent("");
        setView("chat");
      },
    },
    {
      id: "action:sidebar",
      label: sidebarOpen ? "Hide sidebar" : "Show sidebar",
      hint: "Layout",
      icon: PanelLeft,
      run: () => setSidebar(!sidebarOpen),
    },
    {
      id: "action:settings",
      label: "Workspace settings",
      hint: "Features & connection",
      icon: Settings2,
      run: () => setSettings("features"),
    },
    ...((enabled.pauseControl || status?.paused)
      ? [
          {
            id: "action:pause",
            label: status?.paused ? "Resume project" : "Stop all agents",
            hint: "Control",
            icon: status?.paused ? Play : Pause,
            run: () => void pause(),
          },
        ]
      : []),
    ...((enabled.roomManagement)
      ? [
          {
            id: "action:new-room",
            label: "Create a room",
            hint: "Chat",
            icon: Plus,
            run: () => setRoomEdit({ action: "create", name: "" }),
          },
        ]
      : []),
    {
      id: "action:projects",
      label: "Back to projects",
      hint: "Home",
      icon: ArrowLeft,
      run: () => {
        router.push("/");
      },
    },
  ];
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
  const toolbarBlocks: Record<string, ReactNode> = {
    "workspace-controls": (<div className="flex min-w-0 items-center gap-2">
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
            aria-label="Connectchy projects"
          >
            <ConnectchyLogo className="design-logo"/>
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
                <Users size={16} aria-hidden="true"/>
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
                {team.participants.filter(p => p.control !== "removed").map((p) => (
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
                {!team.participants.some(p => p.control !== "removed") && (
                  <p className="p-2 text-xs text-dim">
                    Agents appear here when they register in the room.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>),
    "workspace-path": (<div className="topbar-project">
          <span
            className={`connection-dot ${status?.online ? "online" : ""}`}
          />
          <span>{label("workspace-path", status?.name ?? "Connecting…")}</span>
          <span className="text-dim">/</span>
          <span className="text-muted">
            {view === "chat" ? (selected ? label("room:" + selected.id, selected.name) : "Agent chat") : label(view, navItems.find(item => item.id === view)?.name ?? "Agent workspace")}
          </span>
        </div>),
    "workspace-actions": (<div className="flex items-center gap-2">{status && view==="chat" && kinds.length>0 && <button className="icon-button" aria-label="Manage records" title="Manage records" onClick={()=>setManageRecords(true)}><ListChecks size={16}/></button>}
          <button
            aria-label="Command palette"
            title="Command palette (⌘K)"
            className="icon-button topbar-search"
            onClick={() => setPaletteOpen(true)}
          >
            <Search size={17} />
          </button>
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
        </div>),
  };
  const [moreTools,setMoreTools]=useState(false);
  const roomShell=sidebarOpen && desktop && layout.toolbarSide==="top";
  const sidebarBlocks: Record<string, ReactNode> = {
    project: (<details className="room-project-picker"><summary className="sidebar-project">
                <span className="project-icon">
                  {editorMode?<Code2 size={18}/>:<Box size={18}/>}
                </span>
                <div className="min-w-0">
                  <strong>{label("project", status?.name ?? "Connectchy")}</strong>
                  <small>
                    {status?.online
                      ? (status.placeName ?? (editorMode?"VS Code connected":"Studio connected"))
                      : editorMode ? "VS Code offline" : "Studio offline"}
                  </small>
                </div>
                <ChevronDown size={14}/>
              </summary><div className="room-project-options">{savedProjects.map(p=><Link href={"/c/"+p.token} key={p.token} aria-current={p.token===token?"page":undefined}>{p.name}{p.token===token && <Check size={13}/>}</Link>)}<Link href="/"><Plus size={14}/>Open or create workspace</Link><button onClick={()=>setSettings("connection")}><Settings2 size={14}/>Workspace settings</button></div></details>),
    rooms: (<div className="sidebar-section">
                <div className="sidebar-section-heading">
                  <span>{label("rooms", "Rooms")}</span>
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
                {orderedItems(rooms.map(room => ({...room, id: "room:" + room.id, roomId: room.id})), layout.rooms).filter(item => showBlock(item.id)).map(item => ({...item, id: item.roomId})).map((r) => (
                  <div
                    className={`room-nav-row ${r.id === roomId ? "selected" : ""}`}
                    key={r.id}
                  >
                    <button
                      className="room-nav-main"
                      onClick={() => selectRoom(r)}
                    >
                      <Hash size={14} />
                      <span>{label("room:" + r.id, r.name)}</span>
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
                          <button className="text-bad" onClick={()=>setRoomEdit({action:"purge",id:r.id,name:r.name})}>Delete permanently</button>
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
              </div>),
    connection: (<div className="sidebar-footer">
                <span
                  className={`connection-dot ${status?.tunnelReady ? "online" : ""}`}
                />
                <span>
                  {label("connection", status?.tunnelReady ? "Public link connected" : "Public tunnel offline")}
                </span>
                <button
                  aria-label="Open connection settings"
                  onClick={() => setSettings("connection")}
                >
                  <ArrowRight size={14} />
                </button>
              </div>),
  };
  return (
    <div
      {...prefs.attributes} style={{...prefs.style, ...customization.style}}
      data-room-shell={roomShell} data-sidebar-side={layout.sidebarSide} data-toolbar-side={layout.toolbarSide}
      data-agent-panel-side={layout.agentPanelSide} data-composer-side={layout.composerSide} data-density={layout.density} data-motion={layout.motion}
      className={`agent-shell ${enabled.workspaceAnimations ? "animated-workspace" : "no-workspace-motion"} ${enabled.chatColoredAvatars ? "" : "monochrome-avatars"} ${enabled.chatLargeText ? "large-chat-text" : ""}`}
    >
      <ButtonDesigner layout={layout} update={customization.update}/>
      {(!roomShell || moreTools) && <header className="workspace-topbar">
        <LiveCounter/>
        {!roomShell && <DownloadCounter token={token}/>}
        {!roomShell && <AppUpdates/>}
        {roomShell && <DownloadCounter token={token}/>}
        {orderedItems(WORKSPACE_TOOLBAR, layout.toolbar).filter(item => showBlock(item.id)).map(item => (
          <div className={"custom-toolbar-block " + item.id} key={item.id} aria-label={label(item.id, item.label)}>
            {toolbarBlocks[item.id]}
          </div>
        ))}
        <button aria-label="Customize workspace" className="settings-button customize-launch" onClick={() => setSettings("layout")}>
          <SlidersHorizontal size={17}/><span>Customize</span>
        </button>
      </header>}
      <div className="workspace-body">
        {sidebarOpen && (
          <>
            <button
              className="mobile-sidebar-backdrop"
              aria-label="Close sidebar"
              onClick={() => setSidebar(false)}
            />
            <aside className="workspace-sidebar">
              {roomShell && <><div className="reference-brand"><Link href="/"><ConnectchyLogo className="design-logo"/>Connectchy</Link><button className="icon-button" aria-label="Collapse sidebar" onClick={()=>setSidebar(false)}><PanelLeftClose size={15}/></button></div>
                <div className="reference-release"><LiveCounter/><DownloadCounter token={token}/><AppUpdates/></div>
                {showBlock("project") && sidebarBlocks.project}
                <nav className="reference-nav" aria-label="Workspace"><p>Workspace</p>{(["chat","task","note","mission","videos"] as const).map(id=>{const item=navItems.find(n=>n.id===id);return item && showBlock(id) && <button key={id} aria-current={id===view?"page":undefined} onClick={()=>setView(id)}><item.icon size={16}/>{label(id,({chat:"Chat",task:"Tasks",note:"Notes",mission:"Mission Control",videos:"Videos & images"})[id])}</button>})}</nav>
                {showBlock("rooms") && sidebarBlocks.rooms}
                <button className="reference-more" aria-expanded={moreTools} onClick={()=>setMoreTools(!moreTools)}><MoreHorizontal size={15}/>Workspace tools</button></>}
              <div className={roomShell ? "workspace-tools-drawer" : undefined} data-open={moreTools} inert={roomShell && !moreTools}><div className="workspace-tools-inner">
              {orderedItems(SIDEBAR_SECTIONS, layout.sections).filter(section => showBlock(section.id)).map(section => {
                if(roomShell && ["project","rooms"].includes(section.id))return null;
                if (sidebarBlocks[section.id]) return <Fragment key={section.id}>{sidebarBlocks[section.id]}</Fragment>;
                const links = navItems.filter(item => showBlock(item.id) &&
                  (NAV_SECTIONS.some(group => group.id === layout.placements[item.id]) ? layout.placements[item.id] : item.group) === section.id);
                if (!links.length) return null;
                return <div className="sidebar-section navigation-group" key={section.id}>
                  <div className="sidebar-section-heading">{label(section.id, section.label)}</div>
                  <nav aria-label={label(section.id, section.label)}>
                    {links.map(item => <button key={item.id} className={"sidebar-link " + (view === item.id ? "active" : "")}
                      aria-current={view === item.id ? "page" : undefined}
                      onClick={() => { setView(item.id); if (!desktop) setSidebar(false); }}>
                      <item.icon size={16}/><span>{label(item.id, item.name)}</span>
                      {item.id === "chat" && <span className="nav-count">{team.participants.filter(p => p.control !== "removed").length}</span>}
                    </button>)}
                  </nav>
                </div>;
              })}
              </div></div>
              {roomShell && <div className="reference-settings"><button onClick={()=>setSettings("features")}><Settings2 size={15}/>Settings</button><button title="Customize workspace" aria-label="Customize workspace layout" onClick={()=>setSettings("layout")}><SlidersHorizontal size={15}/></button></div>}
            </aside>
          </>
        )}
        <main key={view} className="workspace-canvas">
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
          {status && kinds.length > 0 && view !== "videos" && view !== "chat" && <div className="workspace-record-bar">
            <span>{navItem?.name ?? (view === "collaboration" ? "Collaboration" : "Conversation records")}</span>
            <button onClick={() => setManageRecords(true)}><ListChecks size={15}/>Manage records</button>
          </div>}
          <Fragment key={recordRevision}>
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
                configureAgents={()=>setSettings("agents")}
                panelDefault={layout.agentPanelDefault}
                limitMb={status.videoUploadLimitMb}
                openVideos={() => setView("videos")}
                selectedAgent={selectedAgent}
                enabled={enabled}
                onTeam={updateTeam}
                activate={() => void roomAction("activate", selected.id)}
                studio={{
                  mode: status.mode,
                  online: status.online,
                  placeName: status.placeName,
                  paused: !!status.paused,
                }}
                queueControl={queueControl}
                focusAgent={(name) => {
                  setSelectedAgent(name);
                  setView("chat");
                }}
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
                  Connect {editorMode ? "VS Code" : "Roblox Studio"}
                </button>
              </div>
            )
          ) : view === "collaboration" && !(status.features.room && selected) ? (<div className="workspace-loading">Select an enabled communication room.</div>) : view === "collaboration" && selected ? (
            <div className="canvas-scroll"><Collaboration key={selected.id} token={token} roomId={selected.id} roomName={selected.name} configure={()=>setSettings("agents")}/></div>
          ) : view === "videos" ? (
            <div className="canvas-scroll">
              {videosEnabled ? <VideoLibrary token={token} activeRoom={activeId} activeName={rooms.find(r => r.id === activeId)?.name} manage={() => setManageRecords(true)} limitMb={status.videoUploadLimitMb} customizeUploads={() => setSettings("video-settings")} layout={layout}/>
                : <div className="collection-empty"><Film size={28}/><h2>Videos are disabled</h2><Button onClick={() => setSettings("features")}>Open features</Button></div>}
            </div>
          ) : view === "catalog" ? (
            <div className="canvas-scroll standard-tool"><FeatureCatalog token={token} mode={status.mode}/></div>
          ) : view === "mission" ? (
            <div className="canvas-scroll standard-tool"><MissionControl key={`${token}:${roomId}`} token={token} roomId={roomId}/></div>
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
              {editorMode?<VsCodeFiles token={token} online={status.online}/>:<ExplorerPanel token={token} online={status.online} />}
            </div>
          ) : view === "console" ? (
            <div className="canvas-scroll standard-tool">
              <div className="tool-heading">
                <div>
                  <p className="eyebrow">CONSOLE</p>
                  <h1>A direct line to {editorMode?"VS Code":"Studio"}.</h1>
                  <p>Manual actions use your local dashboard permissions.</p>
                </div>
              </div>
              {editorMode?<CodeWorkspace token={token} online={status.online}/>:<ConsolePanel token={token} online={status.online} />}
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
          </Fragment>
        </main>
      </div>
      {manageRecords && kinds.length > 0 && <RecordManager key={view + ":" + roomId} token={token} room={roomId} kinds={kinds} close={() => setManageRecords(false)} changed={() => { setRecordRevision(value => value + 1); void loadRooms().catch(e => setError(e.message)); }}/>}
      {deleteProject && status && <DeleteWorkspaceDialog workspace={{ token, name: status.name }} close={() => setDeleteProject(false)} done={() => router.replace("/")}/>}
      {settings && (
        <WorkspaceDialog
          close={() => setSettings(null)}
          label="Workspace settings"
          wide
        >
          <div className="settings-heading">
            <p className="eyebrow">CONNECTCHY</p>
            <h2>Workspace settings</h2>
          </div>
          <div className="settings-tabs">
            <button className={settings==="layout"?"active":""} onClick={()=>setSettings("layout")}>Layout</button>
            <button className={settings==="video-settings"?"active":""} onClick={()=>setSettings("video-settings")}>Uploads</button>
            <button className={settings==="appearance"?"active":""} onClick={()=>setSettings("appearance")}>Appearance</button>
            <button className={settings==="agents"?"active":""} onClick={()=>setSettings("agents")}>Agents</button>
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
            {settings==="layout"?<CustomizeLayout {...customization}
              navigation={navItems.map(item => ({id:item.id,label:item.name,group:item.group}))}
              rooms={rooms.map(room => ({id:"room:"+room.id,label:room.name}))}/>
            :settings==="video-settings"&&status?<VideoSettings token={token} limitMb={status.videoUploadLimitMb}
              saved={limit => setStatus(current => current ? {...current,videoUploadLimitMb:limit} : current)}/>
            :settings==="appearance"?<AppearancePanel prefs={prefs}/>:settings==="agents"?<AgentDirectory token={token}/>:settings === "features" ? (
              <FeatureControls token={token} changed={() => void refresh()} />
            ) : settings === "connection" && status ? (
              editorMode?<CodeSetup token={token} status={status}/>:<SetupPanel token={token} status={status} />
            ) : (
              <ExtensionsPanel token={token} changed={() => void refresh()} />
            )}
          </div>
          <div className="settings-workspace-footer"><Button variant="danger" size="sm" onClick={() => { setSettings(null); setDeleteProject(true); }}><Trash2 size={14}/>Delete workspace</Button></div>
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
                  : roomEdit.action==="purge" ? "Permanently delete this room?" : "Archive this conversation?"}
            </h2>
            {roomEdit.action==="purge"?<p className="text-sm text-muted">Deleting “{roomEdit.name}” removes its messages, private chats, surveys, files and room records. This cannot be undone.{rooms.length===1&&rooms[0].id===roomEdit.id?" A fresh Main room will replace it.":""}</p>:roomEdit.action === "delete" ? (
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
                      : roomEdit.action==="purge" ? "Delete permanently" : "Archive room"}
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
                </Button><Button variant="danger" size="sm" onClick={()=>{setArchived(null);setRoomEdit({action:"purge",id:r.id,name:r.name});}}>Delete</Button>
              </div>
            ))}
            {error && <Notice tone="bad">{error}</Notice>}
          </div>
        </WorkspaceDialog>
      )}
      <CommandPalette
        key={paletteOpen ? "palette-open" : "palette-closed"}
        open={paletteOpen}
        close={() => setPaletteOpen(false)}
        actions={paletteActions}
      />
    </div>
  );
}
function ProjectInsights({ token }: { token: string }) {
  const cards=useBoardCards(token,"insights");
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
      <label className="studio-check"><input type="checkbox" checked={cards.removed} onChange={e=>cards.setRemoved(e.target.checked)}/>Show removed metrics</label><Button className="mb-3" size="sm" onClick={() => void cards.toggle(null)}>{cards.removed ? "Restore all metrics" : "Remove all metrics"}</Button>{cards.error&&<Notice tone="bad">{cards.error}</Notice>}
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
        ].filter(([label])=>cards.shown(String(label))).map(([label, value]) => (
          <div className="insight-card" key={label}>
            <span>{label}</span>
            <strong>{value ?? "—"}</strong><button className="studio-inline" onClick={()=>void cards.toggle(String(label))}>{cards.removed?"Restore metric":"Remove metric"}</button>
          </div>
        ))}
      </div>
    </section>
  );
}
