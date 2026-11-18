"use client";
import { useCallback, useEffect, useState } from "react";
import { Bot, KeyRound, Link2, Plus, Sparkles, Trash2 } from "lucide-react";
import { postJson, requestJson } from "@/lib/workspace-client";
import type { DirectoryAgent } from "@/lib/studio-types";
import { Button, CopyButton, Notice } from "./ui";
import WorkspaceDialog from "./WorkspaceDialog";

type Proposal = {type:string;payload:Record<string,unknown>;agent:string;room:number;nonce:string};
type Registration = {name:string; room:string; role:string; state:string};
const blank = {
  name: "",
  provider: "",
  model: "",
  apiKey: "",
  instructions: "",
};
export default function AgentDirectory({ token }: { token: string }) {
  const url = "/api/agent/" + token + "/directory";
  const [agents, setAgents] = useState<DirectoryAgent[]>([]),
    [registrations,setRegistrations] = useState<Registration[]>([]),
    [mode, modeSet] = useState<"import" | "invite" | "update">("import"),
    [form, setForm] = useState(blank),
    [id, setId] = useState(0),
    [issued, issue] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const reload = useCallback(
    () =>
      requestJson<{ agents: DirectoryAgent[]; registrations:Registration[] }>(url).then(d => { setAgents(d.agents); setRegistrations(d.registrations); }),
    [url],
  );
  useEffect(() => {
    const refresh = () => void reload().catch((e) => setError(e.message));
    refresh(); const timer = window.setInterval(refresh,5000);
    return () => window.clearInterval(timer);
  }, [reload]);
  async function act(data: object) {
    setBusy(true);
    setError("");
    issue("");
    try {
      const r = await postJson<{ key?: string }>(url, data);
      if (r.key) issue(r.key);
      setForm(blank);
      setId(0);
      modeSet("import");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save agent.");
    } finally {
      setBusy(false);
    }
  }
  const field = (
    key: keyof typeof blank,
    label: string,
    placeholder: string,
    required = true,
  ) => (
    <label className="field-label">
      {label}
      <input
        className="workspace-input"
        type={key === "apiKey" ? "password" : "text"}
        autoComplete="off"
        required={required}
        placeholder={placeholder}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <section className="studio-directory">
      <header>
        <h2>Agent directory</h2>
        <p>
          Connect a model or give a link-connected agent an individual key for
          private chats.
        </p>
      </header>
      <section className="registered-roster"><h3>Room registrations</h3>
        {registrations.length ? registrations.map((p,i) => <article key={i}><Bot size={18}/><div><strong>{p.name}</strong><p>{p.role} · {p.room}</p></div><small>{p.state}</small></article>) : <p>No agents have joined a room yet.</p>}
      </section>
      <div className="studio-segment">
        <button
          className={mode !== "invite" ? "active" : ""}
          onClick={() => {
            modeSet("import");
            setForm(blank);
          }}
        >
          {" "}
          <Bot size={15} /> Import model
        </button>
        <button
          className={mode === "invite" ? "active" : ""}
          onClick={() => {
            modeSet("invite");
            setForm(blank);
          }}
        >
          <Link2 size={15} /> Link agent
        </button>
      </div>
      <form
        className="studio-form"
        onSubmit={(e) => {
          e.preventDefault();
          void act({ action: mode, id, ...form });
        }}
      >
        {mode === "update" ? (
          <h3>Edit {form.name}</h3>
        ) : (
          field("name", "Agent name", "e.g. Atlas")
        )}
        {mode !== "invite" && (
          <>
            {field(
              "provider",
              "Provider base URL",
              "https://provider.example/v1",
            )}
            {field(
              "model",
              "Custom model ID",
              "Provider’s exact model identifier",
            )}
            {field(
              "apiKey",
              "API key",
              mode === "update"
                ? "Leave blank to keep this key"
                : "Encrypted on this computer",
              mode !== "update",
            )}
            <label className="field-label">
              Agent instructions
              <textarea
                className="workspace-input"
                maxLength={4000}
                value={form.instructions}
                onChange={(e) =>
                  setForm({ ...form, instructions: e.target.value })
                }
              />
            </label>
            <p className="studio-hint">
              Supports the OpenAI-compatible Chat Completions API. Use a
              vision-capable model to discuss video frames.
            </p>
          </>
        )}
        <Button variant="primary" type="submit" disabled={busy}>
          <Plus size={15} />
          {mode === "invite"
            ? "Issue agent key"
            : mode === "update"
              ? "Save agent"
              : "Import agent"}
        </Button>
      </form>
      {error && <Notice tone="bad">{error}</Notice>}
      {issued && (
        <div className="studio-issued">
          <KeyRound size={15} />
          <strong>Individual agent key</strong>
          <p>
            Copy this key now. Send it with the project link to this agent only,
            in the X-Agent-Key header.
          </p>
          <input
            readOnly
            aria-label="Individual agent key"
            className="workspace-input"
            value={issued}
          />
          <CopyButton text={issued} label="Copy key" />
          <Button size="sm" onClick={() => issue("")}>
            Dismiss
          </Button>
        </div>
      )}
      {agents.length > 0 && <Button className="justify-self-end" size="sm" variant="danger" disabled={busy} onClick={() => {
        if (confirm("Remove every agent and revoke their individual keys?")) void act({ action: "removeAll" });
      }}>Remove all agents</Button>}
      {agents.map((a) => (
        <article className="studio-person" key={a.id}>
          <span className="studio-icon">
            <Bot size={17} />
          </span>
          <div>
            <strong>{a.name}</strong>
            <p>{a.model || "Link-connected agent"}</p>
          </div>
          {a.provider && (
            <Button
              size="sm"
              onClick={() => {
                modeSet("update");
                setId(a.id);
                setForm({
                  name: a.name,
                  provider: a.provider!,
                  model: a.model!,
                  instructions: a.instructions || "",
                  apiKey: "",
                });
              }}
            >
              Edit
            </Button>
          )}
          <button
            className="icon-button"
            aria-label={"Rotate key for " + a.name}
            disabled={busy}
            onClick={() => {
              if (confirm("Replace the individual key for " + a.name + "?"))
                void act({ action: "rotate", id: a.id });
            }}
          >
            <KeyRound size={15} />
          </button>
          <button
            className="icon-button"
            aria-label={"Remove " + a.name}
            disabled={busy}
            onClick={() => {
              if (confirm("Remove " + a.name + " and revoke its key?"))
                void act({ action: "remove", id: a.id });
            }}
          >
            <Trash2 size={15} />
          </button>
        </article>
      ))}
    </section>
  );
}
export function AskAgent({
  token,
  roomId,
  topicId,
  videoId,
  members,
  done,
  configure,
}: {
  token: string;
  roomId: number;
  topicId?: number;
  videoId?: number;
  members?: number[];
  done: () => void;
  configure?: () => void;
}) {
  const [open, setOpen] = useState(false),
    [agents, setAgents] = useState<DirectoryAgent[]>([]),
    [agent, setAgent] = useState(""),
    [prompt, setPrompt] = useState(""),
    [proposal,setProposal]=useState<Proposal|null>(null),
    [receipt,setReceipt]=useState(""),
    [clips,setClips] = useState<{id:number;name:string}[]>([]),
    [selectedClip,selectClip] = useState(0),
    [inspectEditor,setInspectEditor] = useState(false),
    [videoInput, setVideoInput] = useState("frames"),
    [make, setMake] = useState("message"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  async function show() {
    setProposal(null); setReceipt(""); setOpen(true);
    setError("");
    setLoading(true);
    try {
      const d = await requestJson<{ agents: DirectoryAgent[] }>(
        "/api/agent/" + token + "/directory",
      );
      selectClip(videoId || 0);
      setClips([]);
      if (!topicId && !videoId) {
        const library = await requestJson<{clips:{id:number;name:string}[]}>("/api/agent/"+token+"/videos?room="+roomId).catch(() => ({clips:[]}));
        setClips(library.clips);
      }
      const eligible = d.agents.filter(
        (a) => a.provider && (!members || members.includes(a.id)),
      );
      setAgents(eligible);
      setAgent(String(eligible[0]?.id || ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load agents.");
    } finally {
      setLoading(false);
    }
  }
  async function ask() {
    setBusy(true);
    setError("");
    try {
      if(proposal){
        const result=await postJson<{status?:string;id?:number;ok?:boolean;error?:string}>("/api/agent/"+token+"/command",{...proposal,wait:false});
        setReceipt(result.error || ("Command "+(result.id??"")+" · "+(result.status || "submitted")+". Track the result in Activity."));
        setProposal(null);done();return;
      }
      const response=await postJson<{proposal?:Proposal}>("/api/agent/" + token + "/respond?room=" + roomId, {
        agentId: Number(agent),
        prompt,
        topicId,
        videoId: selectedClip || undefined,
        inspectEditor,
        videoInput,
        make,
      });
      if(response.proposal){setProposal(response.proposal);return;}
      setPrompt("");
      setOpen(false);
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Agent request failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="studio-inline" onClick={() => void show()}>
        <Sparkles size={14} />
        {videoId ? "Ask about attachment" : "Ask an agent"}
      </button>
      {open && (
        <WorkspaceDialog label="Ask an agent" close={() => setOpen(false)}>
          <form
            className="studio-form p-6"
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
          >
            <h2>Ask an agent</h2>
            {loading ? (
              <p>Loading agents…</p>
            ) : !agents.length ? (
              <p>
                No imported models available here. Add a model in Settings →
                Agents{members ? " and include it when creating the chat" : ""}.
              </p>
            ) : (
              <>
                <label className="field-label">
                  Agent
                  <select
                    className="workspace-input"
                    value={agent}
                    onChange={(e) => setAgent(e.target.value)}
                  >
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {a.model}
                      </option>
                    ))}
                  </select>
                </label>
                {!topicId && !videoId && (
                  <label className="field-label">
                    Response
                    <select
                      className="workspace-input"
                      value={make}
                      onChange={(e) => setMake(e.target.value)}
                    >
                      <option value="message">Room reply</option>
                      <option value="command">Propose an editor command</option>
                      <option value="survey">Create survey</option>
                      <option value="question">Ask a question</option>
                      <option value="private">Start a private chat</option>
                    </select>
                  </label>
                )}
                {!topicId && !videoId && clips.length > 0 && <label className="field-label">Attach a room image or video<select className="workspace-input" value={selectedClip} onChange={e=>selectClip(Number(e.target.value))}><option value={0}>No clip</option>{clips.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
                <label><input type="checkbox" checked={inspectEditor} onChange={e=>setInspectEditor(e.target.checked)}/> Inspect the connected editor for this reply</label>
                {!!selectedClip && <label className="field-label">
                  Clip input
                  <select className="workspace-input" value={videoInput} onChange={e => setVideoInput(e.target.value)}>
                    <option value="frames">Sampled frames and caption · vision model</option>
                    <option value="caption">Caption and description · text model</option>
                  </select>
                </label>}
                <label className="field-label">
                  Instructions
                  <textarea
                    required
                    className="workspace-input"
                    maxLength={6000}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={
                      videoId
                        ? videoInput === "caption" ? "Describe what happens in the clip and ask your question." : "What changes across this clip?"
                        : "What would you like this agent to do?"
                    }
                  />
                </label>
                <p className="studio-hint">
                  {videoId && videoInput === "caption"
                    ? "The selected provider receives the caption, clip details, recent chat, and your instructions as text."
                    : videoId ? "The selected provider receives up to eight still frames, clip details, recent chat, and your instructions."
                    : "Sends recent conversation context to the selected provider."}
                  {make !== "message" && !topicId
                    ? " The result appears in the Collaboration tab."
                    : ""}
                </p>
              </>
            )}
            {proposal && <section><h3>Review editor command</h3><pre className="command-proposal">{JSON.stringify({type:proposal.type,payload:proposal.payload},null,2)}</pre><button type="button" onClick={()=>setProposal(null)}>Discard proposal</button></section>}
            {receipt && <Notice>{receipt}</Notice>}
            {error && <Notice tone="bad">{error}</Notice>}
            <div className="studio-actions">
              <Button disabled={busy} onClick={() => setOpen(false)}>
                Close
              </Button>
              {!agents.length && configure && (
                <Button
                  onClick={() => {
                    setOpen(false);
                    configure();
                  }}
                >
                  Open agents
                </Button>
              )}
              {!!agents.length && (
                <Button
                  variant="primary"
                  type="submit"
                  disabled={busy || !prompt.trim()}
                >
                  {busy ? "Working…" : proposal ? "Submit reviewed command" : "Send request"}
                </Button>
              )}
            </div>
          </form>
        </WorkspaceDialog>
      )}
    </>
  );
}
