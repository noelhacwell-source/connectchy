export type EntryKind =
  | "task"
  | "note"
  | "decision"
  | "bookmark"
  | "handoff"
  | "checkpoint"
  | "check";
export type WorkspaceEntry = {
  id: number;
  roomId: number;
  kind: EntryKind;
  title: string;
  body: string;
  owner: string;
  status: string;
  priority: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  data: {
    dependencies?: number[];
    url?: string;
    tags?: string[];
    due?: string;
    scripts?: { path: string; source: string }[];
    passed?: boolean;
    [key: string]: unknown;
  };
};
export async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const r = await fetch(url, { ...init, cache: "no-store" });
  let data;
  try {
    data = await r.json();
  } catch {
    throw new Error(`Request failed (${r.status}).`);
  }
  if (!r.ok) throw new Error(data.error ?? `Request failed (${r.status}).`);
  return data as T;
}
export function postJson<T>(url: string, body: object) {
  return requestJson<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
export function downloadText(
  filename: string,
  text: string,
  type = "text/plain",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
