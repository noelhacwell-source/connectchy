"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button, inputClass, Notice } from "./ui";
import { DEFAULT_TEAM, type TeamPlan } from "@/lib/team-types";
type Message = { id: number; agent: string; kind: string; text: string; paths: string[]; mentions: string[]; createdAt: string };
function RoomConversation({ token, roomId, active, manager }: { token: string; roomId: number; active: boolean; manager: ReactNode }) {
  const [open, setOpen] = useState(true), [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState(""), [error, setError] = useState(""), [sending, setSending] = useState(false);
  const [pings,setPings] = useState<Message[]>([]),[team,setTeam] = useState<TeamPlan>(DEFAULT_TEAM),[expected,setExpected] = useState<number|null>(null),[recipient,setRecipient] = useState("");
  const [hasOlder,setHasOlder] = useState(false);
  const cursor = useRef(0), list = useRef<HTMLDivElement>(null);
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent/${token}/room?room=${roomId}&agent=Owner&after=${cursor.current}`, { cache: "no-store" });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      const atBottom = !list.current || list.current.scrollHeight - list.current.scrollTop - list.current.clientHeight < 60;
      setMessages(previous => [...new Map([...previous, ...data.messages].map(m => [m.id, m])).values()].sort((a,b) => a.id-b.id));
      if(cursor.current===0)setHasOlder(data.hasOlder);
      cursor.current = data.nextCursor; setError("");
      setPings(data.attention?.unacknowledgedPings ?? []);setTeam(data.team ?? DEFAULT_TEAM);
      if (atBottom) requestAnimationFrame(() => list.current?.scrollTo({ top: list.current.scrollHeight }));
    } catch (e) { setError(e instanceof Error ? e.message : "Room could not be loaded."); }
  }, [token,roomId]);
  useEffect(() => { void poll(); const timer = setInterval(() => { void poll(); }, 2500); return () => clearInterval(timer); }, [poll]);
  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/agent/${token}/room?room=${roomId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agent: "Owner", text, kind: "message", mentions:recipient?[recipient]:[] }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      setText(""); await poll();
    } catch (e) { setError(e instanceof Error ? e.message : "Message failed."); }
    finally { setSending(false); }
  };
  const roomAction = async (endpoint:string,body:object) => {
    setSending(true);setError("");
    try{const r=await fetch(`/api/agent/${token}/room${endpoint}?room=${roomId}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error);await poll();}catch(e){setError(e instanceof Error?e.message:"Room action failed.");}finally{setSending(false);}
  };
  const pinged = new Set(pings.map(p=>p.id));
  return <aside className="fixed right-3 bottom-3 z-40 w-[min(420px,calc(100vw-24px))] overflow-hidden rounded-lg border border-line bg-panel shadow-2xl" aria-label="AI communication room">
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-text">
      <span><span className="mr-2 text-ok">●</span>Room · {pings.length ? `${pings.length} ping${pings.length===1?"":"s"} for you` : team.phase}</span><span>{open ? "Minimize" : "Open"}</span>
    </button>
    {open && <div className="max-h-[80vh] overflow-y-auto border-t border-line p-3">
      {manager}
      {!active&&<div className="mb-3"><Notice>Viewing an older room. Make it active to post messages or change roles.</Notice></div>}
      <p className="mb-2 text-xs text-dim">Ping @Owner, an AI name or @all. Agents must poll; pings cannot wake a stopped AI. Names are self-reported.</p>
      <details className="mb-3 rounded border border-line p-2" open={team.phase==="planning"}>
        <summary className="cursor-pointer text-sm text-text">Roles · {team.phase} · {team.participants.filter(p=>p.control!=="removed" && p.ready).length}/{team.expected} ready</summary>
        <p className="mt-2 text-xs text-muted">Agents must agree roles and distinct paths before edits unlock. Set the team size before sending the AI prompt. Changing it starts a new round and clears the roster.</p>
        <div className="mt-2 flex items-end gap-2"><label className="min-w-0 flex-1 text-xs text-muted">Expected AIs<input type="number" min={1} max={12} className={inputClass} value={expected??team.expected} onChange={e=>setExpected(Number(e.target.value))} /></label><Button size="sm" disabled={sending||!active} onClick={()=>void roomAction("/team",{action:"configure",expected:expected??team.expected})}>Start planning round</Button></div>
        <ul className="mt-2 space-y-2 text-xs">{team.participants.filter(p => p.control !== "removed").map(p=><li key={p.agent} className="rounded bg-ink p-2"><button className="font-semibold text-signal" type="button" onClick={()=>{setRecipient(p.agent);setText(t=>t||`@${p.agent} `);}}>@{p.agent}</button> · {p.done?"done":p.ready?"ready":"planning"}<p className="mt-1 text-text">{p.role}</p><p className="break-words text-dim">{p.paths.join(", ")}</p></li>)}</ul>
        {!team.participants.some(p => p.control !== "removed")&&<p className="mt-2 text-xs text-muted">Waiting for AIs to register roles. An empty room does not unlock edits.</p>}
      </details>
      {pings.length>0&&<div className="mb-3 rounded border border-signal bg-signal/10 p-2"><p className="text-sm font-semibold text-signal">You were pinged</p><div className="max-h-32 overflow-y-auto">{pings.map(p=><p key={p.id} className="mt-1 whitespace-pre-wrap break-words text-xs text-text"><strong>{p.agent}:</strong> {p.text}</p>)}</div><Button className="mt-2" size="sm" disabled={sending} onClick={()=>void roomAction("",{action:"ack",agent:"Owner",through:pings.at(-1)!.id})}>Mark these pings as read</Button></div>}
      {hasOlder&&<Button className="mb-2" size="sm" disabled={sending} onClick={async()=>{setSending(true);try{const r=await fetch(`/api/agent/${token}/room?room=${roomId}&agent=Owner&before=${messages[0]?.id??0}`);const d=await r.json();if(!r.ok)throw new Error(d.error);setMessages(previous=>[...new Map([...d.messages,...previous].map(m=>[m.id,m])).values()].sort((a,b)=>a.id-b.id));setHasOlder(d.hasOlder);}catch(e){setError(e instanceof Error?e.message:"Could not load history.");}finally{setSending(false);}}}>Load older messages</Button>}
      <div ref={list} role="log" aria-label="Room messages" className="h-64 max-h-[40vh] space-y-3 overflow-y-auto rounded border border-line bg-ink p-3">
        {!messages.length && <p className="text-sm text-muted">No messages yet. AIs must register roles and wait for the whole team before editing.</p>}
        {messages.map(m => <article key={m.id} className={`rounded p-2 text-sm ${pinged.has(m.id)?"border border-signal bg-signal/10":""}`}><div className="flex flex-wrap gap-2 text-xs"><strong className="text-signal">{m.agent}</strong><span className="text-dim">{m.kind} · {new Date(m.createdAt).toLocaleTimeString()}</span>{m.agent!=="Owner"&&m.agent!=="Coordinator"&&<button className="text-signal underline" type="button" onClick={()=>{setRecipient(m.agent);setText(t=>t||`@${m.agent} `);}}>Ping back</button>}</div><p className="mt-1 whitespace-pre-wrap break-words text-text">{m.text}</p>{m.mentions?.length>0&&<p className="mt-1 text-xs text-signal">{m.mentions.map(n=>`@${n}`).join(" ")}</p>}{m.paths.length > 0 && <p className="mt-1 break-words font-mono text-xs text-dim">{m.paths.join(", ")}</p>}</article>)}
      </div>
      {error && <div className="mt-2"><Notice tone="bad">{error}</Notice></div>}
      <label className="mt-2 block text-xs text-muted">Ping recipient<select aria-label="Ping recipient" className={inputClass} value={recipient} onChange={e=>setRecipient(e.target.value)}><option value="">No ping</option><option value="all">Everyone</option>{team.participants.filter(p => p.control !== "removed").map(p=><option key={p.agent} value={p.agent}>{p.agent}</option>)}{recipient&&!team.participants.some(p=>p.agent===recipient)&&recipient!=="all"&&<option value={recipient}>{recipient}</option>}</select></label>
      <form className="mt-3 flex gap-2" onSubmit={e => { e.preventDefault(); void send(); }}><input aria-label="Message to AIs" className={inputClass} placeholder="Message or @ping the team…" maxLength={6000} value={text} onChange={e => setText(e.target.value)} /><Button type="submit" disabled={sending || !active || !text.trim()}>Send</Button></form>
    </div>}
  </aside>;
}

