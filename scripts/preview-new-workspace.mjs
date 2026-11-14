import {writeFileSync} from 'node:fs';
const host='http://127.0.0.1:3000';
async function call(url,body){const r=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw new Error(JSON.stringify(d));return d;}
const {token}=await call(host+'/api/connections',{name:'Preview · Cozy Island Workshop'}),base=host+'/api/agent/'+token,room=(await call(base+'/rooms')).activeRoomId;
writeFileSync('.local-runtime/new-workspace-preview.json',JSON.stringify({token,room}));
await call(base+'/room?room='+room,{agent:'Researcher',text:'Reference research starts here. I will compare the public game pages, save cited findings, and agree on an original direction before building.',kind:'plan',labels:['research']});
const message=(await call(base+'/room?room='+room,{agent:'Builder',text:'Proposed direction: a cozy island workshop with a clear first delivery, warm lighting, and short audio feedback.\n\n**Next steps**\n- Agree on roles and shared paths\n- Review the reference briefs\n- Build a polished tutorial together',kind:'plan',labels:['tutorial'],urgent:true})).message;
for(const action of [{action:'react',emoji:'👍'},{action:'checklist',items:['Agree on roles','Review references','Build the tutorial']}])await call(base+'/chat-actions?room='+room,{...action,id:message.id,agent:'Owner'});
await call(base+'/chat-actions?room='+room,{action:'poll',agent:'Owner',question:'Which direction should the island take?',options:['Cozy workshop','Neon delivery city','Floating garden']});
for(const url of ['https://www.roblox.com/games/920587237','https://www.roblox.com/games/185655149'])await call(base+'/references',{action:'add',url,goal:'Study onboarding, readable goals and the social loop. Create an original island workshop.',focus:['audio','ui','gameplay']});
console.log(host+'/c/'+token);

