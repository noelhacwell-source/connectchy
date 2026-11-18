"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  Download,
  Heart,
  LockKeyhole,
  MessageCircle,
  Pin,
  Plus,
  Search,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import type {
  DirectoryAgent,
  StudioBoard,
  StudioTopic,
  SurveyField,
  TopicKind,
} from "@/lib/studio-types";
import { downloadText, postJson, requestJson } from "@/lib/workspace-client";
import { Button, Notice } from "./ui";
import WorkspaceDialog from "./WorkspaceDialog";
import { AskAgent } from "./AgentDirectory";

const kinds = {
  survey: { label: "Surveys", one: "survey", icon: BarChart3 },
  question: { label: "Questions", one: "question", icon: MessageCircle },
  private: { label: "Private chats", one: "private chat", icon: LockKeyhole },
};
type Act = (data: Record<string, unknown>) => Promise<boolean>;
export default function Collaboration({
  token,
  roomId,
  roomName,
  configure,
}: {
  token: string;
  roomId: number;
  roomName: string;
  configure: () => void;
}) {
  const url = "/api/agent/" + token + "/studio?room=" + roomId;
  const [board, setBoard] = useState<StudioBoard | null>(null),
    [kind, setKind] = useState<TopicKind>("survey"),
    [current, setCurrent] = useState<number | null>(null),
    [create, setCreate] = useState(false),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("recent"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    setBoard(await requestJson<StudioBoard>(url));
  }, [url]);
  useEffect(() => {
    const poll = () => reload().catch((e) => setError(e.message));
    void poll();
    const t = setInterval(poll, 4500);
    return () => clearInterval(t);
  }, [reload]);
  const act: Act = async (data) => {
    setBusy(true);
    setError("");
    try {
      const r = await postJson<{ topic?: StudioTopic }>(url, data);
      await reload();
      if (data.action === "delete") setCurrent(null);
      if (r.topic) {
        setCurrent(r.topic.id);
        setKind(r.topic.kind);
      }
      setCreate(false);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const selected = board?.topics.find((t) => t.id === current),
    topics = (board?.topics || [])
      .filter(
        (t) =>
          t.kind === kind &&
          [
            t.title,
            t.author,
            t.content.description,
            ...t.content.tags,
            ...t.content.posts.map((p) => p.text),
          ]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (filter === "all" ||
            (filter === "open" && !t.content.closed) ||
            (filter === "closed" && t.content.closed) ||
            (filter === "pinned" && t.content.pinned) ||
            (filter === "following" && t.content.followers.includes(0)) ||
            (filter === "unanswered" &&
              t.kind === "question" &&
              !t.content.posts.length)),
      )
      .sort(
        (a, b) =>
          Number(b.content.pinned) - Number(a.content.pinned) ||
          (sort === "title"
            ? a.title.localeCompare(b.title)
            : sort === "active"
              ? b.content.posts.length - a.content.posts.length
              : b.updatedAt.localeCompare(a.updatedAt)),
      );
  return (
    <section className="studio-board">
      <header className="studio-board-head">
        <div>
          <span className="eyebrow">{roomName}</span>
          <h1>Collaboration</h1>
        </div>
        <Button
          variant="primary"
          disabled={!board || busy}
          onClick={() => setCreate(true)}
        >
          <Plus size={15} />
          New {kinds[kind].one}
        </Button>
      </header>
      <div className="studio-tabs">
        {(Object.keys(kinds) as TopicKind[]).map((k) => {
          const Icon = kinds[k].icon;
          return (
            <button
              className={k === kind ? "active" : ""}
              key={k}
              onClick={() => {
                setKind(k);
                setCurrent(null);
                setFilter("all");
              }}
            >
              <Icon size={17} />
              {kinds[k].label}
              <small>
                {board?.topics.filter((t) => t.kind === k).length ?? "–"}
              </small>
            </button>
          );
        })}
      </div>
      {error && !create && <Notice tone="bad">{error}</Notice>}
      {selected ? (
        <>
          <button className="studio-back" onClick={() => setCurrent(null)}>
            <ArrowLeft size={14} />
            All {kinds[kind].label.toLowerCase()}
          </button>
          <TopicDetail
            key={selected.id}
            topic={selected}
            agents={board!.agents}
            act={act}
            busy={busy}
            token={token}
            reload={reload}
          />
        </>
      ) : (
        <>
          {kind === "private" && (
            <p className="studio-privacy">
              <LockKeyhole size={14} />
              Visible to invited agents and the workspace owner. You can read
              and join every conversation.
            </p>
          )}
          <div className="studio-filters">
            <label className="search-field">
              <Search size={15} />
              <input
                aria-label="Search conversations"
                placeholder="Search conversations or tags…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="Filter conversations"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              {[
                "all",
                "open",
                "closed",
                "pinned",
                "following",
                ...(kind === "question" ? ["unanswered"] : []),
              ].map((v) => (
                <option key={v} value={v}>
                  {v === "all" ? "All statuses" : v}
                </option>
              ))}
            </select>
            <select
              aria-label="Sort conversations"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="recent">Recently updated</option>
              <option value="active">Most replies</option>
              <option value="title">Title A–Z</option>
            </select>
          </div>
          {!board ? (
            <p>Loading collaboration…</p>
          ) : !topics.length ? (
            <div className="studio-empty">
              <span className="studio-icon">
                {kind === "survey" ? (
                  <BarChart3 />
                ) : kind === "private" ? (
                  <LockKeyhole />
                ) : (
                  <MessageCircle />
                )}
              </span>
              <h2>
                {query || filter !== "all"
                  ? "No matching conversations"
                  : "No " + kinds[kind].label.toLowerCase() + " yet"}
              </h2>
              <p>
                {query || filter !== "all"
                  ? "Try another search or filter."
                  : kind === "survey"
                    ? "Ask your team to weigh in on a decision."
                    : kind === "question"
                      ? "Ask the team a question and mark the answer that resolves it."
                      : "Choose which agents can participate in a conversation."}
              </p>
            </div>
          ) : (
            <div className="studio-cards">
              {topics.map((t) => (
                <button
                  className="studio-topic-card"
                  key={t.id}
                  onClick={() => setCurrent(t.id)}
                >
                  <div className="studio-card-top">
                    <span
                      className={
                        "studio-status " + (t.content.closed ? "closed" : "")
                      }
                    >
                      {t.content.closed ? "Closed" : "Open"}
                    </span>
                    {t.content.pinned && <Pin size={13} />}
                  </div>
                  <h2>{t.title}</h2>
                  <p>{t.content.description || t.content.posts.at(-1)?.text}</p>
                  <footer>
                    <span>
                      {t.author} ·{" "}
                      {t.kind === "survey"
                        ? Object.keys(t.content.ballots).length + " ballots"
                        : t.content.posts.length + " replies"}
                    </span>
                    <ArrowUpRight size={15} />
                  </footer>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {create && board && (
        <TopicForm
          kind={kind}
          agents={board.agents}
          act={act}
          busy={busy}
          error={error}
          configure={configure}
          close={() => setCreate(false)}
        />
      )}
    </section>
  );
}
function TopicForm({
  kind,
  agents,
  act,
  busy,
  error,
  close,
  configure,
}: {
  kind: TopicKind;
  agents: DirectoryAgent[];
  act: Act;
  busy: boolean;
  error: string;
  close: () => void;
  configure: () => void;
}) {
  const [title, setTitle] = useState(""),
    [description, describe] = useState(""),
    [members, setMembers] = useState<number[]>([]),
    [fields, setFields] = useState([{ prompt: "", options: "" }]);
  return (
    <WorkspaceDialog label={"New " + kinds[kind].one} close={close}>
      <form
        className="studio-form p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void act({
            action: "create",
            kind,
            title,
            description,
            members,
            questions: fields.map((f) => ({
              ...f,
              options: f.options
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            })),
          });
        }}
      >
        <h2>New {kinds[kind].one}</h2>
        <label className="field-label">
          {kind === "question" ? "Question" : "Title"}
          <input
            autoFocus
            required
            maxLength={160}
            className="workspace-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field-label">
          Context <small>(optional)</small>
          <textarea
            maxLength={4000}
            className="workspace-input"
            value={description}
            onChange={(e) => describe(e.target.value)}
          />
        </label>
        {kind === "private" && (
          <fieldset>
            <legend>Participants</legend>
            <p className="studio-hint">The owner can always read and reply.</p>
            {agents.map((a) => (
              <label className="studio-check" key={a.id}>
                <input
                  type="checkbox"
                  checked={members.includes(a.id)}
                  onChange={(e) =>
                    setMembers(
                      e.target.checked
                        ? [...members, a.id]
                        : members.filter((n) => n !== a.id),
                    )
                  }
                />
                {a.name}
              </label>
            ))}
            {!agents.length && (
              <Button
                onClick={() => {
                  close();
                  configure();
                }}
              >
                Add agents
              </Button>
            )}
          </fieldset>
        )}
        {kind === "survey" && (
          <>
            {fields.map((f, i) => (
              <fieldset className="studio-fieldset" key={i}>
                <legend>Question {i + 1}</legend>
                <input
                  aria-label={"Survey question " + (i + 1)}
                  className="workspace-input"
                  required
                  maxLength={500}
                  placeholder="What should the team decide?"
                  value={f.prompt}
                  onChange={(e) =>
                    setFields(
                      fields.map((v, j) =>
                        i === j ? { ...v, prompt: e.target.value } : v,
                      ),
                    )
                  }
                />
                <textarea
                  aria-label={"Choices for question " + (i + 1)}
                  className="workspace-input"
                  required
                  placeholder="One answer choice per line"
                  value={f.options}
                  onChange={(e) =>
                    setFields(
                      fields.map((v, j) =>
                        i === j ? { ...v, options: e.target.value } : v,
                      ),
                    )
                  }
                />
                {fields.length > 1 && (
                  <button
                    type="button"
                    className="studio-inline"
                    onClick={() => setFields(fields.filter((_, j) => j !== i))}
                  >
                    Remove question
                  </button>
                )}
              </fieldset>
            ))}
            <Button
              disabled={fields.length >= 12}
              onClick={() =>
                setFields([...fields, { prompt: "", options: "" }])
              }
            >
              <Plus size={14} />
              Add question
            </Button>
          </>
        )}
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="studio-actions">
          <Button onClick={close}>Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || (kind === "private" && !members.length)}
          >
            Create {kinds[kind].one}
          </Button>
        </div>
      </form>
    </WorkspaceDialog>
  );
}
function TopicDetail({
  topic: t,
  agents,
  act,
  busy,
  token,
  reload,
}: {
  topic: StudioTopic;
  agents: DirectoryAgent[];
  act: Act;
  busy: boolean;
  token: string;
  reload: () => void;
}) {
  const c = t.content,
    [text, setText] = useState(""),
    [choices, setChoices] = useState<number[]>(c.ballots[0] ?? []),
    [editing, setEditing] = useState(""),
    [editText, setEditText] = useState("");
  const send = (action: string, data: Record<string, unknown> = {}) =>
    act({ id: t.id, action, ...data });
  const button = (
    label: string,
    action: string,
    data: Record<string, unknown>,
  ) => (
    <Button size="sm" disabled={busy} onClick={() => void send(action, data)}>
      {label}
    </Button>
  );
  const download = () =>
    downloadText(
      t.title + ".json",
      JSON.stringify(t, null, 2),
      "application/json",
    );
  return (
    <article className="studio-detail">
      <div className="studio-card-top">
        <span className={"studio-status " + (c.closed ? "closed" : "")}>
          {c.closed ? "Closed" : "Open"}
        </span>
        <span>{t.author}</span>
        {c.pinned && <Pin size={14} />}
      </div>
      <h2>{t.title}</h2>
      {c.description && <p className="studio-description">{c.description}</p>}
      {c.tags.length > 0 && (
        <div className="studio-tags">
          {c.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      )}
      {t.kind === "private" && (
        <p className="studio-privacy">
          <Users size={14} />
          Owner ·{" "}
          {t.members
            .map(
              (id) => agents.find((a) => a.id === id)?.name || "Removed agent",
            )
            .join(" · ")}
        </p>
      )}
      <div className="studio-actions">
        <button
          className="studio-inline"
          disabled={busy}
          onClick={() =>
            void send("follow", { value: !c.followers.includes(0) })
          }
        >
          <Star size={14} />
          {c.followers.includes(0) ? "Unfollow" : "Follow"}
        </button>
        {!c.closed && (
          <AskAgent
            token={token}
            roomId={t.roomId}
            topicId={t.id}
            members={t.kind === "private" ? t.members : undefined}
            done={reload}
          />
        )}
        <details className="studio-more">
          <summary>
            Manage <ChevronRight size={13} />
          </summary>
          <div className="studio-actions">
            {button(c.pinned ? "Unpin" : "Pin", "pin", { value: !c.pinned })}
            {button(c.closed ? "Reopen" : "Close", "close", {
              value: !c.closed,
            })}
            {(["rename", "describe", "tags"] as const).map((k) => (
              <Button
                key={k}
                size="sm"
                onClick={() => {
                  setEditing(k);
                  setEditText(
                    k === "rename"
                      ? t.title
                      : k === "describe"
                        ? c.description
                        : c.tags.join(", "),
                  );
                }}
              >
                {k === "rename"
                  ? "Rename"
                  : k === "describe"
                    ? "Edit context"
                    : "Edit tags"}
              </Button>
            ))}
            {t.kind !== "private" && button("Duplicate", "duplicate", {})}
            <Button size="sm" onClick={download}>
              <Download size={13} />
              Export JSON
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                if (
                  confirm(
                    "Permanently delete this conversation and its replies?",
                  )
                )
                  void send("delete");
              }}
            >
              <Trash2 size={13} />
              Delete
            </Button>
          </div>
        </details>
      </div>
      {editing && (
        <form
          className="studio-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await send(
                editing,
                editing === "rename"
                  ? { title: editText }
                  : editing === "describe"
                    ? { description: editText }
                    : editing === "tags"
                      ? {
                          tags: editText
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        }
                      : { postId: editing, text: editText },
              )
            )
              setEditing("");
          }}
        >
          <label className="field-label">
            {editing === "tags"
              ? "Tags, separated by commas"
              : editing === "rename"
                ? "Title"
                : "Context"}
            <textarea
              autoFocus
              className="workspace-input"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
            />
          </label>
          <div className="studio-actions">
            <Button type="submit" disabled={busy}>
              Save
            </Button>
            <Button onClick={() => setEditing("")}>Cancel</Button>
          </div>
        </form>
      )}
      {t.kind === "survey" && (
        <form
          className="studio-ballot"
          onSubmit={(e) => {
            e.preventDefault();
            void send("vote", { choices });
          }}
        >
          {c.questions.map((q: SurveyField, i) => (
            <fieldset key={i}>
              <legend>{q.prompt}</legend>
              {q.options.map((o, j) => {
                const votes = Object.values(c.ballots).filter(
                  (v) => v[i] === j,
                ).length;
                return (
                  <label className="studio-option" key={j}>
                    <input
                      type="radio"
                      required
                      name={"question-" + i}
                      disabled={c.closed}
                      checked={choices[i] === j}
                      onChange={() =>
                        setChoices((old) => {
                          const next = [...old];
                          next[i] = j;
                          return next;
                        })
                      }
                    />
                    <span>{o}</span>
                    <small>
                      {votes} {votes === 1 ? "vote" : "votes"}
                    </small>
                  </label>
                );
              })}
            </fieldset>
          ))}
          <div className="studio-actions">
            {!c.closed && (
              <Button type="submit" variant="primary" disabled={busy}>
                {c.ballots[0] ? "Update ballot" : "Submit ballot"}
              </Button>
            )}
            {c.ballots[0] && !c.closed && (
              <Button
                size="sm"
                disabled={busy}
                onClick={async () => {
                  if (await send("withdraw")) setChoices([]);
                }}
              >
                Withdraw vote
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                const rows = [
                  ["Question", "Option", "Votes"],
                  ...c.questions.flatMap((q, i) =>
                    q.options.map((o, j) => [
                      q.prompt,
                      o,
                      String(
                        Object.values(c.ballots).filter((v) => v[i] === j)
                          .length,
                      ),
                    ]),
                  ),
                ];
                downloadText(
                  "survey-results.csv",
                  rows
                    .map((r) =>
                      r
                        .map(
                          (v) =>
                            '"' +
                            (/^[=+@-]/.test(v) ? "'" : "") +
                            v.replaceAll('"', '""') +
                            '"',
                        )
                        .join(","),
                    )
                    .join("\n"),
                  "text/csv",
                );
              }}
            >
              Export results
            </Button>
          </div>
        </form>
      )}
      <div className="studio-discussion">
        <h3>
          {t.kind === "question"
            ? "Answers"
            : t.kind === "private"
              ? "Messages"
              : "Discussion"}{" "}
          <small>{c.posts.length}</small>
        </h3>
        {c.posts.map((p) => (
          <div
            key={p.id}
            className={"studio-post " + (c.accepted === p.id ? "accepted" : "")}
          >
            <header>
              <strong>{p.author}</strong>
              <time>{new Date(p.time).toLocaleString()}</time>
              {c.accepted === p.id && (
                <span>
                  <Check size={12} />
                  Accepted answer
                </span>
              )}
            </header>
            <p>{p.text}</p>
            <div className="studio-actions">
              <button
                className="studio-inline"
                onClick={() =>
                  void send("like", {
                    postId: p.id,
                    value: !p.likes.includes(0),
                  })
                }
              >
                <Heart size={13} />
                {p.likes.length}
              </button>
              {t.kind === "question" &&
                button(
                  c.accepted === p.id ? "Unmark answer" : "Accept answer",
                  "accept",
                  { postId: p.id, value: c.accepted !== p.id },
                )}
              {!c.closed && (
                <button
                  className="studio-inline"
                  onClick={() => {
                    const next = window.prompt("Edit message", p.text);
                    if (next?.trim())
                      void send("editPost", { postId: p.id, text: next });
                  }}
                >
                  Edit
                </button>
              )}
              <button
                className="studio-inline"
                onClick={() => {
                  if (confirm("Delete this post?"))
                    void send("removePost", { postId: p.id });
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {!c.closed && (
          <form
            className="studio-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await send("post", { text })) setText("");
            }}
          >
            <textarea
              aria-label="Reply"
              className="workspace-input"
              maxLength={6000}
              placeholder={
                t.kind === "question" ? "Write an answer…" : "Write a reply…"
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Button
              variant="primary"
              type="submit"
              disabled={busy || !text.trim()}
            >
              Post {t.kind === "question" ? "answer" : "reply"}
            </Button>
          </form>
        )}
      </div>
    </article>
  );
}
