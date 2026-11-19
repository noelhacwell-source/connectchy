"use client";
import { useEffect,useState } from "react";
import { Download,History } from "lucide-react";
import WorkspaceDialog from "./WorkspaceDialog";

type Release={title:string;changes:string[]};
type Status={phase:string;installed:string;available:string|null;summary?:string;message:string;notes:Release[]};
export default function AppUpdates(){
  const [state,setState]=useState<Status|null>(null),[open,setOpen]=useState(false),[requested,setRequested]=useState(false),[error,setError]=useState("");
  useEffect(()=>{
    let stopped=false,timer:ReturnType<typeof setTimeout>,firstRevision:string|undefined;
    async function poll(){
      let interval=10000;
      try{
        const response=await fetch("/api/app-updates",{cache:"no-store"});
        if(response.status===403)return;
        if(!response.ok)throw Error();
        const data:Status=await response.json();
        if(stopped)return;
        if(firstRevision!==undefined && firstRevision!==data.installed){location.reload();return;}
        firstRevision=data.installed;
        setState(data);
        if(data.phase==="installing" || data.phase==="checking" || requested)interval=1200;
        if(data.phase==="error")setRequested(false);
        if(data.phase==="idle" && !data.available && data.installed){
          try{const last=localStorage.getItem("connectchy:release-seen");
            if(last && last!==data.installed)setOpen(true);
            localStorage.setItem("connectchy:release-seen",data.installed);
          }catch{}
        }
      }catch{interval=2000}
      if(!stopped)timer=setTimeout(poll,interval);
    }
    void poll();return()=>{stopped=true;clearTimeout(timer)};
  },[requested]);
  async function update(){
    setRequested(true);setError("");
    try{
      const r=await fetch("/api/app-updates",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sha:state?.available})});
      if(!r.ok)throw Error((await r.json()).error || "Could not request update.");
    }catch(e){setRequested(false);setError(e instanceof Error?e.message:"Could not request update.")}
  }
  if(!state)return null;
  const working=state.phase==="installing" || requested;
  return <><button type="button" className={"release-launch"+(state.available?" available":"")} onClick={()=>setOpen(true)}>
    {state.available?<Download size={15}/>:<History size={15}/>}
    {working?"Updating…":state.available?"Update available":"Changelog"}
  </button>{open&&<WorkspaceDialog label="Updates and changelog" close={()=>setOpen(false)}><section className="release-panel">
    <h2>Updates and changelog</h2>
    {state.available && <div className="release-offer"><strong>{state.summary || "Update available"}</strong><button type="button" disabled={working} onClick={update}>{working?"Update in progress":"Update and restart"}</button></div>}
    <p role="status">{error || state.message || (state.available?"Ready to install.":"You're up to date.")}</p>
    {state.notes.map((n,i)=><article key={i}><h3>{n.title}</h3><ul>{n.changes.map(c=><li key={c}>{c}</li>)}</ul></article>)}
  </section></WorkspaceDialog>}</>
}
