import assert from 'node:assert/strict';
const host='http://127.0.0.1:3000';
async function call(path,body,status=200,method=body?'POST':'GET') {const r=await fetch(host+path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
const {token}=await call('/api/connections',{name:'Disposable AI replacement test'},201);
const base='/api/agent/'+token;
try {
 const room=(await call(base+'/rooms')).activeRoomId,team=base+`/room/team?room=${room}`,chat=base+`/room?room=${room}`;
 for(const agent of ['OldAI','Teammate'])await call(team,{action:'join',agent,role:agent,paths:['Workspace/'+agent]});
 for(const agent of ['OldAI','Teammate'])await call(team,{action:'ready',agent});
 const message=(await call(chat,{agent:'Owner',text:'Keep this conversation'},201)).message;
 await call(team,{action:'manage',agent:'OldAI',operation:'remove',keepSlot:true});
 let result=(await call(team)).team;assert.equal(result.expected,2);assert.equal(result.phase,'planning');assert.equal(result.participants.find(p=>p.agent==='OldAI').control,'removed');assert(result.participants.some(p=>p.agent==='Teammate'));
 await call(team,{action:'join',agent:'OldAI',role:'Bypass',paths:['Workspace/OldAI']},423);
 await call(team,{action:'join',agent:'NewAI',role:'Replacement',paths:['Workspace/OldAI']});
 for(const agent of ['NewAI','Teammate'])await call(team,{action:'ready',agent});
 result=(await call(team)).team;assert.equal(result.phase,'active');
 assert((await call(chat)).messages.some(m=>m.id===message.id));
 console.log('PASS: old AI removed and blocked; new AI takes its slot and paths in the same room; teammate and chat history preserved; ready team resumes.');
}finally{await call(base,undefined,200,'DELETE');}
