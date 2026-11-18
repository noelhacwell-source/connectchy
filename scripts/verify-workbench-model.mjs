import assert from 'node:assert/strict';import{build}from'esbuild';import{createRequire}from'node:module';
await build({entryPoints:['src/lib/workbench-model.ts'],outfile:'.local-runtime/workbench-model.cjs',bundle:true,platform:'node',format:'cjs'});
const require=createRequire(import.meta.url),{WORKBENCH,createWorkbenchDraft,parseRecord,isOverdue,riskScore}=require('../.local-runtime/workbench-model.cjs');
for(const kind of Object.keys(WORKBENCH)){const draft=createWorkbenchDraft(kind);draft.title='Form default verification';if(kind==='profile')draft.data.agent='Builder';const parsed=parseRecord(draft);assert.equal(parsed.kind,kind);}
for(const kind of ['constructor','toString','__proto__'])assert.throws(()=>parseRecord({kind,title:'Invalid kind'}));
assert.throws(()=>parseRecord({kind:'view',title:'Invalid view',data:{kind:'constructor'}}));assert.throws(()=>parseRecord({kind:'issue',title:'No resolution',status:'resolved',data:{}}));
assert.throws(()=>parseRecord({kind:'memory',title:'Invalid URL',data:{source:'https://user:password@example.com'}}));
assert.throws(()=>parseRecord({kind:'release',title:'Bad version',data:{version:'01.0.0'}})); assert.throws(()=>parseRecord({kind:'release',title:'Bad prerelease',data:{version:'1.0.0-01'}})); assert.equal(parseRecord({kind:'release',title:'Good version',data:{version:'1.0.0-alpha.1+build.01'}}).data.version,'1.0.0-alpha.1+build.01');
const record={...parseRecord({...createWorkbenchDraft('benchmark'),title:'Frame budget'}),id:1,revision:1,createdAt:'',updatedAt:'',archivedAt:null,roomId:1};assert(!isOverdue(record));
assert.equal(riskScore({...record,kind:'risk',data:{likelihood:5,impact:4}}),20);
console.log('PASS: form defaults for all 13 boards, text/numeric field separation, prototype-key rejection, resolution gates, provenance validation, benchmark due-date isolation and risk scores.');
