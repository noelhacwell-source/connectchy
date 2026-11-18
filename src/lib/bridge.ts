import { modules } from "@/lib/modules";
import {workbenchGuard} from "@/lib/workbench-store";
import {EXPANDED_CODE_COMMANDS,EXPANDED_ROBLOX_COMMANDS} from "@/lib/expanded-commands";
import { isVSCode, VSCODE_COMMANDS } from "@/lib/vscode";
import { protectionError } from "@/lib/work-protection";
import { publicOrigin } from "@/lib/public-origin";
import { workspaceEntries } from "@/db/schema";
import { isNull } from "drizzle-orm";
import { featureSettings } from "@/lib/features";
import { changesStudio, coordinationError, agentControlError } from "@/lib/room-coordination";
import { createHash, randomBytes } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { commands, connections, type Command, type Connection } from "@/db/schema";

/** Studio counts as online if the plugin polled within this window. */
export const ONLINE_WINDOW_MS = 45_000;
/** Queued commands older than this are never delivered to Studio. */
export const PENDING_TTL_MS = 5 * 60_000;
/** A delivered command with no result after this long is treated as lost. */
export const SENT_TTL_MS = 3 * 60_000;
const MAX_PAYLOAD_BYTES = 900_000;

export const sha = (value: string) => createHash("sha256").update(value).digest("base64url");
export const newToken = () => "sl_" + randomBytes(24).toString("base64url");
export const derivePluginKey = (token: string) => "pk_" + sha("studio-link-plugin:" + token);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const plausible = (secret: unknown): secret is string =>
  typeof secret === "string" && secret.length >= 20 && secret.length <= 120;

export async function findByToken(token: unknown): Promise<Connection | null> {
  if (!plausible(token)) return null;
  const [row] = await db.select().from(connections).where(eq(connections.tokenHash, sha(token))).limit(1);
  return row ?? null;
}

export async function findByPluginKey(key: unknown): Promise<Connection | null> {
  if (!plausible(key)) return null;
  const [row] = await db.select().from(connections).where(eq(connections.pluginKeyHash, sha(key))).limit(1);
  return row ?? null;
}

const SAFE_ORIGIN = /^https?:\/\/[A-Za-z0-9.\-:[\]]{1,200}$/;

/** Accept only a bare http(s) origin: it is printed in the AI docs and written into Lua source. */
export function cleanOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const origin = value.replace(/\/+$/, "");
  return SAFE_ORIGIN.test(origin) ? origin : null;
}

export const isOnline = (c: Connection) =>
  !!c.lastSeenAt && Date.now() - c.lastSeenAt.getTime() < ONLINE_WINDOW_MS;

export function publicConnection(c: Connection) {
  return {
    mode: isVSCode(c.features) ? "vscode" : "roblox",
    name: c.name,
    videoUploadLimitMb: c.videoUploadLimitMb,
    modules: modules(c.features.modules),
    paused: !!c.paused,
    stopRevision:c.stopRevision,
    online: isOnline(c),
    placeName: c.placeName,
    placeId: c.placeId,
    pluginVersion: c.pluginVersion,
    origin: publicOrigin() ?? c.origin,
    tunnelReady: !!publicOrigin(),
    features: (() => { const f = featureSettings(c.features); return { room: f.room, uploads: f.uploads, mcps: f.mcps, skills: f.skills }; })(),
    lastSeenAt: c.lastSeenAt,
    createdAt: c.createdAt,
  };
}

export function commandView(row: Command) {
  const finished = row.status === "done" || row.status === "error";
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    ok: row.status === "done",
    result: row.result ?? null,
    error: row.error ?? null,
    source: row.source,
    agent: row.agent,
    roomId: row.roomId,
    before: row.before,
    createdAt: row.createdAt,
    ms: finished && row.completedAt ? row.completedAt.getTime() - row.createdAt.getTime() : null,
  };
}

async function waitFor(id: number, timeoutMs: number): Promise<Command | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const [row] = await db.select().from(commands).where(eq(commands.id, id)).limit(1);
    if (!row) return null;
    if (row.status === "done" || row.status === "error" || Date.now() >= deadline) return row;
    await sleep(250);
  }
}

