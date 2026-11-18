import assert from'node:assert/strict';
const host='http://127.0.0.1:3000';async function call(path,body,status=200,method=body?'POST':'GET'){const r=await fetch(host+path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
const {token}=await call('/api/connections',{name:'Disposable concurrent budget tests',mode:'vscode'},201),base='/api/agent/'+token;
try {
 const room=(await call(base+'/rooms')).activeRoomId,b=base+'/workbench?room='+room;
 const {key}=await call('/api/plugin/pair',{token});await fetch(host+'/api/plugin/poll',{method:'POST',headers:{'Content-Type':'application/json','x-plugin-key':key},body:JSON.stringify({client:'vscode',version:'vscode-0.2.0',noWait:true})});
 let profile=(await call(b,{action:'create',record:{kind:'profile',title:'One command at a time',status:'active',data:{agent:'Builder',commandLimit:1,byteLimit:1000000}}},201)).record;
 const request=agent=>fetch(host+base+'/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'code_read_file',payload:{path:'main.js'},agent,room,wait:false})});
 const concurrent=await Promise.all([request('Builder'),request('bUiLdEr')]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[202,403]);
 await call(base+'/command',{type:'code_read_file',payload:{path:'main.js'},room,wait:false},403);
 profile=(await call(b,{action:'update',id:profile.id,revision:profile.revision,record:{...profile,data:{...profile.data,commandLimit:100,byteLimit:100}}})).record;
 await call(base+'/command',{type:'code_read_file',payload:{path:'x'.repeat(200)},agent:'Builder',room,wait:false},403);
 profile=(await call(b,{action:'update',id:profile.id,revision:profile.revision,record:{...profile,data:{...profile.data,expires:'2020-01-01'}}})).record;
 await call(base+'/command',{type:'code_read_file',payload:{path:'main.js'},agent:'Builder',room,wait:false},403);
 await call(b,{action:'update',id:profile.id,revision:profile.revision,record:{...profile,status:'disabled'}});
 const repeated=await Promise.all([0,1].map(()=>call(base+'/command',{type:'code_read_file',payload:{path:'main.js'},agent:'Builder',room,nonce:'same-concurrent-nonce',wait:false},202)));assert.equal(repeated[0].id,repeated[1].id);
 console.log('PASS: parallel same-agent requests cannot exceed quota; case variants share limits; payload caps and expiry reject requests; missing identities are rejected with active profiles; concurrent nonce retries produce one command.');
}finally{await call(base,undefined,200,'DELETE');}
