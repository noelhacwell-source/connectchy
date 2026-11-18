import assert from 'node:assert/strict';import{build}from'esbuild';import{readFileSync}from'node:fs';import{createRequire}from'node:module';
await build({entryPoints:['src/lib/feature-release.ts','src/lib/workbench-model.ts','src/lib/expanded-commands.ts'],outdir:'.local-runtime/release-check',bundle:true,platform:'node',format:'cjs'});
const require=createRequire(import.meta.url),{RELEASE_FEATURES}=require('../.local-runtime/release-check/feature-release.js'),{EXPANDED_CODE_COMMANDS,EXPANDED_ROBLOX_COMMANDS}=require('../.local-runtime/release-check/expanded-commands.js'),{TYPES}=require('../extensions/connectchy-vscode/src/advanced-tools.js');
assert(RELEASE_FEATURES.length>100);assert.equal(new Set(RELEASE_FEATURES.map(f=>f.id)).size,RELEASE_FEATURES.length);assert.equal(new Set(RELEASE_FEATURES.map(f=>f.title)).size,RELEASE_FEATURES.length);assert.deepEqual(new Set(TYPES),new Set([...EXPANDED_CODE_COMMANDS.map(c=>c.type),"code_trash_files"]));
const lua=readFileSync('src/lib/plugin-advanced.ts','utf8');for(const command of EXPANDED_ROBLOX_COMMANDS)assert(lua.includes('handlers.'+command.type+'=function'),command.type);
assert.equal(EXPANDED_ROBLOX_COMMANDS.length,22);assert.equal(EXPANDED_CODE_COMMANDS.length,22);
for(const feature of RELEASE_FEATURES){assert(feature.description);assert(feature.entry);assert(feature.mode);}
console.log(`PASS: ${RELEASE_FEATURES.length} unique, numbered feature entries; both expanded native command catalogs match their implementations.`);
