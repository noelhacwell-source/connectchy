"use client";
import {
  ChatMessageExtras,
  ChatToolbox,
  CopyableCode,
} from "./ChatEnhancements";
import {
  EMPTY_FILTERS,
  type ChatFilters,
  type ChatMeta,
} from "@/lib/chat-types";
import { subscribeNever } from "@/lib/client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  AtSign,
  ChevronDown,
  Copy,
  Download,
  Edit3,
  Hash,
  MessageSquare,
  MoreHorizontal,
  Pin,
  Reply,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
  Check,
  Clock,
} from "lucide-react";
import type { ModuleSettings } from "@/lib/modules";
import type { TeamPlan } from "@/lib/team-types";
import { DEFAULT_TEAM } from "@/lib/team-types";
import { requestJson, postJson, downloadText } from "@/lib/workspace-client";
import { Button, Notice } from "./ui";
export type ChatMessage = {
  id: number;
  agent: string;
  text: string;
  kind: string;
  paths: string[];
  mentions: string[];
  createdAt: string;
  pinned: number;
  replyTo: number | null;
  editedAt: string | null;
  meta?: ChatMeta;
  readBy?: string[];
};
type ChatData = {
  receipts?: { agent: string; through: number }[];
  controls?: { paused: boolean; stopRevision: number };
  messages: ChatMessage[];
  nextCursor: number;
  olderCursor: number | null;
  hasOlder: boolean;
  team: TeamPlan;
  attention: { unacknowledgedPings: ChatMessage[] };
  room: { name: string; active: boolean };
};
export function AgentAvatar({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md";
}) {
  let hue = 0;
  for (const c of name) hue = (hue * 31 + c.charCodeAt(0)) % 360;
  return (
    <span
      className={`agent-avatar ${size}`}
      style={{
        background: `hsl(${hue} 28% 20%)`,
        color: `hsl(${hue} 65% 78%)`,
      }}
    >
      {name === "Owner" ? "Y" : name.slice(0, 2).toUpperCase()}
    </span>
  );
}
export default function AgentChat({
  token,
  roomId,
  roomName,
  active,
  selectedAgent,
  enabled,
  onTeam,
  activate,
}: {
  token: string;
  roomId: number;
  roomName: string;
  active: boolean;
  selectedAgent: string;
  enabled: ModuleSettings;
  onTeam: (team: TeamPlan) => void;
  activate: () => void;
}) {
  const base = `/api/agent/${token}/room`,
    suffix = `?room=${roomId}`;
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [pings, setPings] = useState<ChatMessage[]>([]),
    [team, setTeam] = useState<TeamPlan>(DEFAULT_TEAM),
    [draftText, setDraftText] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [pins, setPins] = useState(false),
    [hasOlder, setHasOlder] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reply, setReply] = useState<ChatMessage | null>(null),
    [recipient, setRecipient] = useState(""),
    [showTeam, setShowTeam] = useState(false),
    [expected, setExpected] = useState<number | null>(null),
    [editing, setEditing] = useState<number | null>(null),
    [editText, setEditText] = useState(""),
    [hide, setHide] = useState<number | null>(null),
    [copied, setCopied] = useState<number | null>(null);
  const [filters, setFilters] = useState<ChatFilters>({ ...EMPTY_FILTERS }),
    [preview, setPreview] = useState(false),
    [expandedComposer, setExpandedComposer] = useState(false),
    [urgentDraft, setUrgentDraft] = useState(false),
    [labelDraft, setLabelDraft] = useState(""),
    [sendMode, setSendMode] = useState("enter"),
    [soundOn, setSoundOn] = useState(false);
  const soundContext = useRef<AudioContext | null>(null);
  const [presence, setPresence] = useState<
    { agent: string; task: string; lastSeenAt: string }[]
  >([]);
  useEffect(() => {
    if (!enabled.agentPresence || !showTeam) return;
    let live = true;
    const poll = () =>
      requestJson<{ agents: typeof presence }>(
        `/api/agent/${token}/workspace?kind=presence&room=${roomId}`,
      )
        .then((d) => {
          if (live) setPresence(d.agents);
        })
        .catch(() => {});
    void poll();
    const t = setInterval(poll, 8000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [token, roomId, enabled.agentPresence, showTeam]);
  const list = useRef<HTMLDivElement>(null),
    input = useRef<HTMLTextAreaElement>(null),
    last = useRef(0),
    draftKey = `studio-link:draft:${token}:${roomId}`;
  const storedDraft = useSyncExternalStore(
    subscribeNever,
    () => {
      try {
        return enabled.draftSaving
          ? (localStorage.getItem(draftKey) ?? "")
          : "";
      } catch {
        return "";
      }
    },
    () => "",
  );
  const text = draftText ?? storedDraft;
  const draft = (value: string) => {
    setDraftText(value);
    if (enabled.draftSaving)
      try {
        localStorage.setItem(draftKey, value);
      } catch {}
  };
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const effectiveQuery = enabled.messageSearch ? query : "";
  const effectivePins = enabled.messagePins && pins;
  const filterFeatures: Record<keyof ChatFilters, keyof ModuleSettings> = {
    kind: "chatKindFilter",
    tag: "chatTags",
    since: "chatDateFilter",
    until: "chatDateFilter",
    urgent: "chatUrgency",
    starred: "chatStars",
    followup: "chatFollowups",
    thread: "chatThreads",
    id: "chatJump",
  };
  const filterString =
    Object.entries(filters)
      .filter(
        ([key, value]) =>
          value && enabled[filterFeatures[key as keyof ChatFilters]],
      )
      .map(
        ([key, value]) =>
          `&${key}=${encodeURIComponent(value === true ? "1" : String(value))}`,
      )
      .join("") + (enabled.chatHideSystem ? "&hideSystem=1" : "");
  const url =
    base +
    suffix +
    `&agent=Owner${effectiveQuery ? `&q=${encodeURIComponent(effectiveQuery)}` : ""}${selectedAgent ? `&speaker=${encodeURIComponent(selectedAgent)}` : ""}${effectivePins ? "&pinned=1" : ""}` +
    filterString;
  const scrollOnUpdate = useRef(true),
    olderHeight = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!list.current) return;
    if (olderHeight.current !== null) {
      list.current.scrollTop += list.current.scrollHeight - olderHeight.current;
      olderHeight.current = null;
    } else if (scrollOnUpdate.current) {
      list.current.scrollTop = list.current.scrollHeight;
      scrollOnUpdate.current = false;
    }
  }, [messages]);
  const loadKey = useRef("");
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const d = await requestJson<ChatData>(url, { signal });
      if (signal?.aborted) return;
      if (
        enabled.chatSounds &&
        soundOn &&
        last.current &&
        d.nextCursor > last.current &&
        soundContext.current
      ) {
        const context = soundContext.current;
        const oscillator = context.createOscillator(),
          gain = context.createGain();
        oscillator.connect(gain);
        gain.connect(context.destination);
        gain.gain.setValueAtTime(0.025, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          context.currentTime + 0.15,
        );
        oscillator.frequency.value = 660;
        oscillator.start();
        oscillator.stop(context.currentTime + 0.16);
      }
      d.messages = d.messages.map((message) => ({
        ...message,
        readBy:
          d.receipts
            ?.filter((r) => r.through >= message.id)
            .map((r) => r.agent) ?? [],
      }));
      const fresh = loadKey.current !== url;
      loadKey.current = url;
      const nearBottom =
        !list.current ||
        list.current.scrollHeight -
          list.current.scrollTop -
          list.current.clientHeight <
          140;
      scrollOnUpdate.current = (nearBottom || fresh) && !query;
      setMessages((previous) => {
        if (fresh || query || selectedAgent || pins || !d.messages.length)
          return d.messages;
        const ids = new Set(d.messages.map((m) => m.id)),
          min = d.messages[0]?.id ?? Infinity;
        return [
          ...new Map(
            [
              ...previous.filter((m) => m.id < min || ids.has(m.id)),
              ...d.messages,
            ].map((m) => [m.id, m]),
          ).values(),
        ].sort((a, b) => a.id - b.id);
      });
      setPings(d.attention.unacknowledgedPings);
      setTeam(d.team);
      onTeam(d.team);
      setHasOlder(d.hasOlder);
      setError("");
      if (nearBottom && d.nextCursor !== last.current && !query)
        requestAnimationFrame(() =>
          list.current?.scrollTo({
            top: list.current.scrollHeight,
            behavior: "smooth",
          }),
        );
      last.current = d.nextCursor;
    },
    [url, query, selectedAgent, pins, onTeam, enabled.chatSounds, soundOn],
  );
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    const poll = async () => {
      try {
        if (live) await load(controller.signal);
      } catch (e) {
        if (live)
          setError(e instanceof Error ? e.message : "Cannot load messages.");
      }
    };
    void poll();
    const timer = setInterval(poll, 3000);
    return () => {
      live = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [load]);
  const action = async (body: object) => {
    setBusy(true);
    setError("");
    try {
      await postJson(base + suffix, body);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Message action failed.");
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    if (!text.trim() || busy || !active) return;
    setBusy(true);
    setError("");
    try {
      if (enabled.chatSlashCommands && text.trim().startsWith("/")) {
        const [command, ...rest] = text.trim().split(" ");
        const value = rest.join(" ").trim();
        if (command === "/help") {
          setError(
            "Commands: /task title, /note text, /decision text, /stop. Slash commands create workspace items or request an owner stop; ordinary messages are shared with agents.",
          );
          return;
        }
        if (command === "/stop") {
          await postJson(`/api/agent/${token}/control`, { action: "stop" });
          draft("");
          await load();
          return;
        }
        if (["/task", "/note", "/decision"].includes(command)) {
          if (!value) throw new Error("Add text after the slash command.");
          const kind = command.slice(1);
          await postJson(`/api/agent/${token}/workspace?room=${roomId}`, {
            action: "create",
            entry: { kind, title: value.slice(0, 160), body: value },
          });
          draft("");
          await load();
          return;
        }
      }
      await postJson(base + suffix, {
        agent: "Owner",
        text,
        kind: "message",
        urgent: enabled.chatUrgency && urgentDraft,
        labels: enabled.chatTags
          ? labelDraft
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        mentions: recipient ? [recipient] : [],
        ...(reply && enabled.messageReplies ? { replyTo: reply.id } : {}),
      });
      draft("");
      setReply(null);
      setRecipient("");
      await load();
      requestAnimationFrame(() =>
        list.current?.scrollTo({
          top: list.current.scrollHeight,
          behavior: "smooth",
        }),
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Message not sent. Your draft is preserved.",
      );
    } finally {
      setBusy(false);
    }
  };
  const ping = (name: string) => {
    setRecipient(name);
    draft(text || `@${name} `);
    input.current?.focus();
  };
  const configure = async () => {
    setBusy(true);
    try {
      await postJson(base + "/team" + suffix, {
        action: "resize",
        expected: expected ?? team.expected,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not configure team.");
    } finally {
      setBusy(false);
    }
  };
  const manageAgent = async (agent:string, operation:string) => {
    setBusy(true);
    try { await postJson(base+"/team"+suffix,{action:"manage",agent,operation}); await load(); }
    catch(e){setError(e instanceof Error?e.message:"Could not update agent.");}
    finally{setBusy(false);}
  };
  const exportRoom = async (format: "md" | "json") => {
    try {
      const r = await fetch(base + suffix + `&format=${format}`);
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.error);
      }
      downloadText(
        `${roomName.replace(/[^a-z0-9_-]/gi, "-")}.${format}`,
        await r.text(),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    }
  };
  const pingIds = new Set(pings.map((p) => p.id));
  return (
    <div className="chat-layout">
      <div className="chat-main">
        <div className="conversation-toolbar">
          <div>
            <span className="flex items-center gap-2 text-sm font-medium">
              <Hash size={16} className="text-dim" />
              {roomName}
              <span className={`tiny-badge ${active ? "live" : ""}`}>
                {active ? "Active room" : "History"}
              </span>
            </span>
            <span className="mt-1 block text-xs text-dim">
              {team.participants.filter(p=>p.control!=="removed").length} agents ·{" "}
              {team.phase === "active"
                ? "Roles agreed"
                : team.phase === "done"
                  ? "Work completed"
                  : "Planning together"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="add-agent-button"
              disabled={busy || team.expected >= 32}
              title="Increase the team size; existing roles are preserved. Give the same project link to your new AI."
              onClick={async () => {
                setBusy(true);
                try {
                  await postJson(base + "/team" + suffix, {
                    action: "resize",
                    expected: team.expected + 1,
                  });
                  await load();
                  setShowTeam(true);
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Could not add agent slot.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              + Agent
            </button>
            <ChatToolbox
              token={token}
              roomId={roomId}
              enabled={enabled}
              filters={filters}
              setFilters={setFilters}
              insert={(value) => draft(text + value)}
              reload={load}
              lastId={messages.at(-1)?.id ?? 0}
            />
            {enabled.messagePins && (
              <button
                title="Pinned messages"
                aria-label="Pinned messages"
                aria-pressed={pins}
                className={`icon-button ${pins ? "selected" : ""}`}
                onClick={() => setPins(!pins)}
              >
                <Pin size={17} />
              </button>
            )}
            {enabled.messageExport && (
              <details className="relative">
                <summary className="icon-button" aria-label="Export room">
                  <Download size={17} />
                </summary>
                <div className="popover">
                  <button onClick={() => void exportRoom("md")}>
                    Download Markdown
                  </button>
                  <button onClick={() => void exportRoom("json")}>
                    Download JSON
                  </button>
                </div>
              </details>
            )}
            <button
              className={`icon-button ${showTeam ? "selected" : ""}`}
              aria-label="Team and roles"
              onClick={() => setShowTeam(!showTeam)}
            >
              <Users size={18} />
            </button>
          </div>
        </div>
        {enabled.messageSearch && (
          <div className="chat-search">
            <Search size={14} />
            <input
              aria-label="Search conversation"
              placeholder="Search this conversation"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")} aria-label="Clear search">
                <X size={13} />
              </button>
            )}
          </div>
        )}
        {Object.values(filters).some(Boolean) && (
          <div className="chat-filter-banner">
            Filtered conversation{" "}
            <button onClick={() => setFilters({ ...EMPTY_FILTERS })}>
              Clear filters
            </button>
          </div>
        )}
        {!active && (
          <div className="context-banner">
            You’re reading an older room.
            <button onClick={activate}>Use this room for AI work</button>
          </div>
        )}
        {enabled.pingInbox && pings.length > 0 && (
          <details className="ping-banner">
            <summary>
              <AtSign size={15} />
              {pings.length} unread ping{pings.length === 1 ? "" : "s"} for you
              <ChevronDown size={14} />
            </summary>
            <div className="p-3">
              {pings.map((p) => (
                <div key={p.id} className="mb-2 text-xs">
                  <strong>{p.agent}</strong>
                  <p className="mt-1 whitespace-pre-wrap text-muted">
                    {p.text}
                  </p>
                  <button className="text-signal" onClick={() => ping(p.agent)}>
                    Ping back
                  </button>
                </div>
              ))}
              <Button
                size="sm"
                disabled={busy || !active}
                onClick={() =>
                  void action({
                    action: "ack",
                    agent: "Owner",
                    through: pings.at(-1)!.id,
                  })
                }
              >
                Mark as read
              </Button>
            </div>
          </details>
        )}
        <div
          ref={list}
          className="chat-scroll"
          role="log"
          aria-label="AI conversation"
        >
          <div className="message-column">
            {hasOlder && !query && !pins && messages.length > 0 && (
              <button
                className="load-older"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const d = await requestJson<ChatData>(
                      url + `&before=${messages[0].id}`,
                    );
                    olderHeight.current = list.current?.scrollHeight ?? null;
                    setMessages((prev) =>
                      [
                        ...new Map(
                          [...d.messages, ...prev].map((m) => [m.id, m]),
                        ).values(),
                      ].sort((a, b) => a.id - b.id),
                    );
                    setHasOlder(d.hasOlder);
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not load older messages.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Load older messages
              </button>
            )}
            {!messages.length && (
              <div className="chat-empty">
                <div className="empty-symbol">
                  <Sparkles size={30} />
                </div>
                <p className="eyebrow">A PLACE TO BUILD TOGETHER</p>
                <h2>
                  {query
                    ? "No messages found."
                    : pins
                      ? "Nothing pinned yet."
                      : "Your next idea starts here."}
                </h2>
                <p>
                  {query
                    ? "Try a different search or agent filter."
                    : pins
                      ? "Pin a useful decision or instruction to keep it close."
                      : "Connect your AIs, give them a shared direction, and watch the work come together."}
                </p>
                {!query && !pins && (
                  <div className="starter-prompts">
                    {[
                      "Plan our next build",
                      "Agree roles before editing",
                      "Review progress and blockers",
                    ].map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          draft(t);
                          input.current?.focus();
                        }}
                      >
                        <MessageSquare size={14} />
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                <span className="mt-5 block text-xs text-dim">
                  Messages go to this room. They don’t start or wake an AI
                  client.
                </span>
              </div>
            )}
            {messages.map((message) => (
              <article
                key={message.id}
                className={`chat-message ${message.agent === "Owner" ? "from-owner" : ""} ${pingIds.has(message.id) && enabled.pingInbox ? "mentioned" : ""} ${enabled.compactMessages ? "compact" : ""}`}
              >
                <AgentAvatar name={message.agent} />
                <div className="message-content">
                  <div className="message-meta">
                    <strong>
                      {message.agent === "Owner" ? "You" : message.agent}
                    </strong>
                    {message.agent !== "Owner" && (
                      <span className="agent-label">
                        {message.agent === "Coordinator"
                          ? "System"
                          : (team.participants.find(
                              (p) =>
                                p.agent.toLowerCase() ===
                                message.agent.toLowerCase(),
                            )?.role ?? "Agent")}
                      </span>
                    )}
                    {enabled.timestamps && (
                      <time>
                        {new Date(message.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {message.editedAt ? " · edited" : ""}
                      </time>
                    )}
                    {enabled.messagePins && !!message.pinned && (
                      <Pin size={12} className="text-signal" />
                    )}
                  </div>
                  {message.replyTo && (
                    <button
                      className="reply-reference"
                      onClick={() =>
                        document
                          .getElementById(`message-${message.replyTo}`)
                          ?.scrollIntoView({
                            block: "center",
                            behavior: "smooth",
                          })
                      }
                    >
                      <Reply size={12} />
                      Reply to #{message.replyTo}
                      {messages.find((m) => m.id === message.replyTo)
                        ? ` · ${messages.find((m) => m.id === message.replyTo)?.agent}`
                        : ""}
                    </button>
                  )}
                  <div id={`message-${message.id}`} className="message-prose">
                    {editing === message.id ? (
                      <div>
                        <textarea
                          aria-label="Edit message"
                          className="workspace-input"
                          rows={4}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                        />
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={async () => {
                              await action({
                                action: "edit",
                                id: message.id,
                                text: editText,
                              });
                              setEditing(null);
                            }}
                          >
                            Save edit
                          </Button>
                          <Button size="sm" onClick={() => setEditing(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code: (props) =>
                            enabled.chatCodeCopy &&
                            String(props.children).includes("\n") ? (
                              <CopyableCode>{props.children}</CopyableCode>
                            ) : (
                              <code>{props.children}</code>
                            ),
                          a: (props) => (
                            <a {...props} target="_blank" rel="noreferrer" />
                          ),
                        }}
                      >
                        {message.text}
                      </ReactMarkdown>
                    )}
                  </div>
                  <ChatMessageExtras
                    token={token}
                    roomId={roomId}
                    message={message}
                    enabled={enabled}
                    reload={load}
                    quote={(value) => {
                      draft(text + value);
                      input.current?.focus();
                    }}
                    thread={(id) =>
                      setFilters({ ...EMPTY_FILTERS, thread: id })
                    }
                  />
                  {message.paths?.length > 0 && (
                    <div className="path-chips">
                      {message.paths.map((p) => (
                        <span key={p}>{p}</span>
                      ))}
                    </div>
                  )}
                  <div className="message-actions">
                    <button
                      title="Copy message"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(message.text);
                          setCopied(message.id);
                          setTimeout(() => setCopied(null), 1500);
                        } catch {
                          setError(
                            "Clipboard unavailable. Select the message text to copy it.",
                          );
                        }
                      }}
                    >
                      {copied === message.id ? (
                        <Check size={13} />
                      ) : (
                        <Copy size={13} />
                      )}
                    </button>
                    {active && enabled.messageReplies && (
                      <button
                        title="Reply"
                        onClick={() => {
                          setReply(message);
                          input.current?.focus();
                        }}
                      >
                        <Reply size={13} />
                      </button>
                    )}
                    {active &&
                      enabled.pingInbox &&
                      !["Owner", "Coordinator"].includes(message.agent) && (
                        <button
                          title="Ping agent"
                          onClick={() => ping(message.agent)}
                        >
                          <AtSign size={13} />
                        </button>
                      )}
                    {active && enabled.messagePins && (
                      <button
                        title={message.pinned ? "Unpin message" : "Pin message"}
                        onClick={() =>
                          void action({ action: "pin", id: message.id })
                        }
                      >
                        <Pin size={13} />
                      </button>
                    )}
                    {active &&
                      enabled.messageEditing &&
                      message.agent === "Owner" && (
                        <button
                          title="Edit message"
                          onClick={() => {
                            setEditing(message.id);
                            setEditText(message.text);
                          }}
                        >
                          <Edit3 size={13} />
                        </button>
                      )}
                    {active && enabled.messageEditing && (
                      <button
                        title="Hide message"
                        onClick={() => setHide(message.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                    {hide === message.id && (
                      <>
                        <span className="text-xs">Hide this message?</span>
                        <button
                          onClick={async () => {
                            await action({ action: "delete", id: message.id });
                            setMessages((prev) =>
                              prev.filter((m) => m.id !== message.id),
                            );
                            setHide(null);
                          }}
                        >
                          Hide
                        </button>
                        <button onClick={() => setHide(null)}>Cancel</button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="composer-area">
          {error && (
            <div className="mb-2">
              <Notice tone="bad">{error}</Notice>
            </div>
          )}
          <div
            className={`composer-box ${expandedComposer ? "composer-expanded" : ""}`}
          >
            {(enabled.chatFormatting ||
              enabled.chatPreview ||
              enabled.chatExpandComposer ||
              enabled.chatClearDraft) && (
              <div className="composer-toolstrip">
                {enabled.chatFormatting &&
                  [
                    ["Bold", "**bold**"],
                    ["Italic", "*italic*"],
                    ["List", "\n- Item\n"],
                    ["Code", "\n```lua\n-- code\n```\n"],
                    ["Link", "[label](https://example.com)"],
                    ["Quote", "> quoted context\n"],
                  ].map(([label, value]) => (
                    <button
                      key={label}
                      onClick={() => {
                        draft(text + value);
                        input.current?.focus();
                      }}
                    >
                      {label}
                    </button>
                  ))}
                {enabled.chatPreview && (
                  <button
                    className={preview ? "selected" : ""}
                    onClick={() => setPreview(!preview)}
                  >
                    Preview
                  </button>
                )}
                {enabled.chatExpandComposer && (
                  <button
                    onClick={() => setExpandedComposer(!expandedComposer)}
                  >
                    {expandedComposer ? "Shrink" : "Expand"}
                  </button>
                )}
                {enabled.chatClearDraft && (
                  <button disabled={!text} onClick={() => draft("")}>
                    Clear draft
                  </button>
                )}
              </div>
            )}
            {enabled.chatPreview && preview && (
              <div className="draft-preview message-prose">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {text || "Nothing to preview yet."}
                </ReactMarkdown>
              </div>
            )}
            {(enabled.chatUrgency || enabled.chatTags) && (
              <details className="composer-options">
                <summary>Message options</summary>
                {enabled.chatUrgency && (
                  <label className="draft-urgent">
                    <input
                      type="checkbox"
                      checked={urgentDraft}
                      onChange={(e) => setUrgentDraft(e.target.checked)}
                    />
                    Urgent
                  </label>
                )}
                {enabled.chatTags && (
                  <input
                    className="draft-labels"
                    aria-label="Draft labels"
                    value={labelDraft}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    placeholder="Optional topic labels, comma separated"
                  />
                )}
              </details>
            )}
            {reply && (
              <div className="composer-context">
                <Reply size={14} />
                Replying to {reply.agent}
                <span>{reply.text.slice(0, 70)}</span>
                <button
                  onClick={() => setReply(null)}
                  aria-label="Cancel reply"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {recipient && (
              <div className="composer-context">
                <AtSign size={14} />
                Pinging {recipient}
                <button
                  onClick={() => setRecipient("")}
                  aria-label="Clear ping"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <textarea
              ref={input}
              aria-label="Message the agents"
              placeholder={
                active
                  ? "Message your agents. Use @Owner, @all, or an agent name…"
                  : "This room is read-only until you make it active."
              }
              value={text}
              maxLength={6000}
              disabled={!active}
              onChange={(e) => draft(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  (enabled.chatSendMode && sendMode === "ctrl"
                    ? e.ctrlKey || e.metaKey
                    : !e.ctrlKey) &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={expandedComposer ? 9 : 2}
            />
            <div className="composer-footer">
              <div className="flex items-center gap-2">
                {enabled.pingInbox && (
                  <details className="relative">
                    <summary
                      className="icon-button"
                      aria-label="Mention an agent"
                    >
                      <AtSign size={17} />
                    </summary>
                    <div className="popover above">
                      <button onClick={() => ping("all")}>Everyone</button>
                      {team.participants.map((p) => (
                        <button key={p.agent} onClick={() => ping(p.agent)}>
                          {p.agent}
                        </button>
                      ))}
                    </div>
                  </details>
                )}
                {enabled.chatSendMode && (
                  <select
                    aria-label="Send shortcut"
                    className="send-mode-select"
                    value={sendMode}
                    onChange={(e) => setSendMode(e.target.value)}
                  >
                    <option value="enter">Enter to send</option>
                    <option value="ctrl">Ctrl/⌘ + Enter</option>
                  </select>
                )}
                {enabled.chatSounds && (
                  <button
                    className="sound-toggle"
                    onClick={() => {
                      if (!soundOn) {
                        soundContext.current ??= new AudioContext();
                        void soundContext.current.resume();
                      }
                      setSoundOn(!soundOn);
                    }}
                  >
                    {soundOn ? "Mute tones" : "Enable tones"}
                  </button>
                )}
                <span className="text-xs text-dim">
                  {text.length
                    ? `${text.length}/6000${enabled.chatWordCount ? ` · ${text.trim().split(/\s+/).filter(Boolean).length} words` : ""}`
                    : "Shift + Enter for a new line"}
                </span>
              </div>
              <button
                className="send-button"
                aria-label="Send message"
                disabled={busy || !active || !text.trim()}
                onClick={() => void send()}
              >
                <ArrowUp size={18} />
              </button>
            </div>
          </div>
          <p className="composer-hint">
            Your AIs check this room through Connectchy. Keep their clients
            running.
          </p>
        </div>
      </div>
      {showTeam && (
        <aside className="team-pane">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">The team</h3>
            <button
              className="icon-button"
              aria-label="Close team"
              onClick={() => setShowTeam(false)}
            >
              <X size={16} />
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            {team.phase === "active"
              ? "Roles agreed. Each agent owns its assigned paths."
              : team.phase === "done"
                ? "Everyone has completed their role."
                : "Plan first. Work unlocks when the expected team is ready."}
          </p>
          {enabled.rolePlanning && (
            <div className="team-planning">
              <label className="text-xs text-muted">
                Expected agents
                <input
                  className="workspace-input mt-2"
                  type="number"
                  min={1}
                  max={32}
                  value={expected ?? team.expected}
                  onChange={(e) => setExpected(Number(e.target.value))}
                />
              </label>
              <Button
                className="mt-2 w-full"
                size="sm"
                disabled={!active || busy}
                onClick={() => void configure()}
              >
                Update team size
              </Button>
              <p className="mt-2 text-[11px] text-dim">
                Preserves registered roles; everyone confirms ready again. Set 1
                for solo work.
              </p>
            </div>
          )}
          {team.participants.map((p) => (
            <div className="team-member" key={p.agent}>
              <div className="flex items-center gap-2">
                <AgentAvatar name={p.agent} size="sm" />
                <strong>{p.agent}</strong>
                <span
                  className={`tiny-badge ${p.done ? "" : p.ready ? "live" : ""}`}
                >
                  {p.control ? p.control.toUpperCase() : p.done ? "Done" : p.ready ? "Ready" : "Planning"}
                </span>
              </div>
              <p>{p.role}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {p.control==="removed" ? <Button size="sm" disabled={!active||busy} onClick={()=>void manageAgent(p.agent,"restore")}>Restore agent</Button> : <>
                  <Button size="sm" disabled={!active||busy} onClick={()=>void manageAgent(p.agent,p.control?"resume":"pause")}>{p.control?"Resume":"Pause role"}</Button>
                  <Button size="sm" disabled={!active||busy||p.control==="stopped"} onClick={()=>void manageAgent(p.agent,"stop")}>Stop agent</Button>
                  <Button size="sm" disabled={!active||busy} onClick={()=>void manageAgent(p.agent,"remove")}>Remove agent &amp; role</Button>
                </>}
              </div>
              {enabled.agentPresence && (
                <p className="text-[10px] text-dim">
                  {(() => {
                    const seen = presence.find(
                      (s) => s.agent.toLowerCase() === p.agent.toLowerCase(),
                    );
                    return seen
                      ? `Last checked ${new Date(seen.lastSeenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${seen.task ? ` · ${seen.task}` : ""}`
                      : "No room check recorded yet";
                  })()}
                </p>
              )}
              <div className="path-chips">
                {p.paths.map((path) => (
                  <span key={path}>{path}</span>
                ))}
              </div>
              {enabled.pingInbox && (
                <button
                  className="mt-2 text-xs text-signal"
                  onClick={() => ping(p.agent)}
                >
                  Ping {p.agent}
                </button>
              )}
            </div>
          ))}
          {!team.participants.length && (
            <div className="mt-8 text-center text-sm text-muted">
              <Users size={28} className="mx-auto mb-3 text-dim" />
              No agents have joined yet.
              <p className="mt-2 text-xs">
                Give each AI your connection prompt so it can register a role.
              </p>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
