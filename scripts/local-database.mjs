import { Client } from 'pg';
import { spawn } from 'node:child_process';
import { existsSync, openSync, closeSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

export async function ensureDatabase(connectionString) {
  if (!connectionString) throw new Error('DATABASE_URL is missing. Configure it in .env before starting the app.');
  const url = new URL(connectionString);
  async function ready() {
    const client = new Client({ connectionString, connectionTimeoutMillis: 1000 });
    try { await client.connect(); await client.query('SELECT 1'); return true; }
    catch { return false; }
    finally { await client.end().catch(() => {}); }
  }
  if (await ready()) return;
  const legacy = path.resolve('.local-runtime/database.mjs');
  const script = existsSync(legacy) ? legacy : path.resolve('scripts/embedded-database.mjs');
  const portFile=path.resolve('.local-runtime/embedded-port');
  const managedPort=existsSync(portFile)?readFileSync(portFile,'utf8').trim():'55432';
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== managedPort || url.pathname !== '/studio_link' || !existsSync(script)) {
    throw new Error('Database unavailable. Start the PostgreSQL server configured in DATABASE_URL, then retry.');
  }
  const lockPath=path.resolve('.local-runtime/database-start.lock');
  let lock;
  for(let attempt=0;attempt<40;attempt++) {
    try {lock=openSync(lockPath,'wx');writeFileSync(lock,String(process.pid));break;}
    catch(error) {
      if(error.code!=='EEXIST')throw error;
      if(await ready())return;
      try {
        const pid=Number(readFileSync(lockPath,'utf8'));let alive=true;
        if(Number.isInteger(pid)&&pid>0){try{process.kill(pid,0);}catch(e){alive=e.code!=='ESRCH';}}
        else alive=Date.now()-statSync(lockPath).mtimeMs<10000;
        if(!alive)rmSync(lockPath,{force:true});
      }catch{/* The other starter may have just released the lock. */}
      await new Promise(resolve=>setTimeout(resolve,500));
    }
  }
  if(lock===undefined)throw new Error('Another local database startup is still in progress. Retry shortly.');
  try {
  if(await ready())return;
  console.log('Starting the local database…');
  const output = openSync(path.resolve('.local-runtime/database-startup.log'), 'a');
  let child;
  try {
    child = spawn(process.execPath, [script], { detached: true, windowsHide: true, stdio: ['ignore', output, output] });
    child.on('error', () => {});
    child.unref();
  } finally { closeSync(output); }
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await ready()) { console.log('Local database ready.'); return; }
    if (child.exitCode !== null || child.signalCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Local database could not start. See .local-runtime/database-startup.log. Existing data has been preserved.');
  } finally {
    closeSync(lock);
    try{if(readFileSync(lockPath,'utf8')===String(process.pid))rmSync(lockPath,{force:true});}catch{/* A stale lock is cleaned on the next startup. */}
  }
}

export function watchDatabase(connectionString) {
  let checking=false,failed=false;
  const timer=setInterval(async()=>{
    if(checking)return;checking=true;
    try {await ensureDatabase(connectionString);if(failed)console.log('Database connection recovered.');failed=false;}
    catch(error){if(!failed)console.error('Database recovery will retry:',error.message);failed=true;}
    finally{checking=false;}
  },10000);
  timer.unref();
  return ()=>clearInterval(timer);
}
