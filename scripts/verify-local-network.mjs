import assert from 'node:assert/strict';
import { networkInterfaces } from 'node:os';
const address=Object.values(networkInterfaces()).flat().find(x=>x?.family==='IPv4'&&!x.internal)?.address;
const host=process.env.LOCAL_APP_URL??`http://${address}:3000`;
async function call(path, method='GET',body,status=200,headers={}) {
 const response=await fetch(host+path,{method,headers:{Origin:host,...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
 const data=await response.json(); assert.equal(response.status,status,JSON.stringify(data)); return data;
}
const {token}=await call('/api/connections','POST',{name:'Disposable local IP regression'},201);
const base='/api/agent/'+token;
try {
 const {settings}=await call(base+'/features');
 await call(base+'/features','PATCH',{settings:{...settings,skills:true}});
 const room=(await call(base+'/rooms')).activeRoomId;
 const team=base+`/room/team?room=${room}`;
 assert.equal((await call(team,'POST',{action:'resize',expected:1})).team.expected,1);
 assert.equal((await call(team)).team.expected,1);
 await call(base+`/room?room=${room}`,'POST',{agent:'Owner',text:'Local IP owner message works'},201);
 await call('/api/plugin/pair','POST',{token});
 await call(base+'/control','POST',{action:'stop'});
 await call(base+'/control','POST',{paused:false});
 for(const headers of [{'cf-ray':'public'},{Origin:'https://untrusted.example'},{'x-forwarded-for':'203.0.113.2'},{Forwarded:'for=127.0.0.1'}]) {
  await call(base+'/features','GET',undefined,403,headers);
  await call(team,'POST',{action:'resize',expected:2},403,headers);
 }
 assert.equal((await call(team)).team.expected,1);
 console.log('PASS: local IP settings, saved expected agents, owner chat, pairing, stop/resume; public/cross-origin/proxy requests stay blocked.');
} finally {await call(base,'DELETE');}
