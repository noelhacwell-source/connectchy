import { z } from "zod";

const order = z.array(z.string().max(80)).max(200);
const layouts = z.object({
  buttonEditing: z.boolean(),
  buttons: z.record(z.string().max(180), z.object({
    color:z.string().regex(/^#[0-9a-f]{6}$/i), size:z.number().int().min(10).max(26),
    radius:z.number().int().min(0).max(32), x:z.number().int().min(-150).max(150), y:z.number().int().min(-150).max(150)
  })),
  hidden: order,
  labels: z.record(z.string().max(80), z.string().max(50)),
  placements: z.record(z.string().max(80), z.string().max(80)),
  sections: order,
  navigation: order,
  rooms: order,
  toolbar: order,
  home: order,
  video: order,
  sidebarSide: z.enum(["left", "right"]),
  sidebarWidth: z.number().int().min(180).max(410),
  sidebarDefault: z.enum(["automatic", "open", "closed"]),
  agentPanelSide: z.enum(["left", "right"]),
  agentPanelWidth: z.number().int().min(230).max(460),
  agentPanelDefault: z.enum(["automatic", "open", "closed"]),
  toolbarSide: z.enum(["top", "bottom"]),
  composerSide: z.enum(["top", "bottom"]),
  density: z.enum(["compact", "comfortable", "spacious"]),
  homeColumns: z.enum(["columns", "stacked"]),
  homeFormSide: z.enum(["left", "right"]),
  contentWidth: z.number().int().min(680).max(1800),
  videoColumns: z.number().int().min(1).max(5),
  homeSort: z.enum(["recent", "name", "editor"]),
  motion: z.boolean(),
});

export type LayoutSettings = z.infer<typeof layouts>;
export const DEFAULT_LAYOUT: LayoutSettings = {
  buttonEditing:false, buttons:{},
  hidden: [],
  labels: {},
  placements: {},
  sections: [],
  navigation: [],
  rooms: [],
  toolbar: [],
  home: [],
  video: [],
  sidebarSide: "left",
  sidebarWidth: 272,
  sidebarDefault: "automatic",
  agentPanelSide: "right",
  agentPanelWidth: 320,
  agentPanelDefault: "automatic",
  toolbarSide: "top",
  composerSide: "bottom",
  density: "comfortable",
  homeColumns: "columns",
  homeFormSide: "right",
  contentWidth: 1160,
  videoColumns: 4,
  homeSort: "recent",
  motion: true,
};

export function parseLayout(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const parsed = layouts.safeParse({ ...DEFAULT_LAYOUT, ...value });
  return parsed.success ? parsed.data : null;
}

export function orderedItems<T extends { id: string }>(
  items: readonly T[],
  savedOrder: string[],
) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const result: T[] = [];
  for (const id of savedOrder) {
    const item = byId.get(id);
    if (item) result.push(item);
    byId.delete(id);
  }
  for (const item of byId.values()) result.push(item);
  return result;
}

export const SIDEBAR_SECTIONS = [
  { id: "project", label: "Project header" },
  { id: "team", label: "Team" },
  { id: "rooms", label: "Rooms" },
  { id: "planning", label: "Planning" },
  { id: "files", label: "Project files" },
  { id: "operations", label: "Operations" },
  { id: "connection", label: "Connection status" },
];
export const NAV_SECTIONS = SIDEBAR_SECTIONS.filter(
  (section) => !["project", "rooms", "connection"].includes(section.id),
);
export const WORKSPACE_TOOLBAR = [
  { id: "workspace-controls", label: "Home, sidebar and agent switcher" },
  { id: "workspace-path", label: "Workspace and view title" },
  { id: "workspace-actions", label: "Search, Stop and Settings" },
];
export const HOME_SECTIONS = [
  { id: "home-heading", label: "Workspace heading" },
  { id: "home-saved", label: "Saved workspaces" },
  { id: "home-create", label: "Create workspace" },
  { id: "home-open", label: "Open by link" },
];
export const VIDEO_SECTIONS = [
  { id: "video-heading", label: "Videos heading and actions" },
  { id: "video-upload", label: "Upload panel" },
  { id: "video-library", label: "Clip library" },
];
