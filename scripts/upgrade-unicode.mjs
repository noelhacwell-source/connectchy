import 'dotenv/config';
import pg from 'pg';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const url=new URL(process.env.DATABASE_URL), source=new pg.Client({connectionString:url.href});
await source.connect();
const encoding=(await source.query('show server_encoding')).rows[0].server_encoding;
if(encoding==='UTF8'){console.log('Unicode database already enabled');await source.end();process.exit(0);}
const targetName=url.pathname.slice(1)+'_utf8';
const quote=s=>'"'+s.replaceAll('"','""')+'"';
if(!(await source.query('SELECT 1 FROM pg_database WHERE datname=$1',[targetName])).rowCount)await source.query(`CREATE DATABASE ${quote(targetName)} TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`);
const targetUrl=new URL(url);targetUrl.pathname='/'+targetName;
const result=spawnSync(process.execPath,['node_modules/drizzle-kit/bin.cjs','push'],{env:{...process.env,DATABASE_URL:targetUrl.href},encoding:'utf8',input:'\n'});
if(result.status!==0)throw new Error('Could not prepare Unicode schema: '+result.stderr);
const dest=new pg.Client({connectionString:targetUrl.href});await dest.connect();
const tables=['connections','project_rooms','commands','room_messages','room_reads','asset_uploads','workspace_entries','agent_presence','chat_receipts'];
await source.query('BEGIN');await source.query('LOCK TABLE '+tables.map(quote).join(',')+' IN SHARE MODE');await dest.query('BEGIN');
try{
 for(const table of tables){
  const {rows:cols}=await source.query('SELECT column_name,data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position',['public',table]);
  const {rows}=await source.query('SELECT * FROM '+quote(table));
  for(const row of rows)await dest.query('INSERT INTO '+quote(table)+' ('+cols.map(c=>quote(c.column_name)).join(',')+') VALUES ('+cols.map((_,i)=>'$'+(i+1)).join(',')+')',cols.map(c=>['json','jsonb'].includes(c.data_type)&&row[c.column_name]!=null?JSON.stringify(row[c.column_name]):row[c.column_name]));
  const seq=(await dest.query('SELECT pg_get_serial_sequence($1,$2) AS s',[table,'id'])).rows[0].s;
  if(seq)await dest.query('SELECT setval($1,coalesce((SELECT max(id) FROM '+quote(table)+'),1),EXISTS(SELECT 1 FROM '+quote(table)+'))',[seq]);
  console.log(table+': '+rows.length+' records preserved');
 }
 await dest.query('COMMIT');await source.query('COMMIT');
 const original=readFileSync('.env','utf8');writeFileSync('.local-runtime/env-before-unicode',original);writeFileSync('.env',original.replace(/^DATABASE_URL=.*$/m,'DATABASE_URL='+targetUrl.href));
 console.log('Unicode upgrade complete; original database retained.');
}catch(e){await dest.query('ROLLBACK');await source.query('ROLLBACK');throw e;}finally{await dest.end();await source.end();}
