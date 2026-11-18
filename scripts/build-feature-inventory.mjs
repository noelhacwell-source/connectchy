import {build} from 'esbuild';
import {writeFileSync} from 'node:fs';
await build({entryPoints:['src/lib/feature-release.ts'],outfile:'.local-runtime/feature-release.mjs',bundle:true,platform:'node',format:'esm'});
const {RELEASE_FEATURES}=await import('../.local-runtime/feature-release.mjs');
writeFileSync('FEATURES-RELEASE.md',`# Connectchy feature release\n\n${RELEASE_FEATURES.length} new capabilities. Existing chat and task features are not included in this inventory.\n\nRoblox tools require plugin 1.4.0; advanced VS Code tools require extension 0.2.0. Language-provider tools depend on the project's installed language extension. Native operations require the editor to be open and connected.\n\n`+RELEASE_FEATURES.map(f=>`${f.id}. **${f.title}** — ${f.description}\n   Surface: ${f.mode}; entry: ${f.entry}.`).join('\n\n')+'\n');
console.log(JSON.stringify({count:RELEASE_FEATURES.length,shared:RELEASE_FEATURES.filter(f=>f.mode==='shared').length,vscode:RELEASE_FEATURES.filter(f=>f.mode==='vscode').length,roblox:RELEASE_FEATURES.filter(f=>f.mode==='roblox').length}));
