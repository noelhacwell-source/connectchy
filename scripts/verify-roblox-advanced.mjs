import {build} from 'esbuild';import{readFileSync}from'node:fs';import{createRequire}from'node:module';
await build({entryPoints:['src/lib/plugin-advanced.ts'],outfile:'.local-runtime/roblox-advanced.mjs',bundle:true,platform:'node',format:'esm'});
const {PLUGIN_ADVANCED}=await import('../.local-runtime/roblox-advanced.mjs');const require=createRequire(import.meta.url),{lua,lauxlib,lualib,to_luastring}=require('../.local-runtime/node_modules/fengari');
const source=readFileSync('tests/roblox-advanced-fixture.lua','utf8').replace('-- __MODULE__',PLUGIN_ADVANCED),L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
if(lauxlib.luaL_dostring(L,to_luastring(source))!==lua.LUA_OK)throw new Error(lua.lua_tojsstring(L,-1));
console.log('PASS: all 22 typed Roblox tools executed against an isolated engine fixture; attribute/tag mutations, inventories, bounds/pivots, anchoring/collision preflight, syntax-only compilation and missing-path reports verified. No user game was modified.');
