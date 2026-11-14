"use client";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  AtSign,
  BookOpen,
  Check,
  CheckSquare,
  ClipboardList,
  Code2,
  Copy,
  CornerUpRight,
  Flag,
  History,
  Layers,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Quote,
  SlidersHorizontal,
  Smile,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { ModuleSettings } from "@/lib/modules";
import type { ChatMeta, ChatFilters } from "@/lib/chat-types";
import { EMPTY_FILTERS } from "@/lib/chat-types";
import type { ChatMessage } from "./AgentChat";
import { postJson, requestJson } from "@/lib/workspace-client";
import { Button, Notice } from "./ui";
import WorkspaceDialog from "./WorkspaceDialog";
export function ChatMessageExtras({
  token,
  roomId,
  message,
  enabled,
  reload,
  quote,
  thread,
}: {
  token: string;
  roomId: number;
  message: ChatMessage;
  enabled: ModuleSettings;
  reload: () => Promise<void>;
  quote: (text: string) => void;
  thread: (id: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [labels, setLabels] = useState(""),
    [items, setItems] = useState(""),
    [attachment, setAttachment] = useState("");
  const meta = (message.meta ?? {}) as ChatMeta;
  const call = async (body: object) => {
    setBusy(true);
    setError("");
    try {
      const d = await postJson<{ item?: { id: number } }>(
        `/api/agent/${token}/chat-actions?room=${roomId}`,
        { agent: "Owner", id: message.id, ...body },
      );
      await reload();
      if (d.item) setNotice(`Saved item #${d.item.id}.`);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Message tool failed.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const receipts = message.readBy ?? [];
  return (
    <>
      <div className="chat-message-badges">
        {enabled.chatUrgency && meta.urgent && (
          <span className="urgent-badge">Urgent</span>
        )}
        {enabled.chatFollowups && meta.followup && (
          <span className="followup-badge">Needs a response</span>
        )}
        {enabled.chatTags &&
          meta.labels?.map((tag) => (
            <span className="label-badge" key={tag}>
              #{tag}
            </span>
          ))}
        {enabled.chatStars && meta.stars?.includes("Owner") && (
          <Star size={12} className="text-signal" />
        )}
      </div>
      {enabled.chatReactions && (
        <div className="reaction-row">
          {Object.entries(meta.reactions ?? {})
            .filter(([, people]) => people.length)
            .map(([emoji, people]) => (
              <button
                className={people.includes("Owner") ? "selected" : ""}
                key={emoji}
                title={people.join(", ")}
                disabled={busy}
                onClick={() => void call({ action: "react", emoji })}
              >
                {emoji} {people.length}
              </button>
            ))}
          <details className="relative">
            <summary title="React to message">
              <Smile size={13} />
            </summary>
            <div className="reaction-picker">
              {["👍", "❤️", "🎉", "👀", "✅", "❓"].map((emoji) => (
                <button
                  disabled={busy}
                  key={emoji}
                  onClick={() => void call({ action: "react", emoji })}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </details>
        </div>
      )}
      {enabled.chatPolls && meta.poll && (
        <div className="chat-poll">
          <p>{meta.poll.question}</p>
          {meta.poll.options.map((option, i) => {
            const votes = Object.values(meta.poll!.votes).filter(
                (v) => v === i,
              ).length,
              total = Object.keys(meta.poll!.votes).length;
            return (
              <button
                key={i}
                disabled={busy || meta.poll!.closed}
                className={meta.poll!.votes.Owner === i ? "selected" : ""}
                onClick={() => void call({ action: "vote", option: i })}
              >
                <span
                  className="poll-fill"
                  style={{ width: `${total ? (votes / total) * 100 : 0}%` }}
                />
                <span>{option}</span>
                <strong>{votes}</strong>
              </button>
            );
          })}
          <small>
            {Object.keys(meta.poll.votes).length} named vote(s) ·{" "}
            {meta.poll.closed ? "Closed" : "Open"}
          </small>
          {!meta.poll.closed && (
            <button
              className="text-xs text-dim"
              disabled={busy}
              onClick={() => void call({ action: "closePoll" })}
            >
              Close poll
            </button>
          )}
        </div>
      )}
      {enabled.chatChecklists && meta.checklist && (
        <div className="message-checklist">
          {meta.checklist.map((item) => (
            <label key={item.id}>
              <input
                type="checkbox"
                checked={item.done}
                disabled={busy}
                onChange={() => void call({ action: "check", item: item.id })}
              />
              <span className={item.done ? "complete" : ""}>{item.text}</span>
            </label>
          ))}
          <small>
            {meta.checklist.filter((i) => i.done).length}/
            {meta.checklist.length} complete
          </small>
        </div>
      )}
      {enabled.chatAttachments && meta.attachments?.length ? (
        <div className="message-assets">
          {meta.attachments.map((a) => (
            <button
              key={a.assetId}
              title={`Copy rbxassetid://${a.assetId}`}
              onClick={() =>
                navigator.clipboard
                  .writeText(`rbxassetid://${a.assetId}`)
                  .catch(() => setError("Clipboard unavailable."))
              }
            >
              <Layers size={14} />
              <span>
                {a.name || a.assetId}
                <small>
                  {a.type} · {a.assetId}
                </small>
              </span>
              <Copy size={12} />
            </button>
          ))}
        </div>
      ) : null}
      {enabled.chatReceipts && receipts.length > 0 && (
        <p className="read-receipts">
          Read acknowledged by {receipts.join(", ")}
        </p>
      )}
      <div className="message-extended-actions">
        {enabled.chatQuotes && (
          <button
            onClick={() =>
              quote(
                `> ${message.agent}: ${message.text.replaceAll("\n", "\n> ")}\n\n`,
              )
            }
          >
            <Quote size={12} />
            Quote
          </button>
        )}
        {enabled.chatThreads && (
          <button onClick={() => thread(String(message.replyTo ?? message.id))}>
            <MessageSquare size={12} />
            Thread
          </button>
        )}
        <button
          onClick={() => {
            setLabels((meta.labels ?? []).join(", "));
            setOpen(true);
          }}
        >
          <MoreHorizontal size={13} />
          Tools
        </button>
      </div>
      {error && !open && <p className="text-xs text-bad">{error}</p>}
      {open && (
        <WorkspaceDialog close={() => setOpen(false)} label="Message tools">
          <div className="p-6">
            <p className="eyebrow">MESSAGE #{message.id}</p>
            <h2 className="mt-2 text-xl font-semibold">
              Keep the useful context.
            </h2>
            <p className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-xs text-muted">
              {message.text}
            </p>
            {error && <Notice tone="bad">{error}</Notice>}
            {notice && <Notice tone="ok">{notice}</Notice>}
            <div className="chat-tool-grid mt-5">
              {enabled.chatStars && (
                <button
                  disabled={busy}
                  onClick={() => void call({ action: "star" })}
                >
                  <Star size={16} />
                  {meta.stars?.includes("Owner")
                    ? "Remove your star"
                    : "Star this message"}
                </button>
              )}
              {enabled.chatUrgency && (
                <button
                  disabled={busy}
                  onClick={() => void call({ action: "urgent" })}
                >
                  <Flag size={16} />
                  {meta.urgent ? "Remove urgency" : "Mark urgent"}
                </button>
              )}
              {enabled.chatFollowups && (
                <button
                  disabled={busy}
                  onClick={() => void call({ action: "followup" })}
                >
                  <AtSign size={16} />
                  {meta.followup ? "Resolve follow-up" : "Needs follow-up"}
                </button>
              )}
              {enabled.chatToTask && enabled.taskBoard && (
                <button
                  disabled={busy}
                  onClick={() => void call({ action: "toTask" })}
                >
                  <ClipboardList size={16} />
                  Create task
                </button>
              )}
              {enabled.chatToNote && enabled.notes && (
                <button
                  disabled={busy}
                  onClick={() => void call({ action: "toNote" })}
                >
                  <BookOpen size={16} />
                  Save as note
                </button>
              )}
              {enabled.chatToDecision && enabled.decisions && (
                <button
                  disabled={busy}
                  onClick={() => void call({ action: "toDecision" })}
                >
                  <Check size={16} />
                  Save decision
                </button>
              )}
              {enabled.chatSavedReplies && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void call({
                      action: "saveReply",
                      title: message.text.slice(0, 80),
                      text: message.text,
                    })
                  }
                >
                  <MessageSquare size={16} />
                  Save reusable reply
                </button>
              )}
              {enabled.chatSnippets && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void call({
                      action: "saveSnippet",
                      title: `Snippet from ${message.agent}`,
                      text: message.text,
                    })
                  }
                >
                  <Code2 size={16} />
                  Save snippet
                </button>
              )}
            </div>
            {enabled.chatTags && (
              <div className="mt-4">
                <label className="field-label">
                  Topic labels, comma separated
                  <input
                    className="workspace-input"
                    value={labels}
                    onChange={(e) => setLabels(e.target.value)}
                  />
                </label>
                <Button
                  className="mt-2"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void call({
                      action: "labels",
                      labels: labels
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                >
                  Save labels
                </Button>
              </div>
            )}
            {enabled.chatChecklists && (
              <div className="mt-4">
                <label className="field-label">
                  Create or replace a checklist, one item per line
                  <textarea
                    className="workspace-input"
                    rows={3}
                    value={items}
                    onChange={(e) => setItems(e.target.value)}
                  />
                </label>
                <Button
                  className="mt-2"
                  size="sm"
                  disabled={busy || !items.trim()}
                  onClick={() =>
                    void call({
                      action: "checklist",
                      items: items
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                >
                  Save checklist
                </Button>
              </div>
            )}
            {enabled.chatAttachments && (
              <div className="mt-4">
                <label className="field-label">
                  Attach an existing Roblox asset · ID | name |
                  Image/Model/Audio
                  <input
                    className="workspace-input"
                    value={attachment}
                    onChange={(e) => setAttachment(e.target.value)}
                    placeholder="123456 | Delivery chime | Audio"
                  />
                </label>
                <Button
                  className="mt-2"
                  size="sm"
                  disabled={busy || !attachment.trim()}
                  onClick={() => {
                    const [assetId, name, type] = attachment
                      .split("|")
                      .map((s) => s.trim());
                    void call({
                      action: "attach",
                      attachments: [
                        ...(meta.attachments ?? []),
                        {
                          assetId,
                          name: name || assetId,
                          type: type || "Model",
                        },
                      ],
                    });
                  }}
                >
                  Attach asset
                </Button>
              </div>
            )}
            {enabled.chatForwarding && (
              <div className="mt-4">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      const d = await requestJson<{ activeRoomId: number }>(
                        `/api/agent/${token}/rooms`,
                      );
                      if (
                        await call({
                          action: "forward",
                          targetRoom: d.activeRoomId,
                        })
                      )
                        setNotice("Forwarded to the active room.");
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Forward failed.",
                      );
                    }
                  }}
                >
                  <CornerUpRight size={13} />
                  Forward to active room
                </Button>
                <p className="mt-1 text-xs text-dim">
                  Use this on an older room’s message to carry it into the
                  current room.
                </p>
              </div>
            )}
            {enabled.chatEditHistory && (
              <details className="mt-4">
                <summary className="text-sm text-muted">
                  Edit history ({meta.history?.length ?? 0})
                </summary>
                {meta.history?.map((h, i) => (
                  <div
                    className="mt-2 rounded border border-line p-2 text-xs"
                    key={i}
                  >
                    <time className="text-dim">
                      {new Date(h.at).toLocaleString()}
                    </time>
                    <p className="mt-1 whitespace-pre-wrap">{h.text}</p>
                  </div>
                ))}
                {!meta.history?.length && (
                  <p className="mt-2 text-xs text-dim">No previous versions.</p>
                )}
              </details>
            )}
          </div>
        </WorkspaceDialog>
      )}
    </>
  );
}
export function ChatToolbox({
  token,
  roomId,
  enabled,
  filters,
  setFilters,
  insert,
  reload,
  lastId,
}: {
  token: string;
  roomId: number;
  enabled: ModuleSettings;
  filters: ChatFilters;
  setFilters: (f: ChatFilters) => void;
  insert: (text: string) => void;
  reload: () => Promise<void>;
  lastId: number;
}) {
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState("filters"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [question, setQuestion] = useState(""),
    [options, setOptions] = useState(""),
    [title, setTitle] = useState(""),
    [text, setText] = useState(""),
    [kind, setKind] = useState("reply"),
    [library, setLibrary] = useState<
      { id: number; kind: string; title: string; body: string }[]
    >([]),
    [trash, setTrash] = useState<ChatMessage[]>([]),
    [saved, setSaved] = useState<{ name: string; filters: ChatFilters }[]>([]);
  const api = `/api/agent/${token}/chat-actions?room=${roomId}`,
    storage = `studio-link:searches:${token}:${roomId}`,
    templateKind = kind === "reply" && !enabled.chatSavedReplies ? "snippet" : kind === "snippet" && !enabled.chatSnippets ? "reply" : kind;
  useEffect(() => {
    if (!open) return;
    let live = true;
    void requestJson<{ items: typeof library }>(api + "&kind=library")
      .then((d) => {
        if (live) setLibrary(d.items);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    if (enabled.chatTrash)
      void requestJson<{ messages: ChatMessage[] }>(api + "&kind=trash")
        .then((d) => {
          if (live) setTrash(d.messages);
        })
        .catch(() => {});
    if (enabled.chatSavedSearches) {
      try {
        const value = JSON.parse(localStorage.getItem(storage) ?? "[]");
        if (Array.isArray(value))
          queueMicrotask(() => {
            if (live) setSaved(value);
          });
      } catch {}
    }
    return () => {
      live = false;
    };
  }, [api, open, enabled.chatTrash, enabled.chatSavedSearches, storage]);
  const call = async (body: object) => {
    setBusy(true);
    setError("");
    try {
      await postJson(api, { agent: "Owner", ...body });
      await reload();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat action failed.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const set = (key: keyof ChatFilters, value: string | boolean) =>
    setFilters({ ...filters, [key]: value });
  return (
    <>
      <button
        className="icon-button"
        aria-label="Chat tools and filters"
        title="Chat tools and filters"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal size={17} />
      </button>
      {open && (
        <WorkspaceDialog wide close={() => setOpen(false)} label="Chat tools">
          <div className="p-6">
            <p className="eyebrow">CHAT TOOLKIT</p>
            <h2 className="mt-2 text-2xl font-semibold">
              Less noise. More useful conversation.
            </h2>
            <div className="chat-tool-tabs">
              {[
                ["filters", "Filters"],
                ["library", "Replies & snippets"],
                ["poll", "Polls"],
                ["trash", "Message recovery"],
              ]
                .filter(
                  ([key]) =>
                    key === "filters" ||
                    (key === "library" &&
                      (enabled.chatSavedReplies || enabled.chatSnippets)) ||
                    (key === "poll" && enabled.chatPolls) ||
                    (key === "trash" && enabled.chatTrash),
                )
                .map(([key, label]) => (
                  <button
                    key={key}
                    className={tab === key ? "active" : ""}
                    onClick={() => setTab(key)}
                  >
                    {label}
                  </button>
                ))}
            </div>
            {error && <Notice tone="bad">{error}</Notice>}
            {tab === "filters" && (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  {enabled.chatKindFilter && (
                    <label className="field-label">
                      Message type
                      <select
                        className="workspace-input"
                        value={filters.kind}
                        onChange={(e) => set("kind", e.target.value)}
                      >
                        {[
                          "",
                          "message",
                          "plan",
                          "progress",
                          "question",
                          "decision",
                          "done",
                        ].map((k) => (
                          <option value={k} key={k}>
                            {k || "All types"}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {enabled.chatTags && (
                    <label className="field-label">
                      Topic label
                      <input
                        className="workspace-input"
                        value={filters.tag}
                        onChange={(e) => set("tag", e.target.value)}
                      />
                    </label>
                  )}
                  {enabled.chatDateFilter && (
                    <>
                      <label className="field-label">
                        From date
                        <input
                          type="date"
                          className="workspace-input"
                          value={filters.since}
                          onChange={(e) => set("since", e.target.value)}
                        />
                      </label>
                      <label className="field-label">
                        Through date
                        <input
                          type="date"
                          className="workspace-input"
                          value={filters.until}
                          onChange={(e) => set("until", e.target.value)}
                        />
                      </label>
                    </>
                  )}
                  {enabled.chatJump && (
                    <label className="field-label">
                      Exact message ID
                      <input
                        inputMode="numeric"
                        className="workspace-input"
                        value={filters.id}
                        onChange={(e) => set("id", e.target.value)}
                      />
                    </label>
                  )}
                  {enabled.chatThreads && (
                    <label className="field-label">
                      Reply thread root ID
                      <input
                        inputMode="numeric"
                        className="workspace-input"
                        value={filters.thread}
                        onChange={(e) => set("thread", e.target.value)}
                      />
                    </label>
                  )}
                </div>
                <div className="my-5 flex flex-wrap gap-4">
                  {(
                    [
                      ["starred", "chatStars", "Your starred messages"],
                      ["urgent", "chatUrgency", "Urgent only"],
                      ["followup", "chatFollowups", "Needs follow-up"],
                    ] as const
                  )
                    .filter(([, feature]) => enabled[feature])
                    .map(([key, , label]) => (
                      <label
                        className="flex items-center gap-2 text-sm text-muted"
                        key={key}
                      >
                        <input
                          type="checkbox"
                          checked={filters[key]}
                          onChange={(e) => set(key, e.target.checked)}
                        />
                        {label}
                      </label>
                    ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => setFilters({ ...EMPTY_FILTERS })}
                  >
                    Reset filters
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setOpen(false)}
                  >
                    Show conversation
                  </Button>
                  {enabled.chatReceipts && (
                    <Button
                      size="sm"
                      disabled={busy || !lastId}
                      onClick={() =>
                        void call({ action: "seen", through: lastId })
                      }
                    >
                      Acknowledge reading through #{lastId}
                    </Button>
                  )}
                </div>
                {enabled.chatSavedSearches && (
                  <div className="mt-6">
                    <label className="field-label">
                      Save this filter view
                      <input
                        className="workspace-input"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        maxLength={80}
                        placeholder="e.g. Open UI questions"
                      />
                    </label>
                    <Button
                      className="mt-2"
                      size="sm"
                      disabled={!title.trim()}
                      onClick={() => {
                        const next = [
                          ...saved.filter((s) => s.name !== title),
                          { name: title, filters },
                        ].slice(-20);
                        localStorage.setItem(storage, JSON.stringify(next));
                        setSaved(next);
                        setTitle("");
                      }}
                    >
                      Save view in this browser
                    </Button>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {saved.map((s) => (
                        <div className="saved-view" key={s.name}>
                          <button
                            onClick={() => {
                              setFilters(s.filters);
                              setOpen(false);
                            }}
                          >
                            {s.name}
                          </button>
                          <button
                            aria-label={`Remove ${s.name} view`}
                            onClick={() => {
                              const next = saved.filter(
                                (x) => x.name !== s.name,
                              );
                              localStorage.setItem(
                                storage,
                                JSON.stringify(next),
                              );
                              setSaved(next);
                            }}
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {tab === "library" && (
              <>
                <div className="template-grid">
                  {library.map((item) => (
                    <article key={item.id}>
                      <span className="eyebrow">{item.kind}</span>
                      <h3>{item.title}</h3>
                      <pre>{item.body}</pre>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            insert(
                              item.kind === "snippet"
                                ? `\n\x60\x60\x60lua\n${item.body}\n\x60\x60\x60\n`
                                : item.body,
                            );
                            setOpen(false);
                          }}
                        >
                          Insert in draft
                        </Button>
                        <button
                          className="icon-button"
                          aria-label={`Delete ${item.title}`}
                          disabled={busy}
                          onClick={async () => {
                            if (
                              await call({
                                action: "deleteTemplate",
                                id: item.id,
                              })
                            )
                              setLibrary((p) =>
                                p.filter((x) => x.id !== item.id),
                              );
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <label className="field-label">
                    Template type
                    <select
                      className="workspace-input"
                      value={templateKind}
                      onChange={(e) => setKind(e.target.value)}
                    >
                      {enabled.chatSavedReplies && (
                        <option value="reply">Saved reply</option>
                      )}
                      {enabled.chatSnippets && (
                        <option value="snippet">Code snippet</option>
                      )}
                    </select>
                  </label>
                  <label className="field-label">
                    Name
                    <input
                      className="workspace-input"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </label>
                </div>
                <label className="field-label mt-3">
                  Reusable content
                  <textarea
                    className="workspace-input"
                    rows={5}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                </label>
                <Button
                  className="mt-3"
                  disabled={busy || !title.trim() || !text.trim()}
                  onClick={async () => {
                    if (
                      await call({
                        action:
                          templateKind === "snippet" ? "saveSnippet" : "saveReply",
                        title,
                        text,
                      })
                    ) {
                      const d = await requestJson<{ items: typeof library }>(
                        api + "&kind=library",
                      );
                      setLibrary(d.items);
                      setTitle("");
                      setText("");
                    }
                  }}
                >
                  Save template
                </Button>
              </>
            )}
            {tab === "poll" && (
              <>
                <label className="field-label">
                  Question
                  <input
                    className="workspace-input"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    maxLength={500}
                  />
                </label>
                <label className="field-label mt-4">
                  Options, one per line
                  <textarea
                    className="workspace-input"
                    rows={5}
                    value={options}
                    onChange={(e) => setOptions(e.target.value)}
                    placeholder={"Cozy garden\nNeon city\nMountain village"}
                  />
                </label>
                <p className="my-3 text-xs text-dim">
                  Votes use self-reported participant names, like the rest of
                  the room.
                </p>
                <Button
                  disabled={
                    busy ||
                    !question.trim() ||
                    options.split("\n").filter((s) => s.trim()).length < 2
                  }
                  variant="primary"
                  onClick={async () => {
                    if (
                      await call({
                        action: "poll",
                        question,
                        options: options
                          .split("\n")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    ) {
                      setQuestion("");
                      setOptions("");
                      setOpen(false);
                    }
                  }}
                >
                  Publish poll
                </Button>
              </>
            )}
            {tab === "trash" && (
              <div className="space-y-3">
                {!trash.length && (
                  <p className="text-sm text-muted">
                    No hidden messages in this room.
                  </p>
                )}
                {trash.map((message) => (
                  <article className="trash-message" key={message.id}>
                    <strong>
                      {message.agent} · #{message.id}
                    </strong>
                    <p>{message.text}</p>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={async () => {
                        if (await call({ action: "restore", id: message.id }))
                          setTrash((p) => p.filter((m) => m.id !== message.id));
                      }}
                    >
                      Restore message
                    </Button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </WorkspaceDialog>
      )}
    </>
  );
}
export function CopyableCode({ children }: { children?: React.ReactNode }) {
  const [value, setValue] = useState(false);
  const text = String(children ?? "");
  return (
    <span className="copyable-code">
      <button
        title="Copy code block"
        onClick={() =>
          navigator.clipboard
            .writeText(text)
            .then(() => {
              setValue(true);
              setTimeout(() => setValue(false), 1200);
            })
            .catch(() => {})
        }
      >
        {value ? <Check size={12} /> : <Copy size={12} />}
      </button>
      <code>{children}</code>
    </span>
  );
}
