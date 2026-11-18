import type { ModuleSettings } from "@/lib/modules";
/** Browser-side helpers shared by the dashboard panels. */

export type Status = {
  mode?: "roblox" | "vscode";
  modules: ModuleSettings;
  paused: boolean;
  name: string;
  videoUploadLimitMb: number | null;
  online: boolean;
  placeName: string | null;
  placeId: string | null;
  pluginVersion: string | null;
  origin: string | null;
  tunnelReady: boolean;
  features: { room: boolean; uploads: boolean; mcps: boolean; skills: boolean };
  lastSeenAt: string | null;
};

export type CmdResult<T = unknown> = {
  id?: number;
  ok: boolean;
  status?: string;
  result: T | null;
  error: string | null;
  ms?: number | null;
};

export type TreeNode = {
  name: string;
  className: string;
  path: string;
  childCount: number;
  children?: TreeNode[];
  truncated?: boolean;
};

export type TypedValue = { __type: string; [key: string]: unknown };

export type InstanceInfo = {
  path: string;
  name: string;
  className: string;
  properties: Record<string, unknown> | unknown[];
  attributes: Record<string, unknown> | unknown[];
  tags: string[];
  children: { name: string; className: string }[];
  childCount: number;
  source?: string;
};

/** Run one command inside Studio and wait for its result. Never throws. */
export async function studio<T = unknown>(token: string, type: string, payload: object = {}): Promise<CmdResult<T>> {
  try {
    const res = await fetch(`/api/agent/${token}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload, source: "dashboard" }),
    });
    const data = (await res.json()) as Partial<CmdResult<T>>;
    return { result: null, error: null, ...data, ok: data.ok === true };
  } catch {
    return { ok: false, result: null, error: "Could not reach the dashboard server. Check your internet connection." };
  }
}

export type Saved = { token: string; name: string };
const KEY = "studio-link:connections";

/** Raw saved list. A string so it can be a stable useSyncExternalStore snapshot. */
export function readSavedRaw(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

export function parseSaved(raw: string): Saved[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is Saved => !!item && typeof item.token === "string" && typeof item.name === "string",
    );
  } catch {
    return [];
  }
}

export const loadSaved = (): Saved[] => parseSaved(readSavedRaw());

/** For browser-only values that never change while the page is open. */
export const subscribeNever = () => () => {};

export function subscribeSaved(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("connectchy:workspaces", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("connectchy:workspaces", callback);
  };
}

export function rememberConnection(entry: Saved) {
  try {
    const rest = loadSaved().filter((item) => item.token !== entry.token);
    window.localStorage.setItem(KEY, JSON.stringify([entry, ...rest].slice(0, 30)));
    window.dispatchEvent(new Event("connectchy:workspaces"));
  } catch {
    // Private mode: the connection still works through its URL.
  }
}

export function forgetConnection(token: string) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(loadSaved().filter((item) => item.token !== token)));
    window.dispatchEvent(new Event("connectchy:workspaces"));
  } catch {
    // Nothing to forget.
  }
}

/** Pull a token out of a pasted link, dashboard URL or bare token. */
export const extractToken = (text: string) => text.match(/sl_[A-Za-z0-9_-]{20,}/)?.[0] ?? null;

/** Compact display for a serialized Roblox value. */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return String(value);
  const typed = value as TypedValue;
  if (typed.__type === "Instance") return String(typed.path);
  if (typed.__type === "CFrame") {
    return `pos ${(typed.position as number[]).join(", ")}  rot ${(typed.rotation as number[]).join(", ")}`;
  }
  if (Array.isArray(typed.value)) return (typed.value as unknown[]).join(", ");
  if (typed.__type && typed.value !== undefined) return String(typed.value);
  return JSON.stringify(value);
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
