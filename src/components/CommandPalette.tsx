"use client";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Search } from "lucide-react";

export type PaletteAction = {
  id: string;
  label: string;
  hint?: string;
  icon: ComponentType<{ size?: number | string }>;
  run: () => void;
};

/**
 * Cmd/Ctrl+K command palette: jump between rooms, views and agents, or run
 * workspace actions without leaving the keyboard.
 */
export default function CommandPalette({
  open,
  close,
  actions,
}: {
  open: boolean;
  close: () => void;
  actions: PaletteAction[];
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return actions;
    return actions.filter((a) =>
      `${a.label} ${a.hint ?? ""}`.toLowerCase().includes(needle),
    );
  }, [actions, query]);

  useEffect(() => {
    const node = list.current?.children[index] as HTMLElement | undefined;
    node?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!open) return null;
  const run = (action: PaletteAction | undefined) => {
    if (!action) return;
    close();
    action.run();
  };
  return (
    <div
      className="cmdk-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="cmdk-panel" role="dialog" aria-label="Command palette">
        <div className="cmdk-input-row">
          <Search size={16} aria-hidden />
          <input
            ref={input}
            value={query}
            aria-label="Search commands"
            placeholder="Jump to a room, agent or view…"
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, filtered.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              }
              if (e.key === "Enter") {
                e.preventDefault();
                run(filtered[index]);
              }
            }}
          />
          <kbd>esc</kbd>
        </div>
        <div className="cmdk-list" ref={list}>
          {!filtered.length && (
            <p className="cmdk-empty">Nothing matches “{query}”.</p>
          )}
          {filtered.map((action, i) => (
            <button
              key={action.id}
              type="button"
              className={i === index ? "active" : ""}
              onMouseEnter={() => setIndex(i)}
              onClick={() => run(action)}
            >
              <action.icon size={15} aria-hidden />
              <span>{action.label}</span>
              {action.hint && <small>{action.hint}</small>}
            </button>
          ))}
        </div>
        <div className="cmdk-footer">
          <span>↑ ↓ navigate</span>
          <span>↵ run</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