type ProjectRoom = { id:number; name:string; createdAt:string };
export default function RoomPanel({token}:{token:string}) {
  const [rooms,setRooms]=useState<ProjectRoom[]>([]),[activeId,setActiveId]=useState<number|null>(null),[selectedId,setSelectedId]=useState<number|null>(null);
  const [mode,setMode]=useState<"create"|"rename"|"delete"|null>(null),[name,setName]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const load=useCallback(async()=>{const r=await fetch(`/api/agent/${token}/rooms`,{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error);setRooms(d.rooms);setActiveId(d.activeRoomId);return d;},[token]);
  useEffect(()=>{let live=true;const update=()=>{if(live)void load().catch(e=>{if(live)setError(e.message);});};update();const timer=setInterval(update,4000);return()=>{live=false;clearInterval(timer);};},[load]);
  const selected=rooms.find(r=>r.id===selectedId)??rooms.find(r=>r.id===activeId);
  const change=async(action:"create"|"rename"|"delete"|"activate")=>{
    setBusy(true);setError("");
    try{const r=await fetch(`/api/agent/${token}/rooms`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,id:selected?.id,name})});const d=await r.json();if(!r.ok)throw new Error(d.error);await load();if(action==="create")setSelectedId(d.room.id);else if(action==="delete")setSelectedId(d.activeRoomId);setMode(null);setName("");}
    catch(e){setError(e instanceof Error?e.message:"Room action failed.");}finally{setBusy(false);}
  };
  const manager=<div className="mb-3 space-y-2 rounded border border-line p-2">
    <label className="block text-xs text-muted">Project rooms<select aria-label="Project room" className={inputClass} value={selected?.id??""} onChange={e=>{setSelectedId(Number(e.target.value));setMode(null);setError("");}}>{rooms.map(r=><option value={r.id} key={r.id}>{r.name}{r.id===activeId?" · Active":" · Older room"}</option>)}</select></label>
    <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={()=>{setMode("create");setName("");}}>New room</Button><Button size="sm" disabled={busy||!selected} onClick={()=>{setMode("rename");setName(selected?.name??"");}}>Rename</Button><Button size="sm" variant="danger" disabled={busy||!selected||rooms.length<2} onClick={()=>setMode("delete")}>Delete</Button></div>
    {selected&&<p className="text-xs text-dim">Created {new Date(selected.createdAt).toLocaleString()}</p>}
    {selected&&selected.id!==activeId&&<Button size="sm" disabled={busy} onClick={()=>void change("activate")}>Use this room for AI work</Button>}
    {(mode==="create"||mode==="rename")&&<form className="flex gap-2" onSubmit={e=>{e.preventDefault();void change(mode);}}><input aria-label="Room name" className={inputClass} value={name} maxLength={80} placeholder="Room name" onChange={e=>setName(e.target.value)} autoFocus/><Button type="submit" size="sm" disabled={busy||!name.trim()}>{mode==="create"?"Create":"Save"}</Button><Button size="sm" disabled={busy} onClick={()=>setMode(null)}>Cancel</Button></form>}
    {mode==="delete"&&<div><p className="mb-2 text-sm text-muted">Delete “{selected?.name}” from this project&apos;s room list? The other rooms stay available.</p><div className="flex gap-2"><Button size="sm" variant="danger" disabled={busy} onClick={()=>void change("delete")}>Delete room</Button><Button size="sm" disabled={busy} onClick={()=>setMode(null)}>Cancel</Button></div></div>}
    {error&&<Notice tone="bad">{error}</Notice>}
  </div>;
  if(!selected)return <aside className="fixed right-3 bottom-3 z-40 w-[min(420px,calc(100vw-24px))] rounded-lg border border-line bg-panel p-3">{error?<Notice tone="bad">{error}</Notice>:<p className="text-sm text-muted">Loading project rooms…</p>}</aside>;
  return <RoomConversation key={`${token}:${selected.id}`} token={token} roomId={selected.id} active={selected.id===activeId} manager={manager}/>;
}
