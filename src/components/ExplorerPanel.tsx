"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { studio, type TreeNode } from "@/lib/client";
import Inspector from "./Inspector";
import { Button, Notice, OfflineHint } from "./ui";

type ChildMap = Record<string, TreeNode[]>;

function ingest(node: TreeNode, into: ChildMap) {
  if (!node.children) return;
  into[node.path] = node.children;
  node.children.forEach((child) => ingest(child, into));
}

type Loaded = { roots: TreeNode[]; map: ChildMap } | { error: string };

/** Read the services, then re-read whatever was expanded so a refresh keeps your place. */
async function fetchTree(token: string, keepOpen: string[]): Promise<Loaded> {
  const res = await studio<TreeNode>(token, "get_tree", { depth: 2 });
  if (!res.ok || !res.result) return { error: res.error ?? "Studio did not return the game tree." };
  const map: ChildMap = {};
  ingest(res.result, map);
  for (const path of [...keepOpen].sort((a, b) => a.length - b.length).slice(0, 25)) {
    if (map[path]) continue;
    const sub = await studio<TreeNode>(token, "get_tree", { path, depth: 1 });
    if (sub.ok && sub.result) ingest(sub.result, map);
  }
  return { roots: res.result.children ?? [], map };
}

function tone(className: string) {
  if (/Script$/.test(className)) return "bg-info";
  if (/Part$|^Model$|Union|Terrain|SpawnLocation/.test(className)) return "bg-signal";
  if (/Gui$|Frame$|Label$|Button$|TextBox$|^UI/.test(className)) return "bg-ok";
  return "bg-dim";
}

export default function ExplorerPanel({ token, online }: { token: string; online: boolean }) {
  const [roots, setRoots] = useState<TreeNode[] | null>(null);
  const [kids, setKids] = useState<ChildMap>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inspectorRef = useRef<HTMLDivElement>(null);

  const select = (path: string) => {
    setSelected(path);
    // On narrow screens the inspector sits below the tree: bring it into view so the tap visibly does something.
    requestAnimationFrame(() => {
      if (!window.matchMedia("(max-width: 1023px)").matches) return;
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      inspectorRef.current?.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
    });
  };

  const apply = useCallback((out: Loaded) => {
    if ("error" in out) {
      setError(out.error);
      return;
    }
    setRoots(out.roots);
    setKids(out.map);
  }, []);

  // First load, and again whenever Studio comes back online.
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    fetchTree(token, []).then((out) => {
      if (!cancelled) apply(out);
    });
    return () => {
      cancelled = true;
    };
  }, [online, token, apply]);

  const reload = async (keepOpen: string[]) => {
    setBusy(true);
    setError(null);
    apply(await fetchTree(token, keepOpen));
    setBusy(false);
  };

  const toggle = async (node: TreeNode) => {
    const next = new Set(expanded);
    if (next.has(node.path)) {
      next.delete(node.path);
      setExpanded(next);
      return;
    }
    next.add(node.path);
    setExpanded(next);
    if (!kids[node.path] && node.childCount > 0) {
      const res = await studio<TreeNode>(token, "get_tree", { path: node.path, depth: 1 });
      if (res.ok && res.result) {
        const map: ChildMap = {};
        ingest(res.result, map);
        setKids((prev) => ({ ...prev, ...map }));
      } else {
        setError(res.error ?? "Could not open this item.");
      }
    }
  };

  const onChanged = (nextPath: string | null) => {
    setSelected(nextPath);
    reload([...expanded]);
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const open = expanded.has(node.path);
    const children = kids[node.path];
    const isSelected = selected === node.path;
    return (
      <li key={node.path}>
        <div
          className={`flex items-center rounded ${isSelected ? "bg-signal/15" : "hover:bg-raised"}`}
          style={{ paddingLeft: depth * 14 }}
        >
          {node.childCount > 0 ? (
            <button
              type="button"
              aria-expanded={open}
              aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`}
              onClick={() => toggle(node)}
              className="flex h-8 w-7 shrink-0 items-center justify-center text-muted pointer-coarse:h-11 pointer-coarse:w-9 hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className={`transition-transform ${open ? "rotate-90" : ""}`}>
                <path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <span className="w-7 shrink-0 pointer-coarse:w-9" />
          )}
          <button
            type="button"
            aria-current={isSelected ? "true" : undefined}
            onClick={() => select(node.path)}
            className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded pr-2 text-left pointer-coarse:h-11 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal"
          >
            <span className={`h-2 w-2 shrink-0 rounded-[2px] ${tone(node.className)}`} aria-hidden />
            <span className={`truncate text-sm ${isSelected ? "text-text" : "text-text/90"}`}>{node.name}</span>
            {node.className !== node.name && (
              <span className="hidden shrink-0 font-mono text-[11px] text-dim sm:inline">{node.className}</span>
            )}
          </button>
        </div>
        {open && node.childCount > 0 && (
          <ul>
            {children ? (
              <>
                {children.map((child) => renderNode(child, depth + 1))}
                {children.length < node.childCount && (
                  <li className="py-1 text-xs text-dim" style={{ paddingLeft: (depth + 1) * 14 + 28 }}>
                    {node.childCount - children.length} more not shown. Use Console, find, to search.
                  </li>
                )}
              </>
            ) : (
              <li className="py-1 text-xs text-muted" style={{ paddingLeft: (depth + 1) * 14 + 28 }}>
                Loading...
              </li>
            )}
          </ul>
        )}
      </li>
    );
  };

  if (!online && roots === null) return <OfflineHint />;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <section className="rounded-lg border border-line bg-panel lg:sticky lg:top-4 lg:self-start" aria-label="Game explorer">
        <header className="flex min-h-12 items-center justify-between gap-2 border-b border-line px-4 py-2">
          <h2 className="font-mono text-xs font-semibold tracking-[0.14em] text-muted uppercase">Explorer</h2>
          <Button size="sm" onClick={() => reload([...expanded])} disabled={busy || !online}>
            {busy ? "Reading..." : "Refresh"}
          </Button>
        </header>
        <div className="max-h-[70vh] overflow-auto p-2">
          {!online && (
            <div className="mb-2">
              <Notice>Studio went offline. This is the last tree that was loaded.</Notice>
            </div>
          )}
          {error && (
            <div className="mb-2">
              <Notice tone="bad">{error}</Notice>
            </div>
          )}
          {roots === null ? (
            !error && <p className="px-2 py-3 text-sm text-muted">Reading your game from Studio...</p>
          ) : (
            <ul>{roots.map((node) => renderNode(node, 0))}</ul>
          )}
        </div>
      </section>

      <div ref={inspectorRef} className="min-w-0 scroll-mt-4">
      {selected ? (
        <Inspector key={selected} token={token} path={selected} onChanged={onChanged} />
      ) : (
        <div className="rounded-lg border border-dashed border-line bg-panel px-6 py-12 text-center">
          <p className="text-base font-medium">Pick anything in the Explorer</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            See its properties, read or edit its script, rename it, duplicate it or delete it. Changes go straight
            into Studio.
          </p>
        </div>
      )}
      </div>
    </div>
  );
}
