"use client";

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";

const VARIANTS = {
  primary: "bg-signal text-ink hover:bg-signal-hi font-semibold",
  secondary: "bg-raised text-text border border-line hover:border-dim",
  danger: "text-bad border border-bad/40 hover:bg-bad/10",
  ghost: "text-muted hover:text-text hover:bg-raised",
} as const;

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        size === "sm" ? "h-8 px-2.5 text-[13px] pointer-coarse:h-10" : "h-10 px-4"
      } ${VARIANTS[variant]} ${focusRing} ${className}`}
    />
  );
}

export const inputClass = `w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-text placeholder:text-dim ${focusRing}`;

export function StatusPill({ online, label }: { online: boolean; label: string }) {
  return (
    <span
      role="status"
      className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
        online ? "border-ok/30 bg-ok/10 text-ok" : "border-line bg-raised text-muted"
      }`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${online ? "live-dot bg-ok" : "bg-dim"}`} aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1800);
  };
  return (
    <Button size="sm" onClick={copy} aria-live="polite">
      {state === "copied" ? "Copied" : state === "failed" ? "Select and copy manually" : label}
    </Button>
  );
}

export function JsonView({ value, className = "" }: { value: unknown; className?: string }) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <pre
      tabIndex={0}
      className={`overflow-auto rounded-md border border-line bg-ink p-3 font-mono text-xs leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-text ${focusRing} ${className}`}
    >
      {text}
    </pre>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "bad" | "ok"; children: ReactNode }) {
  const tones = {
    info: "border-line bg-raised text-muted",
    bad: "border-bad/40 bg-bad/10 text-bad",
    ok: "border-ok/30 bg-ok/10 text-ok",
  };
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm [overflow-wrap:anywhere] whitespace-pre-wrap ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-line bg-panel">
      <header className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
        <h2 className="font-mono text-xs font-semibold tracking-[0.14em] text-muted uppercase">{title}</h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function OfflineHint() {
  return (
    <div className="rounded-lg border border-dashed border-line bg-panel px-6 py-12 text-center">
      <p className="text-base font-medium text-text">Roblox Studio is not connected</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        Open your place in Studio with the Studio Link plugin installed. This page updates by itself as soon as the
        plugin connects. First time here? Follow the Setup tab.
      </p>
    </div>
  );
}
