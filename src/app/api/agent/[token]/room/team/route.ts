import { modules } from "@/lib/modules";
import { requestRoom } from "@/lib/project-rooms";
import { eq, and, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { connections, projectRooms, roomMessages, commands } from "@/db/schema";
import { project, type Context } from "@/lib/project-api";
import { apiError, ApiError, jsonBody, ownerRequest } from "@/lib/http-utils";
import { AGENT_PATTERN, scopesOverlap } from "@/lib/room-coordination";
import { DEFAULT_TEAM } from "@/lib/team-types";
export const dynamic = "force-dynamic";
const input = z.discriminatedUnion("action", [
  z.object({ action:z.literal("manage"), agent:z.string().regex(AGENT_PATTERN), operation:z.enum(["pause","stop","resume","remove","restore"]) }),
  z.object({
    action: z.literal("configure"),
    expected: z.number().int().min(1).max(32),
  }),
  z.object({
    action: z.literal("resize"),
    expected: z.number().int().min(1).max(32),
  }),
  z.object({ action: z.literal("reset") }),
  z.object({
    action: z.literal("join"),
    agent: z.string().regex(AGENT_PATTERN),
    role: z.string().trim().min(1).max(200),
    paths: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(300)
          .refine(
            (s) =>
              !s.startsWith("/") &&
              !s.endsWith("/") &&
              !s.includes("//") &&
              s !== "game",
            "Use exact service/instance paths, not game or wildcard scopes.",
          ),
      )
      .min(1)
      .max(30),
  }),
  z.object({
    action: z.enum(["ready", "done"]),
    agent: z.string().regex(AGENT_PATTERN),
  }),
]);
export async function GET(req: Request, ctx: Context) {
  try {
    const { conn, settings } = await project(ctx);
    if (!settings.room) throw new ApiError(403, "Room is disabled.");
    return Response.json(
      { team: (await requestRoom(req, conn.id)).team },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request, ctx: Context) {
  try {
    const { conn, settings } = await project(ctx);
    if (!settings.room) throw new ApiError(403, "Room is disabled.");

    const room = await requestRoom(req, conn.id, true);
    const parsed = input.safeParse(await jsonBody(req, 16000));
    if (!parsed.success)
      throw new ApiError(
        400,
        parsed.error.issues.map((i) => i.message).join("; "),
      );
    const data = parsed.data;
    if (
      !modules(settings.modules).rolePlanning &&
      !["manage", "resize", "configure", "reset"].includes(data.action)
    )
      throw new ApiError(403, "Role planning is disabled.");
    if (
      data.action === "manage" || data.action === "configure" ||
      data.action === "reset" ||
      data.action === "resize"
    )
      ownerRequest(req);
    else if (["owner", "all", "coordinator"].includes(data.agent.toLowerCase()))
      throw new ApiError(
        400,
        "Choose an AI name other than Owner, all or Coordinator.",
      );
    const team = await db.transaction(async (tx) => {
      const [connection] = await tx
        .select()
        .from(connections)
        .where(eq(connections.id, conn.id))
        .for("update");
      if (connection.activeRoomId !== room.id)
        throw new ApiError(
          409,
          "The active room changed. Reopen the current room before editing roles.",
        );
      const [row] = await tx
        .select()
        .from(projectRooms)
        .where(eq(projectRooms.id, room.id))
        .for("update");
      const team = structuredClone(row.team ?? DEFAULT_TEAM);
      let text = "";
      if (data.action === "manage") {
        const p=team.participants.find(p=>p.agent.toLowerCase()===data.agent.toLowerCase());
        if(!p)throw new ApiError(404,"Agent not found.");
        const wasRemoved=p.control==="removed";
        if(wasRemoved && data.operation!=="restore")throw new ApiError(409,"Restore this removed agent first.");
        if(!wasRemoved && data.operation==="restore")throw new ApiError(409,"This agent is not removed.");
        p.controlRevision=(p.controlRevision??0)+1;
        p.control=data.operation==="pause"?"paused":data.operation==="stop"?"stopped":data.operation==="remove"?"removed":undefined;
        if(data.operation==="remove"){team.expected=Math.max(1,team.expected-1);if(!team.participants.some(p=>p.control!=="removed"))team.phase="planning";}
        if(data.operation==="restore"){
          if(team.participants.filter(p=>p.control!=="removed").length>32)throw new ApiError(409,"Team limit reached.");
          team.expected=Math.max(team.expected,team.participants.filter(p=>p.control!=="removed").length);
          team.phase="planning";for(const member of team.participants)member.ready=false;
        }
        if(p.control){await tx.update(commands).set({status:"error",error:`Agent ${p.control} by owner`,completedAt:new Date()}).where(and(eq(commands.connectionId,conn.id),eq(commands.roomId,room.id),sql`lower(${commands.agent})=${p.agent.toLowerCase()}`,inArray(commands.status,["pending","review"])));}
        team.revision++;
        text=`@${p.agent} Owner ${data.operation}: ${p.role}. ${p.control?"Stop generating and stop tool calls now. Wait for owner resume/restore; do not change your name to bypass this.":"Read /control?agent="+encodeURIComponent(p.agent)+" and the current role plan before continuing."} Other agents may continue their assigned work.`;
      } else if (data.action === "resize") {
        if (data.expected < team.participants.filter(p=>p.control!=="removed").length)
          throw new ApiError(
            409,
            "The number cannot be lower than the registered team. Start a new planning round to remove agents.",
          );
        team.expected = data.expected;
        team.phase = "planning";
        team.revision++;
        for (const p of team.participants) {
          p.ready = false;
          p.done = false;
        }
        text = `@all Team size changed to ${data.expected}. Existing roles are preserved. Invite new agents, agree scopes and confirm ready again.`;
      } else if (data.action === "reset" || data.action === "configure") {
        team.expected =
          data.action === "configure" ? data.expected : team.expected;
        team.phase = "planning";
        team.revision++;
        team.participants = team.participants.filter(p=>p.control);
        text = `New planning round ${team.revision}. Waiting for ${team.expected} AI(s) to register roles, agree distinct paths and mark ready. Work is blocked until then.`;
      } else {
        const index = team.participants.findIndex(
          (p) => p.agent.toLowerCase() === data.agent.toLowerCase(),
        );
        if(index>=0 && team.participants[index].control)throw new ApiError(423,"Your role is paused, stopped or removed. Only the owner can restore it.");
        if (data.action === "join") {
          if (team.phase !== "planning")
            throw new ApiError(
              409,
              "Work has already started. Ask the owner to start a new planning round before joining/changing roles.",
            );
          if (index < 0 && team.participants.filter(p=>p.control!=="removed").length >= team.expected)
            throw new ApiError(
              409,
              "All expected AI slots are filled. Ask the owner to increase the team size and restart planning.",
            );
          const participant = {
            agent: data.agent,
            role: data.role,
            paths: [...new Set(data.paths)],
            ready: false,
            done: false,
          };
          if (index < 0) team.participants.push(participant);
          else team.participants[index] = participant;
          for (const p of team.participants) p.ready = false;
          text = `@all ${data.agent} proposes role: ${data.role}. Paths: ${data.paths.join(", ")}. Review the roster and confirm ready again after any change.`;
        } else {
          if (index < 0)
            throw new ApiError(
              409,
              "Register your role and paths with action join first.",
            );
          if (data.action === "ready") {
            if (team.phase !== "planning")
              throw new ApiError(409, "This planning round has already ended.");
            for (let i = 0; i < team.participants.length; i++)
              for (let j = i + 1; j < team.participants.length; j++)
                for (const a of team.participants[i].paths)
                  for (const b of team.participants[j].paths)
                    if (team.participants[i].control!=="removed" && team.participants[j].control!=="removed" && scopesOverlap(a, b))
                      throw new ApiError(
                        409,
                        `Scope conflict: ${team.participants[i].agent} (${a}) overlaps ${team.participants[j].agent} (${b}). Discuss and update roles before marking ready.`,
                      );
            team.participants[index].ready = true;
            text = `${data.agent} confirmed their role and paths for round ${team.revision}.`;
            if (
              team.participants.filter(p=>p.control!=="removed").length === team.expected &&
              team.participants.filter(p=>p.control!=="removed").every((p) => p.ready)
            ) {
              team.phase = "active";
              text +=
                " @all All expected AIs are ready. Role planning is complete; read the final roster, acknowledge pings and begin your assigned tasks.";
            }
          } else {
            if (team.phase !== "active")
              throw new ApiError(409, "Work is not active.");
            team.participants[index].done = true;
            text = `@all ${data.agent} completed their role: ${team.participants[index].role}. Inspect their /commands and coordinate any follow-up.`;
            if (team.participants.filter(p=>p.control!=="removed").every((p) => p.done)) team.phase = "done";
          }
        }
      }
      await tx
        .update(projectRooms)
        .set({ team })
        .where(eq(projectRooms.id, room.id));
      await tx
        .insert(roomMessages)
        .values({
          connectionId: conn.id,
          roomId: room.id,
          agent: "Coordinator",
          text,
          kind: "decision",
          mentions: data.action==="manage" ? [data.agent.toLowerCase()] : ["all"],
        });
      return team;
    });
    return Response.json({ ok: true, team });
  } catch (e) {
    return apiError(e);
  }
}
