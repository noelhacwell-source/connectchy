import {z} from "zod";
const text=z.string().max(20000).default("");
const short=z.string().max(500).default("");
const date=z.string().refine(s=>{if(!s)return true;if(Number.isNaN(Date.parse(s))||!/^\d{4}-\d{2}-\d{2}/.test(s))return false;return s.length!==10||new Date(s+"T00:00:00Z").toISOString().slice(0,10)===s;},"Use a valid ISO date").default("");
const lines=z.array(z.string().min(1).max(1000)).max(100).default([]);
const ids=z.array(z.number().int().positive()).max(100).default([]);
const semver=z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,"Use a semantic version such as 1.0.0");
type Field={key:string;label:string;type?:"text"|"long"|"number"|"date"|"datetime-local"|"lines"|"ids";options?:string[]};
type Definition={label:string;description:string;statuses:string[];ownerOnly?:boolean;fields:Field[]};
export const WORKBENCH:Record<string,Definition>={
  issue:{label:"Issues",description:"Reproduce, triage and resolve problems.",statuses:["open","triaged","in_progress","resolved","closed"],fields:[{key:"severity",label:"Severity",options:["low","normal","high","blocker"]},{key:"environment",label:"Environment"},{key:"steps",label:"Reproduction steps",type:"lines"},{key:"expected",label:"Expected behavior",type:"long"},{key:"actual",label:"Actual behavior",type:"long"},{key:"paths",label:"Affected paths",type:"lines"},{key:"relatedIds",label:"Related issue IDs",type:"ids"},{key:"resolution",label:"Resolution",type:"long"}]},
  milestone:{label:"Milestones",description:"Track outcomes, linked tasks and deadlines.",statuses:["planned","active","done"],fields:[{key:"target",label:"Target date",type:"date"},{key:"taskIds",label:"Linked task IDs",type:"ids"},{key:"acceptance",label:"Acceptance criteria",type:"long"}]},
  memory:{label:"Project memory",description:"Keep durable, sourced context for new agents.",statuses:["current","superseded"],fields:[{key:"category",label:"Category",options:["architecture","convention","requirement","glossary","constraint","environment"]},{key:"source",label:"Source URL"},{key:"expires",label:"Review / expiry date",type:"date"},{key:"supersedes",label:"Superseded memory ID",type:"number"},{key:"paths",label:"Relevant paths",type:"lines"}]},
  runbook:{label:"Runbooks",description:"Repeat a procedure and retain each run.",statuses:["draft","ready","retired"],fields:[{key:"steps",label:"Ordered steps",type:"lines"},{key:"prerequisites",label:"Prerequisites",type:"long"},{key:"expected",label:"Expected result",type:"long"}]},
  run:{label:"Runbook runs",description:"Check off a frozen copy of a procedure.",statuses:["running","done","failed"],fields:[{key:"steps",label:"Run steps",type:"lines"},{key:"outcome",label:"Outcome notes",type:"long"}]},
  release:{label:"Releases",description:"Gate releases, freeze edits and export release notes.",statuses:["draft","frozen","ready","released"],ownerOnly:true,fields:[{key:"version",label:"Semantic version"},{key:"steps",label:"Release checklist",type:"lines"},{key:"notes",label:"Release notes",type:"long"}]},
  risk:{label:"Risk register",description:"Rank risks and track mitigation reviews.",statuses:["open","mitigating","accepted","closed"],fields:[{key:"likelihood",label:"Likelihood (1–5)",type:"number"},{key:"impact",label:"Impact (1–5)",type:"number"},{key:"mitigation",label:"Mitigation plan",type:"long"},{key:"review",label:"Review date",type:"date"}]},
  dependency:{label:"Dependencies",description:"Track versions, licenses and planned upgrades.",statuses:["active","upgrade_planned","retired"],fields:[{key:"version",label:"Installed version"},{key:"license",label:"License"},{key:"url",label:"Registry / documentation URL"},{key:"upgrade",label:"Upgrade review date",type:"date"},{key:"targetVersion",label:"Target version"}]},
  profile:{label:"Agent permissions",description:"Apply command allowlists and usage quotas to self-reported agent names; these are not separate login accounts.",statuses:["draft","active","disabled"],ownerOnly:true,fields:[{key:"agent",label:"Exact agent name"},{key:"commandLimit",label:"Command limit (since profile creation)",type:"number"},{key:"byteLimit",label:"Payload byte budget",type:"number"},{key:"allowedCommands",label:"Allowed commands (blank = any)",type:"lines"},{key:"expires",label:"Profile expiry",type:"date"}]},
  maintenance:{label:"Maintenance",description:"Schedule a window that blocks new agent mutations.",statuses:["scheduled","cancelled"],ownerOnly:true,fields:[{key:"start",label:"Start",type:"datetime-local"},{key:"end",label:"End",type:"datetime-local"},{key:"reason",label:"Reason",type:"long"}]},
  testcase:{label:"Test cases",description:"Write repeatable tests and attach real command evidence.",statuses:["draft","ready","passed","failed","blocked"],fields:[{key:"steps",label:"Test steps",type:"lines"},{key:"expected",label:"Expected result",type:"long"},{key:"environment",label:"Test environment"},{key:"evidence",label:"Evidence / observations",type:"long"}]},
  benchmark:{label:"Benchmarks",description:"Compare measured values against explicit targets.",statuses:["planned","measured"],fields:[{key:"metric",label:"Metric"},{key:"target",label:"Target value",type:"number"},{key:"actual",label:"Measured value",type:"number"},{key:"unit",label:"Unit"},{key:"direction",label:"Success direction",options:["at_most","at_least"]}]},
  view:{label:"Saved views",description:"Save a shared board filter and sort order.",statuses:["active"],fields:[{key:"kind",label:"Board kind"},{key:"query",label:"Search text"},{key:"status",label:"Status filter"},{key:"owner",label:"Owner filter"},{key:"sort",label:"Sort",options:["updated","title","priority","due","risk"]}]},
};
const checklist={steps:lines,completed:z.array(z.number().int().min(0).max(99)).max(100).default([])};
const schemas:Record<string,z.ZodType>={
  issue:z.object({severity:z.enum(["low","normal","high","blocker"]).default("normal"),environment:short,steps:lines,expected:text,actual:text,paths:lines,relatedIds:ids,resolution:text}),
  milestone:z.object({target:date,taskIds:ids,acceptance:text}),
  memory:z.object({category:z.enum(["architecture","convention","requirement","glossary","constraint","environment"]).default("architecture"),source:short,expires:date,supersedes:z.number().int().nonnegative().default(0),paths:lines}),
  runbook:z.object({steps:lines,prerequisites:text,expected:text}),
  run:z.object({...checklist,outcome:text,runbookId:z.number().int().positive().optional()}),
  release:z.object({...checklist,version:semver,notes:text}),
  risk:z.object({likelihood:z.number().int().min(1).max(5).default(1),impact:z.number().int().min(1).max(5).default(1),mitigation:text,review:date}),
  dependency:z.object({version:short,license:short,url:short,upgrade:date,targetVersion:short}),
  profile:z.object({agent:z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,39}$/),commandLimit:z.number().int().min(1).max(1000000),byteLimit:z.number().int().min(100).max(1000000000),allowedCommands:z.array(z.string().regex(/^[a-z_]{2,40}$/)).max(100).default([]),expires:date}),
  maintenance:z.object({start:z.string().datetime({offset:true}),end:z.string().datetime({offset:true}),reason:text}).refine(p=>Date.parse(p.end)>Date.parse(p.start),"Maintenance end must follow its start"),
  testcase:z.object({steps:lines,expected:text,environment:short,evidence:text,commandId:z.number().int().positive().optional()}),
  benchmark:z.object({metric:short,target:z.number().finite(),actual:z.number().finite(),unit:short,direction:z.enum(["at_most","at_least"]).default("at_most")}),
  view:z.object({kind:z.string().refine(s=>Object.hasOwn(WORKBENCH,s),"Unknown board"),query:short,status:short,owner:short,sort:z.enum(["updated","title","priority","due","risk"]).default("updated")}),
};
export const recordSchema=z.object({kind:z.string().refine(s=>Object.hasOwn(WORKBENCH,s),"Unknown board"),title:z.string().trim().min(1).max(160),body:text,owner:z.string().max(40).default(""),status:z.string().max(40).optional(),priority:z.enum(["low","normal","high","urgent"]).default("normal"),tags:z.array(z.string().trim().min(1).max(40)).max(20).default([]),data:z.record(z.string(),z.unknown()).default({})});
export type WorkbenchDraft=z.infer<typeof recordSchema>;
export function createWorkbenchDraft(kind:string):WorkbenchDraft {
  if(!Object.hasOwn(WORKBENCH,kind))throw new Error("Unknown board");
  return {kind,title:"",body:"",owner:"",priority:"normal",tags:[],status:WORKBENCH[kind].statuses[0],data:{steps:[],completed:[],relatedIds:[],taskIds:[],paths:[],category:"architecture",severity:"normal",version:"0.1.0",likelihood:1,impact:1,metric:"",target:kind==="benchmark"?0:"",actual:kind==="benchmark"?0:"",direction:"at_most",supersedes:0,commandLimit:1000,byteLimit:10000000,allowedCommands:[],start:new Date(Date.now()+3600000).toISOString(),end:new Date(Date.now()+7200000).toISOString(),kind:"issue",sort:"updated"}};
}
export type WorkbenchRecord=Omit<WorkbenchDraft,"status">&{id:number;revision:number;status:string;createdAt:string;updatedAt:string;archivedAt:string|null;roomId:number|null;history?:{revision:number;at:string;actor:string;title:string;status:string;body:string;data:Record<string,unknown>}[]};
export function parseRecord(input:unknown):WorkbenchDraft&{status:string} {
  const value=recordSchema.parse(input),definition=WORKBENCH[value.kind];
  const status=value.status??definition.statuses[0];
  if(!definition.statuses.includes(status))throw new Error("Invalid status for this board");
  const data=schemas[value.kind].parse(value.data) as Record<string,unknown>;
  if(value.kind==="issue"&&["resolved","closed"].includes(status)&&!String(data.resolution).trim())throw new Error("Add resolution notes before resolving an issue");
  if(["run","release"].includes(value.kind)&&["done","ready","released"].includes(status)) {
    const completed=new Set(data.completed as number[]);
    if((data.steps as string[]).some((_,i)=>!completed.has(i)))throw new Error("Complete every required checklist step first");
  }
  for(const key of ["source","url"])if(data[key]){let valid=false;try{const url=new URL(String(data[key]));valid=["http:","https:"].includes(url.protocol)&&!url.username&&!url.password;}catch{}if(!valid)throw new Error("Source URLs must use HTTP(S) without embedded credentials");}
  return {...value,status,data};
}
export function dueDate(record:WorkbenchRecord) {const key=record.kind==="milestone"?"target":record.kind==="risk"?"review":record.kind==="dependency"?"upgrade":"expires";return String(record.data[key]??"");}
export function isOverdue(record:WorkbenchRecord,now=Date.now()) {const due=Date.parse(dueDate(record));return Number.isFinite(due)&&due<now&&!["done","closed","resolved","retired","released","superseded","cancelled","disabled"].includes(record.status);}
export function riskScore(record:WorkbenchRecord){return record.kind==="risk"?Number(record.data.likelihood)*Number(record.data.impact):0;}
