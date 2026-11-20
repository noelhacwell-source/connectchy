"use client";
import {useState} from "react";
import {VSCODE_COMMANDS} from "@/lib/vscode";
import {clientId} from "@/lib/client-id";
import {downloadExtension} from "./DownloadCounter";
import {postJson,requestJson} from "@/lib/workspace-client";
import {Button,CopyButton,Notice,Panel,StatusPill,JsonView,inputClass} from "./ui";
import type {Status} from "@/lib/client";

export function CodeSetup({token,status}:{token:string;status:Status}) {
  const [extBusy,setExtBusy]=useState(false),[extError,setExtError]=useState("");
  const link=`${window.location.origin}/c/${token}`;
  const agentLink=`${status.tunnelReady && status.origin ? status.origin : window.location.origin}/api/agent/${token}`;
  const prompt=`Open ${agentLink} and read it fully. You are connected to my VS Code project through Connectchy. Read /rooms and /room/team. Register a stable AI name, role and exact relative file paths, agree non-overlapping work, and wait for every expected AI to be ready. Pin the active room ID and your agent name on commands. Read and acknowledge pings before edits. Use only code_* editor commands. Read files before editing and include their current expectedSha256. Check code_get_workspace for the current Agent Mode setting. Automated edits follow the editor's current setting. Terminal commands require approval in VS Code. Poll pending commands; do not submit duplicates. Check /control between steps. Mark your role done when finished and report what changed and what tests passed.\n\nTask: [describe the coding task here]`;
  return <div className="grid gap-5"><Panel title="Connect your VS Code project" action={<StatusPill online={status.online} label={status.online?`VS Code connected · ${status.placeName??"Project"}`:"VS Code disconnected"}/> }>
    <ol className="ml-5 list-decimal space-y-3 text-sm text-muted"><li><button type="button" className="text-signal underline" disabled={extBusy} onClick={async()=>{setExtBusy(true);setExtError("");try{await downloadExtension(token);}catch(e){setExtError(e instanceof Error?e.message:"The extension could not be downloaded.");}finally{setExtBusy(false);}}}>{extBusy?"Downloading the Connectchy VS Code extension…":"Download the Connectchy VS Code extension"}</button>{extError&&<span role="alert" className="ml-2 text-xs"> {extError}</span>}.</li><li>In VS Code, open Extensions → … → Install from VSIX and select the downloaded file.</li><li>Open your project folder. Select the Connectchy icon in the sidebar, then Connect project.</li><li>Paste this workspace&apos;s link below. Review the connection details and connect.</li></ol>
    <div className="mt-4"><input aria-label="VS Code workspace link" readOnly value={link} className={inputClass}/><div className="mt-2"><CopyButton text={link} label="Copy link"/></div></div>
    <p className="mt-3 text-xs text-muted">The extension uses the port in your local workspace link. Your connection key is stored in VS Code&apos;s secret storage. In the Connectchy sidebar in VS Code, select Enable Agent Mode to apply text edits without per-edit prompts. Turn it off from that sidebar at any time. Terminal commands require approval.</p>
  </Panel><Panel title="Invite your AI team"><p className="mb-3 text-sm text-muted">Set Expected agents under Team and roles. Give each AI the same message. They share this conversation, tasks and notes.</p><CopyButton text={prompt} label="Copy message"/><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-muted">{prompt}</pre></Panel></div>;
}
type Result={id?:number;status:string;ok:boolean;result?:unknown;error?:string};
export default function CodeWorkspace({token,online}:{token:string;online:boolean}) {
  const [type,setType]=useState("code_get_workspace"),[payload,setPayload]=useState("{}"),[busy,setBusy]=useState(false),[result,setResult]=useState<Result|null>(null),[error,setError]=useState("");
  const doc=VSCODE_COMMANDS.find(c=>c.type===type)!;
  const run=async()=>{
    if(busy)return;setBusy(true);setError("");setResult(null);
    try {const parsed=JSON.parse(payload);if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error('Payload must be a JSON object.');let value=await postJson<Result>(`/api/agent/${token}/command`,{type,payload:parsed,source:"dashboard",nonce:clientId(),wait:false});const deadline=Date.now()+240000;
      while(["pending","sent","review"].includes(value.status)){if(Date.now()>deadline)throw new Error(`Command ${value.id} is still pending. Check Activity before retrying.`);await new Promise(resolve=>setTimeout(resolve,1000));value=await requestJson<Result>(`/api/agent/${token}/commands?id=${value.id}`);}
      setResult(value);if(!value.ok)setError(value.error??"Command failed.");
    }catch(e){setError(e instanceof Error?e.message:"Command failed.");}finally{setBusy(false);}
  };
  return <div className="grid gap-5"><Panel title="VS Code project tools"><p className="mb-4 text-sm text-muted">Browse and search the connected project, read editor diagnostics, propose file changes, or request tests. Check the connected editor’s Agent Mode status using Get workspace. Terminal commands require approval in VS Code.</p><label className="text-sm">Action<select value={type} disabled={busy} className={inputClass} onChange={e=>{setType(e.target.value);setPayload(JSON.stringify(VSCODE_COMMANDS.find(c=>c.type===e.target.value)!.example,null,2));}}>{VSCODE_COMMANDS.map(c=><option value={c.type} key={c.type}>{c.type.replace("code_","").replaceAll("_"," ")}</option>)}</select></label><p className="my-3 text-sm text-muted">{doc.summary}</p><label className="text-sm">Details (JSON)<textarea aria-label="VS Code command details" value={payload} disabled={busy} className={`${inputClass} min-h-40 font-mono`} onChange={e=>setPayload(e.target.value)}/></label><div className="mt-4"><Button variant="primary" disabled={!online||busy} onClick={()=>void run()}>{busy?"Waiting for VS Code…":"Send to VS Code"}</Button></div>{!online&&<p className="mt-3 text-sm text-muted">Open Connection setup to install and connect the extension.</p>}</Panel>{error&&<Notice tone="bad">{error}</Notice>}{result?.ok&&<Panel title="Result" action={<Button size="sm" onClick={()=>setResult(null)}>Clear output</Button>}><JsonView value={result.result}/></Panel>}</div>;
}
