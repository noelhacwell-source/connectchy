import { modules } from "@/lib/modules";
import {EXPANDED_CODE_COMMANDS,EXPANDED_ROBLOX_COMMANDS} from "./expanded-commands";
import { and, asc, eq, gt, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { projectRooms, roomMessages, roomReads, type Connection } from "@/db/schema";
import { isNull } from "drizzle-orm";
import { ensureActiveRoom } from "@/lib/project-rooms";
import { ApiError, ownerRequest } from "@/lib/http-utils";
export async function guardAgentRequest(req:Request,conn:Connection,agent:unknown){
  if(typeof agent!=="string" || agent.toLowerCase()==="owner"){try{ownerRequest(req);return;}catch{/* Remote callers must identify their agent. */}}
  const error=await agentControlError(conn,agent);if(error)throw new ApiError(423,error);
}
export const AGENT_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
export async function agentControlError(conn: Connection, agent: unknown): Promise<string | null> {
  const team = (await ensureActiveRoom(conn.id)).team;
  if (!team.participants.some(p => p.control)) return null;
  if (typeof agent !== "string" || !AGENT_PATTERN.test(agent)) return "Include your registered agent name; individual agent controls are active.";
  const p = team.participants.find(p => p.agent.toLowerCase() === agent.toLowerCase());
  return p?.control ? `Your agent/role is ${p.control} by the owner (signal ${p.controlRevision ?? 1}). Stop generating and making tool calls. Wait for the owner to resume or restore you; do not rejoin under another name.` : null;
}
export async function unreadPings(connectionId: number, agent: string, limit = 100, roomId?: number) {
  roomId ??= (await ensureActiveRoom(connectionId)).id;
  const name = agent.toLowerCase();
  const [read] = await db.select().from(roomReads).where(and(eq(roomReads.connectionId, connectionId), eq(roomReads.agent, name), eq(roomReads.roomId,roomId))).limit(1);
  return db.select().from(roomMessages).where(and(eq(roomMessages.connectionId, connectionId), eq(roomMessages.roomId,roomId), isNull(roomMessages.deletedAt), gt(roomMessages.id, read?.through ?? 0), ne(sql`lower(${roomMessages.agent})`, name), or(sql`${roomMessages.mentions} @> ${JSON.stringify([name])}::jsonb`, sql`${roomMessages.mentions} @> '["all"]'::jsonb`))).orderBy(asc(roomMessages.id)).limit(limit);
}
const READ_ONLY = new Set(["get_tree", "get_instance", "find", "list_scripts", "search_scripts", "get_selection", "get_source", "search_assets", "image_from_decal"]);
export function changesStudio(type: string, payload: unknown): boolean {
  if([...EXPANDED_CODE_COMMANDS,...EXPANDED_ROBLOX_COMMANDS].some(c=>c.type===type&&c.read))return false;
  if (["code_get_workspace","code_list_files","code_read_file","code_search_files","code_get_active_editor","code_get_diagnostics"].includes(type)) return false;
  if (type === "batch") {
    const commands = (payload as { commands?: { type: string; payload?: unknown }[] })?.commands;
    return !Array.isArray(commands) || commands.some(c => !c || typeof c.type !== "string" || changesStudio(c.type, c.payload));
  }
  return !READ_ONLY.has(type);
}
export async function coordinationError(conn: Connection, agent: unknown, requestedRoom?: unknown): Promise<string | null> {
  if (!conn.features.room) return null;
  if (typeof agent !== "string" || !AGENT_PATTERN.test(agent) || ["owner", "all", "coordinator"].includes(agent.toLowerCase())) return "Room coordination is enabled. Register at /room/team and include your stable agent name in the command's top-level agent field.";
  const activeRoom = await ensureActiveRoom(conn.id);
  if (requestedRoom !== undefined && requestedRoom !== null && ((typeof requestedRoom !== "number" && typeof requestedRoom !== "string") || String(requestedRoom) !== String(activeRoom.id))) return "The active room changed. Read /rooms and use its activeRoomId before sending more edits.";
  if (requestedRoom === undefined || requestedRoom === null) {
    const rooms = await db.select({id:projectRooms.id}).from(projectRooms).where(and(eq(projectRooms.connectionId,conn.id),isNull(projectRooms.deletedAt))).limit(2);
    if (rooms.length>1) return `Multiple rooms exist. Include top-level room:${activeRoom.id} with each Studio edit (_room in MCP arguments), so edits cannot silently follow a room switch.`;
  }
  const team = activeRoom.team;
  const enabled=modules(conn.features.modules);
  const participant = team.participants.find(p => p.agent.toLowerCase() === agent.toLowerCase());
  if (participant?.control) return `Your agent/role is ${participant.control}. Wait for the owner to resume or restore you.`;
  if (enabled.rolePlanning && (team.phase !== "active" || !participant?.ready || participant.done)) return `Work is blocked until roles are agreed. Team phase: ${team.phase}; expected AIs: ${team.expected}. Join /room/team with a role and non-overlapping paths, discuss the plan, then mark ready. An empty room is NOT permission to begin.`;
  const pings = await unreadPings(conn.id, agent, 1, activeRoom.id);
  if (enabled.pingInbox && pings.length) return "You have an unacknowledged ping. Read /room?agent=" + encodeURIComponent(agent) + " and explicitly acknowledge the attention messages with POST /room {action:'ack',agent,through:<last ping id>} before editing.";
  return null;
}
export function scopesOverlap(a: string, b: string) { return a === b || a.startsWith(b + "/") || b.startsWith(a + "/"); }
