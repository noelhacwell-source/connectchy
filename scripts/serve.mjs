import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
const dir = path.resolve('.local-runtime');
mkdirSync(dir, { recursive: true });
const state = path.join(dir, 'public-origin.json');
let existing;
try {
  existing = JSON.parse(readFileSync(state, 'utf8'));
  if (!Number.isInteger(existing.pid) || existing.pid <= 0 || !/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(existing.origin)) existing = undefined;
  if (existing) process.kill(existing.pid, 0);
} catch { existing = undefined; }
if (existing && process.argv.includes('--tunnel-only')) {
  console.log(`Public tunnel is already running: ${existing.origin}`);
  process.exit(0);
}
const candidates = [process.env.CLOUDFLARED_PATH, path.join(homedir(), 'Downloads', 'cloudflared-windows-amd64.exe'), path.join(dir, 'cloudflared.exe')];
const binary = candidates.find(p => p && existsSync(p)) || 'cloudflared';
const port = process.env.PORT || '3000';
const tunnel = existing ? undefined : spawn(binary, ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let currentOrigin;
function persist() { if (currentOrigin && tunnel?.pid) { const data=JSON.stringify({ origin: currentOrigin, pid: tunnel.pid }); writeFileSync(state,data);writeFileSync(path.join(dir,'tunnel-process.json'),data); } }
function clearOwnedState() {
  try { if (tunnel && JSON.parse(readFileSync(state,'utf8')).pid === tunnel.pid) rmSync(state,{force:true}); } catch { /* No owned state remains. */ }
}
const heartbeat = tunnel ? setInterval(persist, 5000) : undefined;
heartbeat?.unref();
let buffer = '';
function log(chunk) {
  const message = chunk.toString();
  process.stdout.write(message);
  buffer = (buffer + message).slice(-12000);
  const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match) { currentOrigin = match[0]; persist(); }
}
tunnel?.stdout.on('data', log);
tunnel?.stderr.on('data', log);
tunnel?.on('error', error => { clearInterval(heartbeat); console.error('Could not start the public tunnel:', error.message); process.exitCode = 1; });
tunnel?.on('exit', () => { clearInterval(heartbeat); clearOwnedState(); });
let app;
if (!process.argv.includes('--tunnel-only')) {
  app = spawn(process.execPath, ['node_modules/next/dist/bin/next', process.argv.includes('--production') ? 'start' : 'dev', '--hostname', '127.0.0.1', '--port', port], { windowsHide: true, stdio: 'inherit' });
  app.on('exit', code => { tunnel?.kill(); process.exitCode = code || 0; });
}
function stop() { clearInterval(heartbeat); tunnel?.kill(); app?.kill(); clearOwnedState(); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
