import{findByPluginKey,noStore}from'@/lib/bridge';
import {db} from '@/db';
import {commands} from '@/db/schema';
import {and,eq} from 'drizzle-orm';
import {agentControlError} from '@/lib/room-coordination';
export const dynamic='force-dynamic';
export async function GET(req:Request){const conn=await findByPluginKey(req.headers.get('x-plugin-key'));if(!conn)return Response.json({error:'Unknown plugin key'},{status:401,headers:noStore});const id=new URL(req.url).searchParams.get('command');let blocked=false;if(id){if(!/^\d+$/.test(id))return Response.json({paused:true},{headers:noStore});const [cmd]=await db.select().from(commands).where(and(eq(commands.id,Number(id)),eq(commands.connectionId,conn.id)));blocked=!cmd||cmd.status!=="sent"||(cmd.source!=="dashboard"&&!!await agentControlError(conn,cmd.agent));}return Response.json({paused:!!conn.paused||blocked,stopRevision:conn.stopRevision},{headers:noStore});}
