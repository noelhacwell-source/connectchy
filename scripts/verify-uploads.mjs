import 'dotenv/config';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { createHash } from 'node:crypto';
const host='http://127.0.0.1:3000';
const originalFetch=globalThis.fetch;
async function call(url,method='GET',body){const r=await originalFetch(url,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const d=await r.json();assert(r.ok,JSON.stringify(d));return d;}
let token; const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try {
 token=(await call(host+'/api/connections','POST',{name:'Disposable mocked upload test'})).token;
 const base=host+'/api/agent/'+token;
 let {settings}=await call(base+'/features');settings={...settings,uploads:true,creatorId:'12345'};
 await call(base+'/features','PATCH',{settings,robloxKey:'FAKE_TEST_KEY_DO_NOT_USE'});
 const rows=await pool.query('select credentials from connections where token_hash=$1',[createHash('sha256').update(token).digest('base64url')]);assert(!rows.rows[0].credentials.includes('FAKE_TEST_KEY'));assert(!(await(await originalFetch(base)).text()).includes('FAKE_TEST_KEY'));
 await build({entryPoints:['src/app/api/agent/[token]/uploads/route.ts'],outfile:'.local-runtime/test-upload-route.mjs',bundle:true,platform:'node',format:'esm',packages:'external',tsconfig:'tsconfig.json'});
 const route=await import(pathToFileURL(path.resolve('.local-runtime/test-upload-route.mjs')));
 let uploadCalls=0;let mode='success';let expectedType='Image',expectedMime='image/png';
 globalThis.fetch=async(url,init)=>{
  assert(String(url).startsWith('https://apis.roblox.com/assets/v1/'));
  assert.equal(init.headers['x-api-key'],'FAKE_TEST_KEY_DO_NOT_USE');
  if(init.method==='POST'){
   uploadCalls++;const request=JSON.parse(init.body.get('request'));assert.equal(request.creationContext.creator.userId,'12345');assert.equal(request.assetType,expectedType);assert.equal(init.body.get('fileContent').type,expectedMime);
   return mode==='success'?Response.json({path:'operations/mock-operation',done:false}):Response.json({message:'Test rejection'},{status:403});
  }
  return Response.json({path:'operations/mock-operation',done:true,response:{assetId:'9990001',moderationResult:{moderationState:'MODERATION_STATE_APPROVED'}}});
 };
 const ctx={params:Promise.resolve({token})};
 function request(id,filename='test.png'){const f=new FormData();f.set('file',new File([new Uint8Array([137,80,78,71])],filename));f.set('name','Test asset');f.set('requestId',id);return new Request(base+'/uploads',{method:'POST',body:f});}
 let r=await route.POST(request('one'),ctx);assert.equal(r.status,202);let d=await r.json();const id=d.upload.id;
 r=await route.POST(request('one'),ctx);assert.equal(r.status,200);assert.equal((await r.json()).reused,true);assert.equal(uploadCalls,1);
 r=await route.GET(new Request(base+'/uploads?id='+id),ctx);d=await r.json();assert.equal(d.upload.state,'done');assert.equal(d.upload.result.response.assetId,'9990001');
 r=await route.POST(request('bad-file','test.obj'),ctx);assert.equal(r.status,400);assert.equal(uploadCalls,1);
 mode='reject';r=await route.POST(request('two'),ctx);assert.equal(r.status,502);assert.equal(uploadCalls,2);
 r=await route.POST(request('two'),ctx);d=await r.json();assert.equal(d.upload.state,'submission_error');assert.equal(uploadCalls,2);
 mode='success';expectedType='Audio';expectedMime='audio/mpeg';
 r=await route.POST(request('audio-one','chime.mp3'),ctx);assert.equal(r.status,202);
 settings.modules.audioUploads=false;await call(base+'/features','PATCH',{settings});
 r=await route.POST(request('audio-disabled','chime.mp3'),ctx);assert.equal(r.status,403);assert.equal(uploadCalls,3);
 globalThis.fetch=originalFetch;
 settings.uploads=false;await call(base+'/features','PATCH',{settings});
 r=await route.POST(request('three'),ctx);assert.equal(r.status,403);
 console.log('Mocked Roblox upload, processing, idempotent retry, format rejection, upstream errors, encrypted credentials and disable enforcement passed. No Roblox assets created.');
} finally {globalThis.fetch=originalFetch;if(token)await call(host+'/api/agent/'+token,'DELETE');await pool.end();}
process.exit(0);
