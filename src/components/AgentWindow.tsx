"use client";
import { useEffect, useState } from "react";
import {
  Activity,
  AtSign,
  Crosshair,
  Pause,
  Play,
  Power,
  RotateCcw,
  UserMinus,
  X,
} from "lucide-react";
import type { ModuleSettings } from "@/lib/modules";
import { timeAgo } from "@/lib/client";
import { requestJson } from "@/lib/workspace-client";
import type { TeamPlan } from "@/lib/team-types";
import { AgentAvatar } from "./AgentAvatar";

type PresenceRow = { agent: string; task: string; lastSeenAt: string };
type CommandRow = {
  id: number;
  type: string;
  status: string;
  error: string | null;
  agent: string | null;
  createdAt: string;
  ms: number | null;
};

/**
 * The agent window: a live, window-chrome panel that shows who is working,
 * what they are doing right now, and the last commands that ran in Studio.
 * Reads the presence + activity endpoints directly, so it always reflects
 * the live state of the room and Studio session.
 */
export default function AgentWindow({
  mode,
  token,
  roomName,
  online,
  placeName,
  paused,
  team,
  presence,
  enabled,
  busy,
  onFocus,
  onPing,
  onManage,
  onClose,
}: {
  mode?: string;
  token: string;
  roomName: string;
  online: boolean;
  placeName: string | null;
  paused: boolean;
  team: TeamPlan;
  presence: PresenceRow[];
  enabled: ModuleSettings;
  busy: boolean;
  onFocus: (agent: string) => void;
  onPing: (agent: string) => void;
  onManage: (
    agent: string,
    operation: "pause" | "resume" | "stop" | "remove" | "restore",
  ) => void;
  onClose: () => void;
}) {
  const [commands, setCommands] = useState<CommandRow[] | null>(null);

  useEffect(() => {
    if (!enabled.activity) return;
    let live = true;
    const poll = async () => {
      try {
        const d = await requestJson<{ commands: CommandRow[] }>(
          `/api/agent/${token}/commands?limit=8`,
        );
        if (live) setCommands(d.commands);
      } catch {
        // The feed is decorative: keep the last good snapshot on failure.
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [enabled.activity, token]);

  const participants = team.participants.filter((p) => p.control !== "removed");
  const stateOf = (agent: string): { label: string; tone: string } => {
    const participant = team.participants.find(
      (p) => p.agent.toLowerCase() === agent.toLowerCase(),
    );
    if (participant?.control === "removed") return { label: "Removed", tone: "off" };
    if (participant?.done) return { label: "Done", tone: "done" };
    if (participant?.control === "stopped") return { label: "Stopped", tone: "bad" };
    if (participant?.control === "paused") return { label: "Paused", tone: "wait" };
    if (paused) return { label: "On hold", tone: "wait" };
    if (presence.some((s) => s.agent.toLowerCase() === agent.toLowerCase()))
      return { label: "Working", tone: "live" };
    return { label: "Idle", tone: "idle" };
  };
  const lastCommandFor = (agent: string) =>
    commands?.find(
      (c) => c.agent?.toLowerCase() === agent.toLowerCase() && c.status === "done",
    );

  return (
    <aside className="agent-window" aria-label="Agent window">
      <header className="aw-titlebar">
        <span className="aw-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className="aw-title">
          Agent window
          <span className="aw-room"># {roomName}</span>
        </span>
        <button
          className="icon-button aw-close"
          aria-label="Close agent window"
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </header>

      <div className="aw-body">
        <section className="aw-studio-card">
          <div className="aw-studio-head">
            <span className={`aw-live-pill ${online && !paused ? "live" : ""}`}>
              <span className="aw-live-dot" />
              {paused ? "Paused" : `${mode==="vscode"?"VS Code":"Studio"} ${online?"online":"offline"}`}
            </span>
            <span className="aw-studio-place">{placeName ?? "No place open"}</span>
          </div>
          <div className="aw-meter" aria-hidden>
            <span style={{ width: online ? "86%" : "6%" }} />
          </div>
          <div className="aw-studio-stats">
            <span>
              <strong>{participants.length}</strong> agents
            </span>
            <span>
              <strong>{commands?.length ?? "—"}</strong> recent commands
            </span>
            <span>
              <strong>{presence.length}</strong> checking in
            </span>
          </div>
        </section>

        <section>
          <p className="aw-section-label">THE TEAM · {roomName}</p>
          {!participants.length && (
            <p className="aw-empty">
              No agents have joined yet. Give each AI your connection prompt so
              it can register a role.
            </p>
          )}
          {participants.map((p) => {
            const state = stateOf(p.agent);
            const seen = presence.find(
              (s) => s.agent.toLowerCase() === p.agent.toLowerCase(),
            );
            const last = lastCommandFor(p.agent);
            const removed = p.control === "removed";
            return (
              <article
                className={`aw-agent ${removed ? "removed" : ""}`}
                key={p.agent}
              >
                <div className="aw-agent-head">
                  <AgentAvatar name={p.agent} size="sm" />
                  <div className="aw-agent-id">
                    <strong>{p.agent}</strong>
                    <span className={`aw-state ${state.tone}`}>
                      <i />
                      {state.label}
                    </span>
                  </div>
                  <time>{seen ? timeAgo(seen.lastSeenAt) : "—"}</time>
                </div>
                <p className="aw-agent-role">{p.role}</p>
                <p className="aw-agent-task">
                  {removed
                    ? "Removed from this room"
                    : p.done
                      ? "Role completed"
                      : seen?.task ?? "Waiting for a room check…"}
                </p>
                {last && (
                  <p className="aw-agent-last">
                    <Activity size={11} />
                    last: <code>{last.type}</code>
                    <span className="aw-ok">✓</span>
                  </p>
                )}
                <div className="aw-agent-actions">
                  <button
                    title={`Focus the conversation on ${p.agent}`}
                    onClick={() => onFocus(p.agent)}
                    disabled={busy}
                  >
                    <Crosshair size={13} /> Focus
                  </button>
                  <button
                    title={`Ping ${p.agent}`}
                    onClick={() => onPing(p.agent)}
                    disabled={busy}
                  >
                    <AtSign size={13} /> Ping
                  </button>
                  {removed ? (
                    <button
                      title={`Restore ${p.agent}`}
                      onClick={() => onManage(p.agent, "restore")}
                      disabled={busy}
                    >
                      <RotateCcw size={13} /> Restore
                    </button>
                  ) : (
                    <>
                      <button
                        title={p.control ? `Resume ${p.agent}` : `Pause ${p.agent}`}
                        onClick={() =>
                          onManage(p.agent, p.control ? "resume" : "pause")
                        }
                        disabled={busy}
                      >
                        {p.control ? <Play size={13} /> : <Pause size={13} />}
                        {p.control ? "Resume" : "Pause"}
                      </button>
                      <button
                        title={`Stop ${p.agent}`}
                        className="danger"
                        onClick={() => onManage(p.agent, "stop")}
                        disabled={busy || p.control === "stopped"}
                      >
                        <Power size={13} />
                      </button>
                      <button
                        title={`Remove ${p.agent} and open a slot for a new AI. Chat history is kept.`}
                        className="danger"
                        onClick={() => onManage(p.agent, "remove")}
                        disabled={busy}
                      >
                        <UserMinus size={13} /> Remove AI
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </section>

        {enabled.activity && (
          <section>
            <p className="aw-section-label">LIVE ACTIVITY</p>
            <div className="aw-feed">
              {commands === null && <p className="aw-empty">Watching Studio…</p>}
              {commands?.length === 0 && (
                <p className="aw-empty">No commands yet.</p>
              )}
              {commands?.map((c) => (
                <div className="aw-feed-row" key={c.id}>
                  <span
                    className={`aw-feed-dot ${c.status === "done" ? "ok" : "bad"}`}
                  />
                  <code>{c.type}</code>
                  <span className="who">{c.agent ?? "dashboard"}</span>
                  <time>
                    {new Date(c.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <footer className="aw-footer">
        <span>
          <kbd>⌘</kbd>
          <kbd>K</kbd> command palette
        </span>
        <span className="aw-footer-hint">live room activity</span>
      </footer>
    </aside>
  );
}
