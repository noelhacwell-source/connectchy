'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const excluded = new Set(['.git','.svn','.hg','.local-runtime','.ssh','.aws','.azure','.npmrc','.netrc','.pypirc','node_modules','bin','obj','.vs','.next','dist','build','coverage']);
function permitted(name) {
  const lower = name.toLowerCase();
  return !excluded.has(lower) && !(lower.startsWith('.env') && lower!=='.env.example') && !/\.(pem|key|pfx|p12|keystore)$/i.test(lower) && !/^id_(rsa|ed25519|ecdsa)/i.test(lower) && !/^credentials(\.|$)/i.test(lower);
}
const sha = text => createHash('sha256').update(text,'utf8').digest('hex');
class ProjectFiles {
  constructor(root) { this.root=path.resolve(root); }
  async resolve(relative='.', allowMissing=false) {
    if(typeof relative!=='string' || relative.includes('\0') || relative.includes(':') || path.isAbsolute(relative) || /^[\\/]/.test(relative)) throw new Error('Use a relative project path.');
    const segments=relative.replaceAll('\\','/').split('/').filter(p=>p && p!=='.');
    if(segments.some(p=>p==='..'||!permitted(p)||/[. ]$/.test(p))) throw new Error('Path is outside the project or contains an excluded file.');
    const root=await fs.realpath(this.root);
    let current=root;
    for(let i=0;i<segments.length;i++) {
      current=path.join(current,segments[i]);
      try {
        const stat=await fs.lstat(current);
        if(stat.isSymbolicLink())throw new Error('Symbolic links and junctions are excluded.');
      } catch(error) {
        if(error.code==='ENOENT' && allowMissing)continue;
        throw error;
      }
    }
    const actual=allowMissing?current:await fs.realpath(current);
    const rel=path.relative(root,actual);
    if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)) throw new Error('Path leaves the project root.');
    return actual;
  }
  relative(file) {return path.relative(this.root,file).split(path.sep).join('/');}
  async list(relative='.') {
    const start=await this.resolve(relative),files=[],pending=[start];let visited=0;
    while(pending.length&&files.length<2000&&visited++<10000) {
      const dir=pending.shift();
      const entries=await fs.readdir(dir,{withFileTypes:true});
      for(const entry of entries) {
        if(!permitted(entry.name)||entry.isSymbolicLink())continue;
        const full=path.join(dir,entry.name);
        if(entry.isDirectory())pending.push(full);
        else if(entry.isFile()&&files.length<2000)files.push(this.relative(full));
      }
    }
    return {files:files.sort(),truncated:pending.length>0||files.length>=2000};
  }
  async readDisk(relative) {
    const full=await this.resolve(relative),stat=await fs.stat(full);
    if(!stat.isFile()||stat.size>100000)throw new Error('Expected a text file of at most 100 KB.');
    const data=await fs.readFile(full);
    if(data.includes(0))throw new Error('Binary files are not supported.');
    return data.toString('utf8');
  }
}
module.exports={ProjectFiles,sha,permitted};
