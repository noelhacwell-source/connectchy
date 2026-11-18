import assert from 'node:assert/strict';
import lua from '../.local-runtime/node_modules/luaparse/luaparse.js';
const host='http://127.0.0.1:3000';
async function call(path,body,status=200,method=body?'POST':'GET',headers={}) {const r=await fetch(host+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
const {token}=await call('/api/connections',{name:'Disposable playtest verification'},201),base='/api/agent/'+token;
try {
 const {key}=await call('/api/plugin/pair',{token});
 const pluginHeaders={'x-plugin-key':key};
 await call('/api/plugin/poll',{noWait:true,version:'1.2.1'},200,'POST',pluginHeaders);
 await call(base+'/command',{source:'dashboard',type:'run_playtest',payload:{},wait:false},409);
 await call('/api/plugin/poll',{noWait:true,version:'1.3.0'},200,'POST',pluginHeaders);
 for(const payload of [{mode:'invalid'},{duration:0},{duration:61},{duration:1.5},{code:123}])await call(base+'/command',{source:'dashboard',type:'run_playtest',payload,wait:false},400);
 const cmd=await call(base+'/command',{source:'dashboard',type:'run_playtest',payload:{mode:'run',duration:2},nonce:'one-test',wait:false},202);
 const duplicate=await call(base+'/command',{source:'dashboard',type:'run_playtest',payload:{mode:'run',duration:2},nonce:'one-test',wait:false},202);assert.equal(cmd.id,duplicate.id);
 const dispatch=await call('/api/plugin/poll',{version:'1.3.0'},200,'POST',pluginHeaders);assert(dispatch.commands.some(c=>c.id===cmd.id));
 await call('/api/plugin/poll',{noWait:true,results:[{id:cmd.id,ok:true,json:JSON.stringify({value:{passed:false,runtimeErrors:1,logs:[{message:'Assertion failed'}]}})}]},200,'POST',pluginHeaders);
 const result=await call(base+'/commands?id='+cmd.id);assert.equal(result.ok,true);assert.equal(result.result.passed,false);
 const response=await fetch(host+'/api/plugin/download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,format:'lua'})});const source=await response.text();lua.parse(source,{luaVersion:'5.1'});
 const runner=source.match(/local source = \[\[([\s\S]*?)\]\]/)[1].replace('__CONNECTCHY_CHECKS__',"task.wait(0.1); assert(workspace, 'Missing workspace'); return 'ok'");lua.parse(runner,{luaVersion:'5.1'});
 assert(source.includes('runner:Destroy()'));assert(source.includes('ExecutePlayModeAsync'));assert(source.includes('ExecuteRunModeAsync'));assert(source.includes('noWait=true'));
 const docs=await(await fetch(host+base)).text();assert(docs.includes('run_playtest'));
 console.log('PASS: old plugin gate, input validation, idempotency, queue/results with failed assertions, plugin and server-runner Lua syntax, Play/Run methods, cleanup and heartbeat wiring, agent documentation. No game was modified.');
}finally{await call(base,undefined,200,'DELETE');}
