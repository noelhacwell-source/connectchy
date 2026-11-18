import {and,desc,eq,isNull,sql} from "drizzle-orm";
import {db} from "@/db";
import {workspaceEntries,commands} from "@/db/schema";
import {project,type Context} from "@/lib/project-api";
import {ApiError,apiError,jsonBody,ownerRequest} from "@/lib/http-utils";
import {guardAgentRequest,AGENT_PATTERN} from "@/lib/room-coordination";
import {requestRoom} from "@/lib/project-rooms";
import {modules} from "@/lib/modules";
import {WORKBENCH,parseRecord,riskScore,isOverdue} from "@/lib/workbench-model";
import {WB_PREFIX,workbenchView} from "@/lib/workbench-store";
export const dynamic="force-dynamic";
function parse(input:unknown){try{return parseRecord(input);}catch(e){throw new ApiError(400,e instanceof Error?e.message:"Invalid record");}}
export async function GET(req:Request,ctx:Context){try{
  const {conn}=await project(ctx);if(!modules(conn.features.modules).missionControl)throw new ApiError(403,"Mission Control is disabled");
  const q=new URL(req.url).searchParams;await guardAgentRequest(req,conn,q.get("agent")??undefined);
  const room=await requestRoom(req,conn.id);
  const rows=await db.select().from(workspaceEntries).where(and(eq(workspaceEntries.connectionId,conn.id),eq(workspaceEntries.roomId,room.id),sql`${workspaceEntries.kind} like 'workbench:%'`)).orderBy(desc(workspaceEntries.updatedAt)).limit(2000);
  const all=rows.map(workbenchView),active=all.filter(r=>!r.archivedAt);
  const tasks=await db.select({id:workspaceEntries.id,status:workspaceEntries.status}).from(workspaceEntries).where(and(eq(workspaceEntries.connectionId,conn.id),eq(workspaceEntries.kind,"task"),isNull(workspaceEntries.archivedAt)));
  const selected=q.get("archived")==="1"?all.filter(r=>r.archivedAt):active;
  const records=selected.filter(r=>(!q.get("kind")||r.kind===q.get("kind"))&&(!q.get("q")||`${r.title} ${r.body} ${r.tags.join(" ")}`.toLowerCase().includes(q.get("q")!.toLowerCase())));
  const [stats]=await db.select({total:sql<number>`count(*)::int`,failed:sql<number>`count(*) filter(where ${commands.status}='error')::int`,pending:sql<number>`count(*) filter(where ${commands.status} in ('pending','sent','review'))::int`}).from(commands).where(eq(commands.connectionId,conn.id));
  const blockers=active.filter(r=>r.kind==="issue"&&r.data.severity==="blocker"&&!["resolved","closed"].includes(r.status));
  const risks=active.filter(r=>r.kind==="risk"&&r.status!=="closed").sort((a,b)=>riskScore(b)-riskScore(a));
  const overdue=active.filter(r=>isOverdue(r));
  const recent=await db.select({id:commands.id,type:commands.type,agent:commands.agent,status:commands.status,createdAt:commands.createdAt}).from(commands).where(eq(commands.connectionId,conn.id)).orderBy(desc(commands.id)).limit(100);
  return Response.json({records,kinds:WORKBENCH,tasks,truncated:rows.length===2000,summary:{...stats,blockers:blockers.length,overdue:overdue.length,openRisks:risks.length,highestRisk:risks[0]?riskScore(risks[0]):0,health:Math.max(0,100-blockers.length*20-overdue.length*5-risks.filter(r=>riskScore(r)>=15).length*10)},recent},{headers:{"Cache-Control":"no-store"}});
}catch(e){return apiError(e);}}
export async function POST(req:Request,ctx:Context){try{
  const {conn}=await project(ctx);if(!modules(conn.features.modules).missionControl)throw new ApiError(403,"Mission Control is disabled");
  const body=await jsonBody(req,750000);let owner=false;try{ownerRequest(req);owner=true;}catch{/* Agent requests use role controls. */}
  if(!owner&&(typeof body.agent!=="string"||!AGENT_PATTERN.test(body.agent)||body.agent.toLowerCase()==="owner"))throw new ApiError(400,"Include your registered agent name");
  await guardAgentRequest(req,conn,body.agent);if(conn.paused&&!owner)throw new ApiError(423,"Project stopped");
  const actor=owner?"Owner":String(body.agent),room=await requestRoom(req,conn.id);
  if(room.id!==conn.activeRoomId)throw new ApiError(409,"Activate this room before changing Mission Control");
  const ownerOnly=()=>{if(!owner)throw new ApiError(403,"This is an owner action");};
  const existing=await db.select().from(workspaceEntries).where(and(eq(workspaceEntries.connectionId,conn.id),sql`${workspaceEntries.kind} like 'workbench:%'`));
  const find=(id:unknown)=>{const r=existing.find(r=>r.id===id&&r.roomId===room.id);if(!r)throw new ApiError(404,"Record not found in this room");return r;};
  const checkRelations=async(value:ReturnType<typeof parse>)=>{
    if(WORKBENCH[value.kind].ownerOnly)ownerOnly();
    if(value.kind==="issue")for(const id of value.data.relatedIds as number[])if(!existing.some(r=>r.id===id&&r.kind==="workbench:issue"&&!r.archivedAt))throw new ApiError(400,"Related issue not found");
    if(value.kind==="memory"&&value.data.supersedes&&!existing.some(r=>r.id===value.data.supersedes&&r.kind==="workbench:memory"&&!r.archivedAt))throw new ApiError(400,"Superseded memory not found");
    if(value.kind==="milestone"){
      const tasks=await db.select({id:workspaceEntries.id,status:workspaceEntries.status}).from(workspaceEntries).where(and(eq(workspaceEntries.connectionId,conn.id),eq(workspaceEntries.kind,"task"),isNull(workspaceEntries.archivedAt)));
      for(const id of value.data.taskIds as number[]){const task=tasks.find(t=>t.id===id);if(!task)throw new ApiError(400,"Linked task not found");if(value.status==="done"&&task.status!=="done")throw new ApiError(409,"Finish every linked task before completing the milestone");}
    }
    if(value.kind==="release"&&["ready","released"].includes(value.status)&&existing.some(r=>r.kind==="workbench:issue"&&!r.archivedAt&&r.data.severity==="blocker"&&!["resolved","closed"].includes(r.status)))throw new ApiError(409,"Resolve blocker issues before declaring a release ready");
  };
  const create=async(value:ReturnType<typeof parse>)=>{await checkRelations(value);const [row]=await db.insert(workspaceEntries).values({connectionId:conn.id,roomId:room.id,kind:WB_PREFIX+value.kind,title:value.title,body:value.body,owner:value.owner,status:value.status,priority:value.priority,data:{...value.data,tags:value.tags,_history:[]}}).returning();return row;};
  if(body.action==="create"||body.action==="clone"){
    let value;if(body.action==="clone"){const r=workbenchView(find(body.id));value=parse({...r,title:r.title+" (copy)",status:WORKBENCH[r.kind].statuses[0]});}else value=parse(body.record);
    const duplicate=existing.filter(r=>r.kind===WB_PREFIX+value.kind&&!r.archivedAt&&r.title.trim().toLowerCase()===value.title.toLowerCase()).map(r=>r.id);
    return Response.json({record:workbenchView(await create(value)),duplicates:duplicate},{status:201});
  }
  if(body.action==="import_preview"||body.action==="import"){
    ownerOnly();if(!Array.isArray(body.records)||body.records.length>100)throw new ApiError(400,"Import at most 100 records at a time");
    const parsed:ReturnType<typeof parse>[]=(body.records as unknown[]).map(parse);for(const r of parsed)await checkRelations(r);
    if(parsed.some(r=>r.kind==="release"&&["ready","released"].includes(r.status))&&parsed.some(r=>r.kind==="issue"&&r.data.severity==="blocker"&&!["resolved","closed"].includes(r.status)))throw new ApiError(409,"An import cannot declare a ready release alongside an unresolved blocker");
    if(body.action==="import_preview")return Response.json({valid:true,count:parsed.length,duplicateTitles:parsed.filter(p=>existing.some(r=>r.kind===WB_PREFIX+p.kind&&r.title.toLowerCase()===p.title.toLowerCase())).map(p=>p.title)});
    const rows=await db.transaction(async tx=>{const result=[];for(const v of parsed){const [r]=await tx.insert(workspaceEntries).values({connectionId:conn.id,roomId:room.id,kind:WB_PREFIX+v.kind,title:v.title,body:v.body,owner:v.owner,status:v.status,priority:v.priority,data:{...v.data,tags:v.tags,_history:[]}}).returning();result.push(r);}return result;});
    return Response.json({records:rows.map(workbenchView)},{status:201});
  }
  if(body.action==="start_run"){
    const r=workbenchView(find(body.id));if(r.kind!=="runbook"||r.status!=="ready"||r.archivedAt)throw new ApiError(409,"Choose a ready runbook");
    return Response.json({record:workbenchView(await create(parse({kind:"run",title:r.title+" · "+new Date().toISOString(),owner:actor,status:"running",body:r.body,data:{steps:r.data.steps,runbookId:r.id,completed:[]}})))},{status:201});
  }
  if(body.action==="attach_result"){
    const r=workbenchView(find(body.id));if(r.kind!=="testcase")throw new ApiError(400,"Choose a test case");
    const [command]=await db.select().from(commands).where(and(eq(commands.id,Number(body.commandId)),eq(commands.connectionId,conn.id),eq(commands.roomId,room.id))).limit(1);
    if(!command||!["done","error"].includes(command.status))throw new ApiError(409,"Choose a completed command from this room");
    const result=command.result as Record<string,unknown>|null;
    const passed=command.status==="done"&&(result?.passed===true||result?.exitCode===0);
    body.action="update";body.revision=body.revision??r.revision;body.record={...r,status:passed?"passed":"failed",data:{...r.data,commandId:command.id,evidence:JSON.stringify({type:command.type,status:command.status,result:command.result,error:command.error},null,2).slice(0,19000)}};
  }
  if(body.action==="toggle_step"){
    const r=workbenchView(find(body.id));if(!["run","release"].includes(r.kind))throw new ApiError(400,"This record has no checklist");
    const index=Number(body.index);if(!Number.isInteger(index)||index<0||index>=(r.data.steps as string[]).length)throw new ApiError(400,"Invalid step");
    const completed=new Set(r.data.completed as number[]);if(completed.has(index))completed.delete(index);else completed.add(index);
    body.action="update";body.record={...r,data:{...r.data,completed:[...completed]}};
  }
  if(body.action==="update"){
    if(!Number.isInteger(body.revision)||body.revision<1)throw new ApiError(400,"Include the record revision");
    const row=find(body.id);if(row.archivedAt)throw new ApiError(409,"Restore the archived record first");
    const previous=workbenchView(row),value=parse({...body.record,kind:previous.kind});await checkRelations(value);
    const history=[...(previous.history??[]),{revision:row.revision,at:new Date().toISOString(),actor,title:row.title,status:row.status,body:row.body,data:previous.data}].slice(-20);
    const [updated]=await db.update(workspaceEntries).set({title:value.title,body:value.body,owner:value.owner,status:value.status,priority:value.priority,data:{...value.data,tags:value.tags,_history:history},revision:row.revision+1,updatedAt:new Date()}).where(and(eq(workspaceEntries.id,row.id),eq(workspaceEntries.revision,Number(body.revision)))).returning();
    if(!updated)throw new ApiError(409,"Record changed. Reload before saving");return Response.json({record:workbenchView(updated)});
  }
  if(["archive","restore","bulk"].includes(body.action)){
    ownerOnly();const items=body.action==="bulk"?body.items:[{id:body.id,revision:body.revision}];if(!Array.isArray(items)||items.length<1||items.length>100)throw new ApiError(400,"Select 1–100 records");
    if(items.some(item=>!item||!Number.isInteger(item.id)||item.id<1||!Number.isInteger(item.revision)||item.revision<1))throw new ApiError(400,"Include a valid ID and revision for every selected record");
    const rows=await db.transaction(async tx=>{const result=[];for(const item of items){const row=find(item.id),value=workbenchView(row);let change={};if(body.action==="archive"||body.operation==="archive")change={archivedAt:new Date()};else if(body.action==="restore"||body.operation==="restore")change={archivedAt:null};else if(body.operation==="assign")change={owner:String(body.owner??"").slice(0,40)};else throw new ApiError(400,"Unsupported bulk operation");
      if(WORKBENCH[value.kind].ownerOnly)ownerOnly();const [updated]=await tx.update(workspaceEntries).set({...change,revision:row.revision+1,updatedAt:new Date()}).where(and(eq(workspaceEntries.id,row.id),eq(workspaceEntries.revision,Number(item.revision)))).returning();if(!updated)throw new ApiError(409,"A selected record changed; no bulk changes were saved");result.push(updated);}return result;});return Response.json({records:rows.map(workbenchView)});
  }
  throw new ApiError(400,"Unknown Mission Control action");
}catch(e){return apiError(e);}}
