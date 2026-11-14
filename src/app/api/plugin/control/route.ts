import{findByPluginKey,noStore}from'@/lib/bridge';
export const dynamic='force-dynamic';
export async function GET(req:Request){const conn=await findByPluginKey(req.headers.get('x-plugin-key'));if(!conn)return Response.json({error:'Unknown plugin key'},{status:401,headers:noStore});return Response.json({paused:!!conn.paused,stopRevision:conn.stopRevision},{headers:noStore});}
