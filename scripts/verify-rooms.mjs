import assert from 'node:assert/strict';import 'dotenv/config';import pg from'pg';import{createHash}from'node:crypto';
const h='http://127.0.0.1:3000';async function call(url,method='GET',body,status=200,headers={}){const r=await fetch(url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
const{token}=await call(h+'/api/connections','POST',{name:'Disposable multi-room test'},201);const b=h+'/api/agent/'+token;const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try{
 const {settings}=await call(b+'/features');await call(b+'/features','PATCH',{settings:{...settings,room:true}});
 const{rows:[conn]}=await pool.query('select id from connections where token_hash=$1',[createHash('sha256').update(token).digest('base64url')]);
 await pool.query("insert into room_messages (connection_id,agent,text) values($1,'LegacyAgent','Original conversation preserved')",[conn.id]);
 let list=await call(b+'/rooms');assert.equal(list.rooms.length,1);const main=list.activeRoomId;
 let history=await call(b+'/room?room='+main);assert(history.messages.some(m=>m.text==='Original conversation preserved'));
 await call(b+'/room/team?room='+main,'POST',{action:'join',agent:'Builder',role:'Map',paths:['Workspace/Map']});
 const {room:newRoom}=await call(b+'/rooms','POST',{action:'create',name:'Garden planning'});assert.notEqual(newRoom.id,main);
 assert.equal((await call(b+'/room?room='+newRoom.id)).messages.length,0);assert.equal((await call(b+'/room/team?room='+newRoom.id)).team.participants.length,0);
 await call(b+'/room?room='+main,'POST',{agent:'Owner',text:'Should not post'},409);
 await call(b+'/room/team?room='+main,'POST',{action:'ready',agent:'Builder'},409);
 await call(b+'/rooms','POST',{action:'rename',id:main,name:'Original room'});assert((await call(b+'/rooms')).rooms.some(r=>r.name==='Original room'));
 await call(b+'/room?room='+newRoom.id,'POST',{agent:'Other',text:'@Owner New-room ping'},201);
 assert.equal((await call(b+'/room?room='+main+'&agent=Owner')).attention.unacknowledgedPings.some(p=>p.text==='@Owner New-room ping'),false);
 await pool.query("insert into room_messages (connection_id,room_id,agent,text) select $1,$2,'Fixture','History '||i from generate_series(1,105) i",[conn.id,main]);
 history=await call(b+'/room?room='+main);assert.equal(history.messages.length,100);assert.equal(history.hasOlder,true);
 const older=await call(b+'/room?room='+main+'&before='+history.olderCursor);assert(older.messages.some(m=>m.text==='Original conversation preserved'));
 await call(b+'/rooms','POST',{action:'activate',id:main});assert.equal((await call(b+'/room/team')).team.participants[0].agent,'Builder');
 await call(b+'/command','POST',{type:'create_instance',payload:{className:'Folder',parent:'Workspace'},agent:'Builder',room:newRoom.id},409);
 await call(b+'/rooms','POST',{action:'delete',id:main});list=await call(b+'/rooms');assert.equal(list.activeRoomId,newRoom.id);assert.equal(list.rooms.length,1);
 await call(b+'/room?room='+main,'GET',undefined,404);
 await call(b+'/rooms','POST',{action:'delete',id:newRoom.id},409);
 await call(b+'/rooms','POST',{action:'create',name:'Remote forbidden'},403,{'cf-ray':'test-public'});
 const{token:other}=await call(h+'/api/connections','POST',{name:'Disposable room isolation'},201);
 try{await call(h+'/api/agent/'+other+'/rooms','POST',{action:'rename',id:newRoom.id,name:'Cross project'},404);}finally{await call(h+'/api/agent/'+other,'DELETE');}
 console.log('Passed legacy-history migration, create/rename/switch/delete, isolated roles/pings, archived-room write rejection, old-message pagination, active-room fallback, last-room protection and project isolation.');
}finally{await call(b,'DELETE');await pool.end();}
