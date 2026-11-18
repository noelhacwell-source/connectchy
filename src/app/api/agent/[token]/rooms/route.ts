import { purgeRooms } from "@/lib/delete-rooms";
import { studioActor } from "@/lib/studio-access";
import { modules } from "@/lib/modules";
import { and, asc, eq, isNull, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { connections, projectRooms } from "@/db/schema";
import { project, type Context } from "@/lib/project-api";
import { ensureActiveRoom } from "@/lib/project-rooms";
import { apiError, ApiError, jsonBody, ownerRequest } from "@/lib/http-utils";
export const dynamic = "force-dynamic";
export async function GET(req:Request,ctx:Context){
  try{const{conn}=await project(ctx);const active=await ensureActiveRoom(conn.id);
    const archived=new URL(req.url).searchParams.get("archived")==="1";
    const rooms=await db.select().from(projectRooms).where(and(eq(projectRooms.connectionId,conn.id),archived?isNotNull(projectRooms.deletedAt):isNull(projectRooms.deletedAt))).orderBy(asc(projectRooms.createdAt),asc(projectRooms.id));
    return Response.json({activeRoomId:active.id,rooms},{headers:{"Cache-Control":"no-store"}});
  }catch(e){return apiError(e);}
}
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("create"),name:z.string().trim().min(1).max(80)}),
  z.object({action:z.literal("rename"),id:z.number().int().positive(),name:z.string().trim().min(1).max(80)}),
  z.object({action:z.enum(["activate","delete","restore","purge"]),id:z.number().int().positive()}),
]);
export async function POST(req:Request,ctx:Context){
  try{const{conn}=await project(ctx);if(!modules(conn.features.modules).roomManagement)throw new ApiError(403,"Multiple-room management is disabled.");await ensureActiveRoom(conn.id);
    const parsed=schema.safeParse(await jsonBody(req,4000));if(!parsed.success)throw new ApiError(400,"Provide a room action, ID and a name of 1–80 characters where required.");const data=parsed.data;
    const actor=data.action==="purge"?await studioActor(req,conn):null;
    if(!actor)ownerRequest(req);
    const result=await db.transaction(async tx=>{
      if (data.action === "purge") await tx.execute(sql`select pg_advisory_xact_lock(${conn.id})`);
      const[current]=await tx.select().from(connections).where(eq(connections.id,conn.id)).for("update");
      if(data.action==="create"){
        const[room]=await tx.insert(projectRooms).values({connectionId:conn.id,name:data.name}).returning();
        await tx.update(connections).set({activeRoomId:room.id}).where(eq(connections.id,conn.id));return{room,activeRoomId:room.id};
      }
      const[room]=await tx.select().from(projectRooms).where(and(eq(projectRooms.id,data.id),eq(projectRooms.connectionId,conn.id),data.action==="purge"?undefined:data.action==="restore"?isNotNull(projectRooms.deletedAt):isNull(projectRooms.deletedAt))).for("update");
      if(!room)throw new ApiError(404,"Room not found in this project.");
      if(data.action==="restore"){await tx.update(projectRooms).set({deletedAt:null}).where(eq(projectRooms.id,room.id));return{room,activeRoomId:current.activeRoomId};}
      if(data.action==="rename"){const[renamed]=await tx.update(projectRooms).set({name:data.name}).where(eq(projectRooms.id,room.id)).returning();return{room:renamed,activeRoomId:current.activeRoomId};}
      if(data.action==="activate"){await tx.update(connections).set({activeRoomId:room.id}).where(eq(connections.id,conn.id));return{room,activeRoomId:room.id};}
      if (data.action === "purge") return purgeRooms(tx, conn.id, current.activeRoomId, [room.id], actor?.id ?? 0);
      const[replacement]=await tx.select().from(projectRooms).where(and(eq(projectRooms.connectionId,conn.id),isNull(projectRooms.deletedAt),ne(projectRooms.id,room.id))).orderBy(asc(projectRooms.id)).limit(1);
      if(!replacement)throw new ApiError(409,"Keep at least one room. Create another room before deleting this one.");
      await tx.update(projectRooms).set({deletedAt:new Date()}).where(eq(projectRooms.id,room.id));
      const activeRoomId=current.activeRoomId===room.id?replacement.id:current.activeRoomId;
      await tx.update(connections).set({activeRoomId}).where(eq(connections.id,conn.id));return{activeRoomId};
    });return Response.json({ok:true,...result});
  }catch(e){return apiError(e);}
}
