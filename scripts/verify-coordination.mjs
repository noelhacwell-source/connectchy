import assert from 'node:assert/strict';
import pg from 'pg';import 'dotenv/config';
const host='http://127.0.0.1:3000';
async function call(url,method='GET',body,status=200,headers={}){const r=await fetch(url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
const {token}=await call(host+'/api/connections','POST',{name:'Disposable role and ping tests'},201);const base=host+'/api/agent/'+token;const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try{
 let {settings}=await call(base+'/features');await call(base+'/features','PATCH',{settings:{...settings,room:true,mcps:true}});
 const edit={type:'create_instance',payload:{className:'Folder',parent:'Workspace',name:'Test'},agent:'Builder',wait:false};
 let denied=await call(base+'/command','POST',edit,409);assert(denied.error.includes('blocked'));
 await call(base+'/room/team','POST',{action:'join',agent:'Builder',role:'Map layout',paths:['Workspace/Map']});
 let team=(await call(base+'/room/team','POST',{action:'ready',agent:'Builder'})).team;assert.equal(team.phase,'planning');
 await call(base+'/command','POST',edit,409);
 await call(base+'/room/team','POST',{action:'join',agent:'Scripter',role:'Map scripts',paths:['Workspace/Map/Script']});
 await call(base+'/room/team','POST',{action:'ready',agent:'Scripter'},409);
 await call(base+'/room/team','POST',{action:'join',agent:'Scripter',role:'Server logic',paths:['ServerScriptService/GameLogic']});
 team=(await call(base+'/room/team')).team;assert(team.participants.every(p=>!p.ready));
 const ready=await Promise.all([call(base+'/room/team','POST',{action:'ready',agent:'Builder'}),call(base+'/room/team','POST',{action:'ready',agent:'Scripter'})]);assert(ready.some(d=>d.team.phase==='active'));
 await call(base+'/room/team','POST',{action:'join',agent:'LateAgent',role:'Other',paths:['Lighting']},409);
 let room=await call(base+'/room?agent=Builder');assert(room.attention.unacknowledgedPings.length>0);
 await call(base+'/room','POST',{action:'ack',agent:'Builder',through:room.attention.unacknowledgedPings.at(-1).id});
 const ping=(await call(base+'/room','POST',{agent:'Scripter',text:'@Builder please review this',mentions:['Owner'],kind:'question'},201)).message;
 room=await call(base+'/room?agent=Builder&after='+ping.id);assert.equal(room.messages.length,0);assert(room.attention.unacknowledgedPings.some(p=>p.id===ping.id));
 denied=await call(base+'/command','POST',edit,409);assert(denied.error.includes('ping'));
 assert((await call(base+'/room?agent=Owner')).attention.unacknowledgedPings.some(p=>p.id===ping.id));
 await call(base+'/room','POST',{action:'ack',agent:'Builder',through:ping.id});
 // Simulate connectivity for this disposable project only. No real Studio receives these commands.
 await pool.query('update connections set last_seen_at=now() where token_hash=$1',[(await import('node:crypto')).createHash('sha256').update(token).digest('base64url')]);
 await call(base+'/command','POST',edit,202);
 await call(base+'/room/team','POST',{action:'done',agent:'Builder'});
 await call(base+'/command','POST',{...edit,nonce:'after-done'},409);
 await call(base+'/room/team','POST',{action:'configure',expected:1},200);
 await call(base+'/room/team','POST',{action:'configure',expected:1},403,{'cf-ray':'test-public'});
 await call(base+'/command','POST',{...edit,source:'dashboard'},403,{'cf-ray':'test-public'});
 await call(base+'/room/team','POST',{action:'join',agent:'Solo',role:'Single agent',paths:['Workspace/Solo']});
 team=(await call(base+'/room/team','POST',{action:'ready',agent:'Solo'})).team;assert.equal(team.phase,'active');
 console.log('Passed: empty-room gate, expected quorum, concurrent readiness, conflicting paths, late joins, priority pings beyond cursor, explicit acknowledgement, done-role gate, solo setup and owner-only controls.');
}finally{await call(base,'DELETE');await pool.end();}