export type RunInput = {
  type?: unknown;
  payload?: unknown;
  source?: unknown;
  nonce?: unknown;
  wait?: unknown;
  timeoutMs?: unknown;
  agent?: unknown;
  room?: unknown;
};

/** Validate, queue and (by default) wait for one Studio command. */
export async function runCommand(conn: Connection, input: RunInput): Promise<{ status: number; body: object }> {
  const fail = (status: number, error: string) => ({ status, body: { ok: false, error } });
  if (input.source !== "dashboard") { const blocked = await agentControlError(conn, input.agent); if(blocked) return fail(423, blocked); }

  if(conn.paused)return fail(423,"Project paused by the owner. Chat remains available; Studio commands are not being dispatched.");
  if (typeof input.type !== "string" || !/^[a-z_]{2,40}$/.test(input.type)) {
    return fail(400, "Missing or invalid 'type'. Read the docs at this link's root for the command list.");
  }
  if (isVSCode(conn.features) ? !VSCODE_COMMANDS.some(c=>c.type===input.type) : input.type.startsWith("code_")) return fail(400,"This command belongs to a different workspace mode. Read the current agent link for available commands.");
  if (input.type === "code_trash_files" && !/^vscode-0\.(?:[3-9]|[1-9]\d)\./.test(conn.pluginVersion ?? ""))
    return fail(409, "Install Connectchy 0.3.0 or newer to trash multiple files.");
  if(EXPANDED_CODE_COMMANDS.some(c=>c.type===input.type)&&!/^vscode-0\.(?:[2-9]|[1-9]\d)\./.test(conn.pluginVersion??""))return fail(409,"This tool requires VS Code extension 0.2.0 or newer. Install the updated VSIX from Connection setup.");
  if(EXPANDED_ROBLOX_COMMANDS.some(c=>c.type===input.type)) {const v=(conn.pluginVersion??"").split(".").map(Number);if(!(v[0]>1||(v[0]===1&&v[1]>=4)))return fail(409,"This tool requires Roblox plugin 1.4.0 or newer. Restart Studio after updating the plugin.");}
  const payload = input.payload ?? {};
  if (typeof payload !== "object" || Array.isArray(payload)) {
    return fail(400, "'payload' must be a JSON object.");
  }
  if (Buffer.byteLength(JSON.stringify(payload)) > MAX_PAYLOAD_BYTES) {
    return fail(413, "Payload is too large (900 KB max). Split the work into smaller commands.");
  }
  if (input.type === "run_playtest") {
    const p = payload as {mode?:unknown;duration?:unknown;code?:unknown};
    if (p.mode !== undefined && p.mode !== "play" && p.mode !== "run") return fail(400,"Playtest mode must be play or run.");
    if (p.duration !== undefined && (typeof p.duration !== "number" || !Number.isInteger(p.duration) || p.duration < 1 || p.duration > 60)) return fail(400,"Playtest duration must be a whole number from 1 to 60 seconds.");
    if (p.code !== undefined && (typeof p.code !== "string" || Buffer.byteLength(p.code) > 32000)) return fail(400,"Playtest code must be a string under 32 KB.");
    const version = (conn.pluginVersion ?? "").split(".").map(Number);
    if (!(version[0] > 1 || (version[0] === 1 && version[1] >= 3))) return fail(409,"Playtests require Connectchy plugin 1.3.0 or newer. Download the updated plugin from Connection setup and restart Studio.");
  }
  if (input.source !== "dashboard" && changesStudio(input.type, payload)) {
    if(modules(conn.features.modules).gameReferences&&modules(conn.features.modules).referenceGate){const refs=await db.select().from(workspaceEntries).where(and(eq(workspaceEntries.connectionId,conn.id),eq(workspaceEntries.kind,"reference"),isNull(workspaceEntries.archivedAt)));if(refs.some(r=>r.data.enabled!==false&&r.status!=="researched"))return fail(409,"Game reference research is pending. Read /references and save a cited research brief before building.");}
    const error = await coordinationError(conn, input.agent, input.room);
    if (error) return fail(409, error);
    const protectedError=await protectionError(conn,input.agent,input.type,payload);
    if(protectedError)return fail(403,protectedError);
  }
  const nonce = typeof input.nonce === "string" && input.nonce.length <= 80 ? input.nonce : null;
  const timeoutMs = Math.min(Math.max(Number(input.timeoutMs) || 25_000, 1_000), 55_000);
  const shouldWait = input.wait !== false && input.wait !== "false" && input.wait !== "0";

  let row: Command | undefined;
  if (nonce) {
    // Same nonce = same command. Protects against retries re-running a build step.
    [row] = await db
      .select()
      .from(commands)
      .where(and(eq(commands.connectionId, conn.id), eq(commands.nonce, nonce)))
      .limit(1);
  }
  if (!row) {
    if(input.source!=="dashboard") {const blocked=await workbenchGuard(conn,input.agent,input.type,payload,db,false);if(blocked)return fail(403,blocked);}
    if (!isOnline(conn)) {
      return fail(
        409,
        isVSCode(conn.features)?"VS Code is not connected. Open the project folder and use Connectchy: Connect Project in VS Code.":"Roblox Studio is not connected. Ask the user to open Studio with the Connectchy plugin installed, then retry.",
      );
    }
    const review=input.source!=="dashboard"&&changesStudio(input.type,payload)&&modules(conn.features.modules).reviewQueue;
    let before: {path:string;source:string}[]|null=null;
    if(review&&["set_source","append_source"].includes(input.type)&&typeof (payload as {path?:unknown}).path==="string"){
      const path=(payload as {path:string}).path;
      const previous=await runCommand(conn,{type:"get_source",payload:{path},source:"dashboard",timeoutMs:10000});
      const result=previous.body as {ok?:boolean;result?:{source?:string}};
      if(result.ok&&typeof result.result?.source==="string")before=[{path,source:result.result.source}];
      else return fail(409,"Cannot capture the current script for review. Connect Studio and retry; no edit proposal was queued.");
    }
    const queued=await db.transaction(async tx=>{
      if(nonce)await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`connectchy:nonce:${conn.id}:${nonce}`},0))`);
      if(input.source!=="dashboard")await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`connectchy:agent:${conn.id}:${String(input.agent).toLowerCase()}`},0))`);
      if(nonce){const [existing]=await tx.select().from(commands).where(and(eq(commands.connectionId,conn.id),eq(commands.nonce,nonce))).limit(1);if(existing)return {row:existing,blocked:null};}
      if(input.source!=="dashboard"){const blocked=await workbenchGuard(conn,input.agent,input.type as string,payload,tx);if(blocked)return {row:null,blocked};}
      const [created] = await tx
      .insert(commands)
      .values({
        connectionId: conn.id,
        type: input.type as string,
        payload,
        nonce,
        roomId: typeof input.room==="number"?input.room:conn.activeRoomId,
        status:review?"review":"pending",
        before,
        source: input.source === "dashboard" ? "dashboard" : "agent",
        agent: typeof input.agent === "string" ? input.agent.slice(0,40) : null,
      })
      .returning();
      return {row:created,blocked:null};
    });
    if(queued.blocked)return fail(403,queued.blocked);
    if(!queued.row)return fail(500,"Could not queue the command.");
    row=queued.row;
  }

  if(row.status==="review")return {status:202,body:{...commandView(row),requiresApproval:true,error:"Waiting for owner approval. Poll /commands?id="+row.id+"; do not resubmit."}};
  if (!shouldWait) return { status: 202, body: commandView(row) };
  const done = await waitFor(row.id, timeoutMs);
  if (!done) return fail(404, "Command disappeared.");
  if (done.status === "pending" || done.status === "sent") {
    return {
      status: 202,
      body: {
        ...commandView(done),
        error: `Still running after ${timeoutMs} ms. Fetch /commands?id=${done.id} later to read the result.`,
      },
    };
  }
  return { status: 200, body: commandView(done) };
}

export function originFromRequest(req: Request): string {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return new URL(req.url).origin;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}

export const noStore = { "Cache-Control": "no-store" };
