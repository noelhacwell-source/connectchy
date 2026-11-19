import {Hash,MessageSquare,ListChecks,Flag,CheckCircle2,CircleHelp,Terminal,Save} from "lucide-react";
export function DaySeparator({ label }: { label: string }) {
  return (
    <div className="my-5 flex items-center gap-3 px-3">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10" />
      <span className="rounded-full border border-white/8 bg-ink-900 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
        {label}
      </span>
      <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/10" />
    </div>
  );
}
export function RoomIntro({ name }: { name: string }) {
  return (
    <div className="mx-3 mb-2 mt-6 flex items-start gap-4"
    >
      <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-gradient-to-br from-white/8 to-transparent text-ink-200">
        <Hash size={22} />
      </span>
      <div>
        <p className="text-lg font-semibold tracking-tight">Welcome to {name}</p>
        <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-400">
          Send the first message to your team or attach a file to start the conversation.
        </p>

      </div>
    </div>
  );
}

const kindMeta = {
  message: { label: "Message", icon: MessageSquare, color: "text-ink-300", bg: "bg-white/5", border: "border-white/8" },
  plan: { label: "Plan", icon: ListChecks, color: "text-violet-glow", bg: "bg-violet-glow/10", border: "border-violet-glow/25" },
  status: { label: "Status", icon: Flag, color: "text-sky-glow", bg: "bg-sky-glow/10", border: "border-sky-glow/25" },
  decision: { label: "Decision", icon: CheckCircle2, color: "text-signal-400", bg: "bg-signal-500/10", border: "border-signal-500/30" },
  question: { label: "Question", icon: CircleHelp, color: "text-amber-glow", bg: "bg-amber-glow/10", border: "border-amber-glow/30" },
  command: { label: "Studio command", icon: Terminal, color: "text-ink-200", bg: "bg-ink-700/60", border: "border-white/10" },
  checkpoint: { label: "Checkpoint", icon: Save, color: "text-rose-glow", bg: "bg-rose-glow/10", border: "border-rose-glow/25" },
};

type MessageKind = keyof typeof kindMeta;
export function KindBadge({ kind, compact }: { kind: string; compact?: boolean }) {
  const m = kindMeta[kind as MessageKind];
  if(!Object.hasOwn(kindMeta,kind) || kind==="message")return null;
  const Icon = m.icon;

  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
        m.color,
        m.bg,
        m.border,
      ].join(" ")}
    >
      <Icon size={11} strokeWidth={2.5} />
      {!compact && m.label}
    </span>
  );
}
