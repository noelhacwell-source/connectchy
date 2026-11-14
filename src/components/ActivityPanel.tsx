"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/client";
import { JsonView, Notice } from "./ui";

type Row = {
  id: number;
  type: string;
  status: string;
  error: string | null;
  source: string;
  agent: string | null;
  createdAt: string;
  ms: number | null;
  payloadPreview: string | null;
};
type Detail = { id: number; payload: unknown; result: unknown; error: string | null };

const STATE: Record<string, { label: string; className: string }> = {
  done: { label: "Done", className: "text-ok" },
  error: { label: "Failed", className: "text-bad" },
  sent: { label: "Running", className: "text-signal" },
  pending: { label: "Queued", className: "text-signal" },
};

export default function ActivityPanel({ token }: { token: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/agent/${token}/commands?limit=100`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { commands: Row[] };
        if (!stopped) {
          setRows(data.commands);
          setFailed(false);
        }
      } catch {
        if (!stopped) setFailed(true);
      }
    };
    load();
    const timer = setInterval(load, 2500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [token]);

  const toggle = async (id: number) => {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    try {
      const res = await fetch(`/api/agent/${token}/commands?id=${id}`, { cache: "no-store" });
      if (res.ok) setDetail((await res.json()) as Detail);
    } catch {
      // The row stays open with its preview only.
    }
  };

  if (rows === null) {
    return failed ? (
      <Notice tone="bad">The activity log could not be loaded. Retrying...</Notice>
    ) : (
      <p className="text-sm text-muted">Loading activity...</p>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-panel px-6 py-12 text-center">
        <p className="text-base font-medium">Nothing has been built yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Every command your AI or this dashboard sends to Studio shows up here live, with exactly what was sent and
          what Studio answered.
        </p>
      </div>
    );
  }

  return (
    <div>
      {failed && (
        <div className="mb-3">
          <Notice tone="bad">Live updates are failing. Showing the last loaded log.</Notice>
        </div>
      )}
      <p className="mb-3 text-sm text-muted">Latest {rows.length} commands, newest first. Updates live.</p>
      <ul className="overflow-hidden rounded-lg border border-line bg-panel">
        {rows.map((row) => {
          const state = STATE[row.status] ?? STATE.pending;
          const open = openId === row.id;
          return (
            <li key={row.id} className="border-b border-line last:border-b-0">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggle(row.id)}
                className="grid w-full grid-cols-[4.5rem_1fr_auto] items-baseline gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal"
              >
                <span className={`font-mono text-xs font-semibold ${state.className}`}>{state.label}</span>
                <span className="min-w-0">
                  <span className="font-mono text-sm text-text">{row.type}</span>
                  <span className="ml-2 rounded border border-line px-1.5 py-0.5 text-[11px] text-muted">
                    {row.source === "dashboard" ? "you" : row.agent ?? "AI"}
                  </span>
                  <span className="mt-1 block truncate font-mono text-xs text-dim">
                    {row.error ?? row.payloadPreview ?? ""}
                  </span>
                </span>
                <span className="text-right text-xs whitespace-nowrap text-muted">
                  {timeAgo(row.createdAt)}
                  {row.ms !== null && <span className="block text-dim">{row.ms} ms</span>}
                </span>
              </button>
              {open && (
                <div className="space-y-3 border-t border-line bg-ink/60 px-4 py-4">
                  {!detail || detail.id !== row.id ? (
                    <p className="text-sm text-muted">Loading details...</p>
                  ) : (
                    <>
                      <div>
                        <p className="mb-1.5 font-mono text-[11px] tracking-widest text-muted uppercase">Sent</p>
                        <JsonView value={detail.payload} className="max-h-72" />
                      </div>
                      <div>
                        <p className="mb-1.5 font-mono text-[11px] tracking-widest text-muted uppercase">
                          Studio answered
                        </p>
                        {detail.error ? (
                          <Notice tone="bad">{detail.error}</Notice>
                        ) : (
                          <JsonView value={detail.result ?? "No result yet."} className="max-h-72" />
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
