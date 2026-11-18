import {and,eq,isNull,sql,gte} from "drizzle-orm";
import {db} from "@/db";
import {workspaceEntries,commands,type Connection} from "@/db/schema";
import {modules} from "@/lib/modules";
import {changesStudio,AGENT_PATTERN} from "@/lib/room-coordination";
import type {WorkbenchRecord} from "./workbench-model";
export const WB_PREFIX="workbench:";
export function workbenchView(row:typeof workspaceEntries.$inferSelect):WorkbenchRecord {
  const {tags,_history,...data}=row.data;
  return {...row,priority:row.priority as WorkbenchRecord["priority"],kind:row.kind.slice(WB_PREFIX.length),tags:Array.isArray(tags)?tags as string[]:[],data,history:Array.isArray(_history)?_history as WorkbenchRecord["history"]:[],createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),archivedAt:row.archivedAt?.toISOString()??null};
}
export async function workbenchGuard(conn:Connection,agent:unknown,type:string,payload:unknown,executor:Pick<typeof db,"select">=db,checkUsage=true) {
  if(!modules(conn.features.modules).missionControl)return null;
  const records=await executor.select().from(workspaceEntries).where(and(eq(workspaceEntries.connectionId,conn.id),isNull(workspaceEntries.archivedAt),sql`${workspaceEntries.kind} in ('workbench:release','workbench:maintenance','workbench:profile')`));
  const now=Date.now();
  if(records.some(r=>r.kind==="workbench:profile"&&r.status==="active")&&(typeof agent!=="string"||!AGENT_PATTERN.test(agent)))return "Include your stable agent name while permission profiles are active.";
  if(changesStudio(type,payload)) {
    if(records.some(r=>r.kind==="workbench:release"&&r.status==="frozen"))return "Release freeze is active. Ask the owner to unfreeze the release before edits or terminal commands.";
    if(records.some(r=>r.kind==="workbench:maintenance"&&r.status==="scheduled"&&Date.parse(String(r.data.start))<=now&&Date.parse(String(r.data.end))>now))return "A scheduled maintenance window is active. Wait for its end before changing the project.";
  }
  for(const profile of records.filter(r=>r.kind==="workbench:profile"&&r.status==="active"&&String(r.data.agent).toLowerCase()===String(agent).toLowerCase())) {
    if(profile.data.expires&&Date.parse(String(profile.data.expires))<now) return "Your permission profile has expired. Ask the owner to review it.";
    const allowed=profile.data.allowedCommands as string[];
    if(allowed?.length&&!allowed.includes(type))return `Command ${type} is outside your permission profile.`;
    if(!checkUsage)continue;
    const [usage]=await executor.select({count:sql<number>`count(*)::int`,bytes:sql<number>`coalesce(sum(octet_length(${commands.payload}::text)),0)::bigint`,incoming:sql<number>`octet_length(${JSON.stringify(payload)}::jsonb::text)`}).from(commands).where(and(eq(commands.connectionId,conn.id),sql`lower(${commands.agent})=lower(${String(agent)})`,gte(commands.createdAt,profile.createdAt)));
    if(Number(usage.count)>=Number(profile.data.commandLimit))return "Your command budget is exhausted. Ask the owner to raise the limit.";
    if(Number(usage.bytes)+Number(usage.incoming)>Number(profile.data.byteLimit))return "Your payload byte budget is exhausted. Ask the owner to raise the limit.";
  }
  return null;
}
