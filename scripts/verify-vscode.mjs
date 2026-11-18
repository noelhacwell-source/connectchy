import assert from 'node:assert/strict';
const host='http://127.0.0.1:3000';
async function call(path,body,status=200,method=body?'POST':'GET',headers={}){const r=await fetch(host+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
const {token}=await call('/api/connections',{name:'Disposable VS Code mode test',mode:'vscode'},201),base='/api/agent/'+token;
try {
 assert.equal((await call(base+'/status')).mode,'vscode');
 let {settings}=await call(base+'/features');await call(base+'/features',{settings:{...settings,mode:'roblox',mcps:true}},200,'PATCH');settings=(await call(base+'/features')).settings;assert.equal(settings.mode,'vscode');
 const {key}=await call('/api/plugin/pair',{token}),headers={'x-plugin-key':key};
 await call('/api/plugin/poll',{version:'1.3.0',noWait:true},403,'POST',headers);
 await call('/api/plugin/poll',{client:'vscode',version:'vscode-0.1.0',noWait:true,place:{name:'Fixture folder'}},200,'POST',headers);
 await call(base+'/command',{type:'run_luau',payload:{code:'return 1'},source:'dashboard',wait:false},400);
 const room=(await call(base+'/rooms')).activeRoomId,team=base+'/room/team?room='+room;
 for(const agent of ['Builder','Tester'])await call(team,{action:'join',agent,role:agent,paths:[agent==='Builder'?'src':'tests']});
 for(const agent of ['Builder','Tester'])await call(team,{action:'ready',agent});
 for(const agent of ['Builder','Tester']) {const pings=await call(base+'/room?room='+room+'&agent='+agent);if(pings.attention.unacknowledgedPings.length)await call(base+'/room?room='+room,{action:'ack',agent,through:pings.attention.unacknowledgedPings.at(-1).id});}
 const cmd=await call(base+'/command',{type:'code_write_file',payload:{path:'src/main.js',content:'updated',expectedSha256:'fixture'},agent:'Builder',room,wait:false},202);
 const delivered=await call('/api/plugin/poll',{client:'vscode',version:'vscode-0.1.0'},200,'POST',headers);assert(delivered.commands.some(c=>c.id===cmd.id&&c.agent==='Builder'));
 await call('/api/plugin/poll',{client:'vscode',noWait:true,results:[{id:cmd.id,ok:true,json:JSON.stringify({value:{saved:true}})}]},200,'POST',headers);
 assert.equal((await call(base+'/commands?id='+cmd.id)).result.saved,true);
 const tools=await call(base+'/tools?server=studio');assert(tools.tools.some(t=>t.name==='code_read_file'));assert(!tools.tools.some(t=>t.name==='run_luau'));
 const docs=await(await fetch(host+base)).text();assert(docs.includes('Visual Studio Code'));assert(docs.includes('code_write_file'));assert(!docs.includes('Playtests: use POST'));
 await call(team,{action:'manage',agent:'Builder',operation:'remove',keepSlot:true});
 await call(base+'/command',{type:'code_read_file',payload:{path:'src/main.js'},agent:'Builder',room,wait:false},423);
 await call(team,{action:'join',agent:'NewBuilder',role:'Replacement',paths:['src']});assert.equal((await call(team)).team.expected,2);
 await call(base+'/control',{action:'stop'});await call(base+'/command',{type:'code_read_file',payload:{path:'src/main.js'},source:'dashboard',wait:false},423);
 await call(base+'/control',{paused:false});
 const other=await call('/api/connections',{name:'Disposable Roblox isolation test'},201);try{const {key:otherKey}=await call('/api/plugin/pair',{token:other.token});await call('/api/plugin/poll',{client:'vscode',noWait:true},403,'POST',{'x-plugin-key':otherKey});await call('/api/agent/'+other.token+'/command',{type:'code_get_workspace',payload:{},source:'dashboard',wait:false},400);}finally{await call('/api/agent/'+other.token,undefined,200,'DELETE');}
 console.log('PASS: VS Code mode, immutable mode settings, client isolation, two-AI readiness, file command delivery/results, MCP and agent docs, removed-agent blocking, replacement in same room, owner Stop and Roblox isolation.');
}finally{await call(base,undefined,200,'DELETE');}
