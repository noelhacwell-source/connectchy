import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {readFileSync} from 'node:fs';
const host='http://127.0.0.1:3000';
async function call(url,method='GET',body,expected=200,headers={}){const r=await fetch(url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.equal(r.status,expected,JSON.stringify(d));return d;}
const created=await call(host+'/api/connections','POST',{name:'Disposable feature integration test'},201);
const base=host+'/api/agent/'+created.token;
const client=new Client({name:'studio-link-verification',version:'1.0.0'});
try {
 const initial=await call(base+'/features');await call(base+'/features','PATCH',{settings:{...initial.settings,room:false}});
 for(const endpoint of ['room','skills','tools','uploads'])await call(base+'/'+endpoint,'GET',undefined,403);
 let data=await call(base+'/features'); let settings={...data.settings,room:true,skills:true,mcps:true,servers:[{id:'mslearn-test',name:'Microsoft Learn',url:'https://learn.microsoft.com/api/mcp',enabled:true}],customSkills:[{id:'custom-test',name:'Test instructions',description:'Test',instructions:'Read the tree first.',enabled:true}]};
 await call(base+'/features','PATCH',{settings});
 let a=await call(base+'/room','POST',{agent:'AI-one',text:'Working on map',kind:'plan',paths:['Workspace/Map']},201);
 await call(base+'/room','POST',{agent:'AI-two',text:'I will handle GUI',kind:'progress',paths:['StarterGui']},201);
 let room=await call(base+'/room?after='+a.message.id);assert.equal(room.messages.length,1);assert.equal(room.messages[0].agent,'AI-two');
 assert.equal((await call(base+'/skills?id=custom-test')).skill.instructions,'Read the tree first.');
 let tools=await call(base+'/tools?server=studio');assert(tools.tools.some(t=>t.name==='get_tree'));
 let remote=await call(base+'/tools?server=mslearn-test');assert(remote.tools.length>0);console.log('Real remote MCP discovery passed:',remote.tools.map(t=>t.name).join(', '));
 const search=remote.tools.find(t=>t.name==='microsoft_docs_search');
 if(search){const result=await call(base+'/tools','POST',{server:'mslearn-test',name:search.name,arguments:{query:'Azure Blob Storage overview'}});assert(result.content?.length);console.log('Real remote MCP tool call passed');}
 await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp')));
 let native=await client.listTools();assert(native.tools.some(t=>t.name==='get_selection'));console.log('Native MCP handshake and tool listing passed');
 const publicOrigin=JSON.parse(readFileSync('.local-runtime/public-origin.json')).origin;
 await call(publicOrigin+'/api/agent/'+created.token+'/features','GET',undefined,403);
 let docs=await (await fetch(base)).text();assert(docs.includes('Shared communication room'));assert(docs.includes('Callable skills'));
 settings={...settings,room:false,skills:false,mcps:false};await call(base+'/features','PATCH',{settings});
 for(const endpoint of ['room','skills','tools'])await call(base+'/'+endpoint,'GET',undefined,403);
 docs=await(await fetch(base)).text();assert(!docs.includes('### Shared communication room'));assert(!docs.includes('### Callable skills'));
 console.log('Room isolation, toggles, custom skills, prompt docs and owner-only settings passed');
} finally {await client.close().catch(()=>{});await call(base,'DELETE');}
