import assert from 'node:assert/strict';import 'dotenv/config';import pg from 'pg';import{createHash}from'node:crypto';
const host='http://127.0.0.1:3000';async function call(url,body,status=200,headers={}){const r=await fetch(url,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
const{token}=await call(host+'/api/connections',{name:'Disposable individual agent control tests'},201),b=host+'/api/agent/'+token,pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try{
 const room=(await call(b+'/rooms')).activeRoomId,{key}=await call(host+'/api/plugin/pair',{token});
 for(const[agent,path]of [['Builder','Workspace/Map'],['Scripter','ServerScriptService/Main']])await call(b+'/room/team',{action:'join',agent,role:agent+' role',paths:[path]});
 await call(b+'/room/team',{action:'ready',agent:'Builder'});await call(b+'/room/team',{action:'ready',agent:'Scripter'});
 const conn=(await pool.query('select id from connections where token_hash=$1',[createHash('sha256').update(token).digest('base64url')])).rows[0];
 const queued=(await pool.query("insert into commands(connection_id,room_id,type,payload,status,agent)values($1,$2,'create_instance','{}','pending','Builder'),($1,$2,'create_instance','{}','pending','Scripter'),($1,$2,'create_instance','{}','sent','Builder') returning id,agent,status",[conn.id,room])).rows;
 const manage=operation=>call(b+'/room/team',{action:'manage',agent:'Builder',operation});
 await call(b+'/room/team',{action:'manage',agent:'Builder',operation:'pause'},403,{'cf-ray':'remote'});
 let team=(await manage('pause')).team;assert.equal(team.phase,'active');assert.equal(team.participants[0].control,'paused');assert.equal(team.participants[1].ready,true);
 assert.equal((await call(b+'/control?agent=Builder')).paused,true);assert.equal((await call(b+'/control?agent=Scripter')).paused,false);
 const rows=(await pool.query('select id,status from commands where connection_id=$1',[conn.id])).rows;assert.equal(rows.find(r=>r.id===queued[0].id).status,'error');assert.equal(rows.find(r=>r.id===queued[1].id).status,'pending');
 assert.equal((await call(host+'/api/plugin/control?command='+queued[2].id,undefined,200,{'x-plugin-key':key})).paused,true);
 const late=(await pool.query("insert into commands(connection_id,room_id,type,payload,status,agent)values($1,$2,'get_tree','{}','pending','Builder')returning id",[conn.id,room])).rows[0];
 const dispatched=await call(host+'/api/plugin/poll',{version:'control-test'},200,{'x-plugin-key':key});assert(dispatched.commands.some(c=>c.id===queued[1].id));assert(!dispatched.commands.some(c=>c.id===late.id));
 await call(b+'/command',{agent:'Builder',type:'get_tree',payload:{}},423);
 await call(b+'/room',{agent:'Builder',text:'Blocked work'},423);
 await call(b+'/room',{action:'ack',agent:'Builder',through:0});
 await call(b+'/workspace',{action:'create',agent:'Builder',entry:{kind:'note',title:'Blocked'}},423);
 await call(b+'/tools',{server:'studio',name:'get_tree',arguments:{_agent:'Builder'}},423);
 await call(b+'/room/team',{action:'join',agent:'Builder',role:'Bypass',paths:['Lighting']},423);
 await manage('resume');assert.equal((await call(b+'/control?agent=Builder')).paused,false);
 await manage('stop');assert.equal((await call(b+'/control?agent=Builder')).paused,true);await manage('resume');
 team=(await manage('remove')).team;assert.equal(team.expected,1);assert.equal(team.participants[0].control,'removed');assert.equal(team.phase,'active');
 await call(b+'/room/team',{action:'reset'});await call(b+'/room/team',{action:'join',agent:'Builder',role:'Bypass',paths:['Lighting']},423);
 team=(await manage('restore')).team;assert.equal(team.participants[0].control,undefined);assert.equal(team.phase,'planning');assert.equal(team.participants[0].ready,false);
 console.log('PASS: owner-only per-agent pause/stop/resume/remove/restore, unaffected teammate, command cancellation, delivered-command protection, control signals, blocked chat/workspace/MCP calls, acknowledgement access, reset persistence and restore replanning.');
}finally{await fetch(b,{method:'DELETE'});await pool.end();}
