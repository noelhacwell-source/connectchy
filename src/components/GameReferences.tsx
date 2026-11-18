"use client";
import DeleteRecord from "./DeleteRecord";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  Compass,
  ExternalLink,
  Gamepad2,
  Layers,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  requestJson,
  postJson,
  type WorkspaceEntry,
} from "@/lib/workspace-client";
import { Button, Notice } from "./ui";
import WorkspaceDialog from "./WorkspaceDialog";
type Reference = WorkspaceEntry & {
  data: {
    url: string;
    placeId: string;
    enabled: boolean;
    focus: string[];
    goal: string;
    metadata: {
      name?: string;
      description?: string;
      creator?: string;
      visits?: number;
      playing?: number;
      genre?: string;
      maxPlayers?: number;
      thumbnail?: string;
    };
    warning?: string;
    research?: {
      agent: string;
      summary: string;
      adapt: string;
      avoid: string;
      sources: { url: string; title: string; finding: string }[];
    };
  };
};
const FOCUS = [
  ["art", "Visual style"],
  ["gameplay", "Gameplay"],
  ["ui", "Interface"],
  ["audio", "Sound & music"],
  ["progression", "Progression"],
  ["world", "World design"],
] as const;
export default function GameReferences({ token }: { token: string }) {
  const [refs, setRefs] = useState<Reference[]>([]),
    [links, setLinks] = useState(""),
    [goal, setGoal] = useState(""),
    [focus, setFocus] = useState<string[]>(["gameplay", "art"]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [compare, setCompare] = useState(false),
    [selected, setSelected] = useState<Reference | null>(null),
    [summary, setSummary] = useState(""),
    [adapt, setAdapt] = useState(""),
    [avoid, setAvoid] = useState(""),
    [sources, setSources] = useState(""),
    [search, setSearch] = useState("");
  const endpoint = `/api/agent/${token}/references`,
    load = useCallback(async () => {
      const d = await requestJson<{ references: Reference[] }>(endpoint);
      setRefs(d.references);
    }, [endpoint]);
  useEffect(() => {
    let live = true;
    const poll = () =>
      load().catch((e) => {
        if (live) setError(e.message);
      });
    void poll();
    const t = setInterval(poll, 6000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [load]);
  const action = async (body: object) => {
    setBusy(true);
    setError("");
    try {
      await postJson(endpoint, body);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reference action failed.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const add = async () => {
    const urls = [
      ...new Set(
        links
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
    if (urls.length > 10) {
      setError("Add up to ten links at a time.");
      return;
    }
    setBusy(true);
    setError("");
    let added = 0;
    const failures = [];
    for (const url of urls) {
      try {
        await postJson(endpoint, { action: "add", url, goal, focus });
        added++;
      } catch (e) {
        failures.push(
          `${url}: ${e instanceof Error ? e.message : "Could not add"}`,
        );
      }
    }
    await load().catch(() => {});
    setBusy(false);
    if (added) {
      setNotice(
        `${added} reference${added === 1 ? "" : "s"} added. Connected agents are asked to research and cite their findings.`,
      );
      if (!failures.length) setLinks("");
    }
    if (failures.length) setError(failures.join("\n"));
  };
  const filtered = refs.filter((r) =>
    `${r.title} ${r.data.goal}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="tool-page reference-page">
      <div className="reference-hero">
        <div className="reference-orbit">
          <Gamepad2 size={30} />
          <span />
          <span />
        </div>
        <p className="eyebrow">INSPIRATION, WITH INTENTION</p>
        <h1>
          Great games are a starting point.
          <br />
          <em>Make the next idea yours.</em>
        </h1>
        <p>
          Collect Roblox references, choose what matters, and give your AI team
          a shared, cited design brief.
        </p>
        <div className="reference-stats">
          <span>
            <strong>{refs.length}</strong> games collected
          </span>
          <span>
            <strong>
              {refs.filter((r) => r.status === "researched").length}
            </strong>{" "}
            researched briefs
          </span>
          <span>
            <strong>{refs.filter((r) => r.data.enabled).length}</strong> active
            references
          </span>
        </div>
      </div>
      {error && (
        <div className="mb-4">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
      {notice && (
        <div className="mb-4">
          <Notice tone="ok">{notice}</Notice>
        </div>
      )}
      <div className="reference-add">
        <div>
          <h2>
            <Plus size={17} />
            Add reference games
          </h2>
          <p>
            Paste one Roblox game link per line. Public details are fetched
            automatically; connected AIs do the deeper research with their own
            browsing tools.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="field-label">
            Roblox links
            <textarea
              className="workspace-input"
              rows={4}
              value={links}
              onChange={(e) => setLinks(e.target.value)}
              placeholder={
                "https://www.roblox.com/games/…\nhttps://www.roblox.com/games/…"
              }
            />
          </label>
          <label className="field-label">
            What should your team learn from these games?
            <textarea
              className="workspace-input"
              rows={4}
              value={goal}
              maxLength={3000}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="The cozy visual style, a clear first-time tutorial, satisfying delivery feedback…"
            />
          </label>
        </div>
        <div className="focus-chips">
          {FOCUS.map(([key, label]) => (
            <button
              className={focus.includes(key) ? "selected" : ""}
              key={key}
              onClick={() =>
                setFocus(
                  focus.includes(key)
                    ? focus.filter((f) => f !== key)
                    : [...focus, key],
                )
              }
            >
              {focus.includes(key) && <Check size={12} />} {label}
            </button>
          ))}
        </div>
        <Button
          variant="primary"
          disabled={busy || !links.trim()}
          onClick={() => void add()}
        >
          {busy ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Sparkles size={15} />
          )}{" "}
          {busy ? "Fetching public game details…" : "Add to reference library"}
        </Button>
        <p className="mt-3 text-xs text-dim">
          This does not access private game code or automatically play a game.
          Agents must separate observed facts from suggestions and use original
          assets.
        </p>
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <label className="search-field max-w-md">
          <Search size={15} />
          <input
            aria-label="Search references"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a reference…"
          />
        </label>
        <button
          className={`secondary-pill ${compare ? "active" : ""}`}
          onClick={() => setCompare(!compare)}
        >
          <Layers size={14} />
          {compare ? "Show cards" : "Compare references"}
        </button>
      </div>
      {compare ? (
        <div className="reference-comparison">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Focus</th>
                <th>Design goal</th>
                <th>Research</th>
                <th>Adaptation</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <a href={r.data.url} target="_blank" rel="noreferrer">
                      {r.title}
                    </a>
                  </td>
                  <td>{r.data.focus.join(", ")}</td>
                  <td>{r.data.goal || "—"}</td>
                  <td>{r.status}</td>
                  <td>
                    {r.data.research?.adapt ?? "Waiting for a cited brief"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="reference-grid">
          {filtered.map((r) => (
            <article
              className={`reference-card ${r.data.enabled ? "" : "reference-disabled"}`}
              key={r.id}
            >
              <div className="reference-cover">
                {r.data.metadata.thumbnail ? (
                  <Image
                    unoptimized
                    width={512}
                    height={512}
                    src={r.data.metadata.thumbnail}
                    alt={`${r.title} game icon`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <Gamepad2 size={48} />
                )}
                <span
                  className={`tiny-badge ${r.status === "researched" ? "live" : ""}`}
                >
                  {r.status === "researched"
                    ? "Brief ready"
                    : "Research requested"}
                </span>
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3>{r.title}</h3>
                    <p className="mt-1 text-xs text-dim">
                      {r.data.metadata.creator ?? `Place ${r.data.placeId}`}
                    </p>
                  </div>
                  <input
                    role="switch"
                    type="checkbox"
                    aria-label={`Use ${r.title} as reference`}
                    checked={r.data.enabled}
                    disabled={busy}
                    onChange={(e) =>
                      void action({
                        action: "toggle",
                        id: r.id,
                        enabled: e.target.checked,
                      })
                    }
                  />
                </div>
                <div className="reference-metrics">
                  <span>
                    {r.data.metadata.visits?.toLocaleString() ?? "—"} visits
                  </span>
                  <span>
                    {r.data.metadata.playing?.toLocaleString() ?? "—"} playing
                  </span>
                </div>
                <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-muted">
                  {r.data.metadata.description ??
                    "Public details were unavailable. The game link and your research request are saved."}
                </p>
                {r.data.warning && (
                  <p className="mt-2 text-xs text-bad">
                    Metadata unavailable: {r.data.warning}
                  </p>
                )}
                <div className="focus-chips small">
                  {r.data.focus.map((f) => (
                    <span key={f}>
                      {FOCUS.find((x) => x[0] === f)?.[1] ?? f}
                    </span>
                  ))}
                </div>
                {r.data.goal && <p className="reference-goal">{r.data.goal}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelected(r);
                      setSummary(r.data.research?.summary ?? "");
                      setAdapt(r.data.research?.adapt ?? "");
                      setAvoid(r.data.research?.avoid ?? "");
                      setSources(
                        r.data.research?.sources
                          .map((s) => `${s.url} | ${s.title} | ${s.finding}`)
                          .join("\n") ??
                          `${r.data.url} | ${r.title} | Describe what this source supports`,
                      );
                    }}
                  >
                    <BookOpen size={13} />
                    {r.status === "researched"
                      ? "Read brief"
                      : "Add research brief"}
                  </Button>
                  <a
                    className="secondary-pill"
                    href={r.data.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ArrowUpRight size={13} />
                    Game page
                  </a>
                  <DeleteRecord token={token} kind="reference" id={r.id} title={r.title} done={load}/>
                  <button
                    aria-label={`Archive ${r.title}`}
                    className="icon-button"
                    disabled={busy}
                    onClick={() => void action({ action: "delete", id: r.id })}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {!refs.length && (
        <div className="collection-empty">
          <Compass size={36} />
          <h3>Your reference shelf starts here.</h3>
          <p>
            Add several games to blend ideas across visual style, systems,
            interface and audio.
          </p>
        </div>
      )}
      {selected && (
        <WorkspaceDialog
          wide
          label="Game research brief"
          close={() => setSelected(null)}
        >
          <div className="p-7">
            <p className="eyebrow">RESEARCH BRIEF</p>
            <h2 className="mt-2 text-2xl font-semibold">{selected.title}</h2>
            <p className="mt-2 text-sm text-muted">
              Use cited public evidence. Note uncertainty; a description is not
              proof of gameplay behaviour.
            </p>
            <label className="field-label mt-5">
              Research summary
              <textarea
                className="workspace-input"
                rows={6}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
            </label>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="field-label">
                What to adapt into an original design
                <textarea
                  className="workspace-input"
                  rows={5}
                  value={adapt}
                  onChange={(e) => setAdapt(e.target.value)}
                />
              </label>
              <label className="field-label">
                What to avoid / what is uncertain
                <textarea
                  className="workspace-input"
                  rows={5}
                  value={avoid}
                  onChange={(e) => setAvoid(e.target.value)}
                />
              </label>
            </div>
            <label className="field-label mt-4">
              Sources · URL | title | supported finding, one per line
              <textarea
                className="workspace-input"
                rows={4}
                value={sources}
                onChange={(e) => setSources(e.target.value)}
              />
            </label>
            {error && <Notice tone="bad">{error}</Notice>}
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => setSelected(null)}>Close</Button>
              <Button
                variant="primary"
                disabled={busy || summary.trim().length < 30 || !adapt.trim()}
                onClick={async () => {
                  const cited = sources
                    .split("\n")
                    .filter((s) => s.trim())
                    .map((line) => {
                      const [url, title, ...finding] = line
                        .split("|")
                        .map((s) => s.trim());
                      return {
                        url,
                        title: title || url,
                        finding: finding.join("|"),
                      };
                    });
                  if (
                    await action({
                      action: "research",
                      id: selected.id,
                      agent: "Owner",
                      summary,
                      adapt,
                      avoid,
                      sources: cited,
                    })
                  )
                    setSelected(null);
                }}
              >
                Save cited brief
              </Button>
            </div>
          </div>
        </WorkspaceDialog>
      )}
    </section>
  );
}
