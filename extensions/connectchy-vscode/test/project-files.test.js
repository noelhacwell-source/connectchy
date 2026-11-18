'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {ProjectFiles,sha}=require('../src/project-files');
test('project boundary, secret exclusions, binary and oversized files',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'connectchy-files-'));
  try {
    await fs.mkdir(path.join(root,'src'));await fs.writeFile(path.join(root,'src','main.js'),'hello');
    await fs.writeFile(path.join(root,'.env'),'SECRET=private');await fs.writeFile(path.join(root,'.env.example'),'SECRET=example');
    await fs.writeFile(path.join(root,'binary.bin'),Buffer.from([1,0,2]));await fs.writeFile(path.join(root,'large.txt'),'x'.repeat(100001));
    const files=new ProjectFiles(root),listing=await files.list();
    assert(listing.files.includes('src/main.js'));assert(listing.files.includes('.env.example'));assert(!listing.files.includes('.env'));
    for(const bad of ['../outside','src/../../outside','C:\\Windows\\win.ini','\\\\server\\share','src/main.js:stream','.env','.git/config','src/trailing.'])await assert.rejects(()=>files.resolve(bad,true));
    assert.equal(await files.readDisk('src/main.js'),'hello');assert.equal(sha('hello').length,64);
    await assert.rejects(()=>files.readDisk('binary.bin'));await assert.rejects(()=>files.readDisk('large.txt'));
    await assert.rejects(()=>files.resolve('src/ghost.js'));assert.equal(await files.resolve('src/ghost.js',true),path.join(root,'src','ghost.js'));
    const outside=await fs.mkdtemp(path.join(os.tmpdir(),'connectchy-outside-'));
    try {await fs.symlink(outside,path.join(root,'linked'),'junction');await assert.rejects(()=>files.resolve('linked',true));assert(!(await files.list()).files.some(f=>f.startsWith('linked/')));}finally{await fs.rm(outside,{recursive:true,force:true});}
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
