'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {execFile}=require('node:child_process');
const {sha}=require('./project-files');
const TYPES=['code_snapshot_files','code_list_snapshots','code_compare_snapshot','code_restore_snapshot','code_delete_snapshot','code_read_snapshot_file','code_patch_file','code_create_directory','code_rename_file','code_delete_file','code_trash_files','code_document_symbols','code_workspace_symbols','code_find_references','code_find_definition','code_find_type_definition','code_hover','code_format_document','code_git_status','code_git_diff','code_git_log','code_git_branches','code_git_blame'];
function createAdvancedTools(api) {
  const {vscode,read,approve,ensureCurrent}=api;
  const storeKey=s=>'connectchy.snapshots.'+sha(s.root);
  const snapshots=s=>s.context?.workspaceState.get(storeKey(s),[])??[];
  async function saveSnapshot(s,files,label,signal) {
    if(!s.context)throw new Error('Snapshot storage is unavailable');
    if(!Array.isArray(files)||!files.length||files.length>20||files.some(f=>typeof f!=='string'))throw new Error('Provide 1–20 relative file paths');
    const sources=[];let bytes=0;
    for(const file of [...new Set(files)]){ensureCurrent(s,signal);const item=await read(s,file);bytes+=Buffer.byteLength(item.content);if(bytes>500000)throw new Error('Snapshot exceeds 500 KB');sources.push({path:file,content:item.content,sha256:item.sha256});}
    const snapshot={id:randomUUID(),label:String(label??'Checkpoint').slice(0,120),createdAt:new Date().toISOString(),files:sources};
    const records=[...snapshots(s),snapshot].slice(-10);await s.context.workspaceState.update(storeKey(s),records);
    return {id:snapshot.id,label:snapshot.label,createdAt:snapshot.createdAt,files:sources.map(({path,sha256})=>({path,sha256}))};
  }
  function getSnapshot(s,id){const value=snapshots(s).find(r=>r.id===id);if(!value)throw new Error('Snapshot not found in this project');return value;}
  async function locations(s,values){const result=[];for(const value of values??[]){const uri=value.targetUri??value.uri??value.location?.uri;if(uri?.scheme!=='file')continue;const relative=s.files.relative(uri.fsPath);try{await s.files.resolve(relative);}catch{continue;}const range=value.targetSelectionRange??value.range??value.location?.range;result.push({path:relative,line:range?.start.line+1,column:range?.start.character+1,name:value.name,kind:value.kind});if(result.length>=100)break;}return result;}
  async function execute(s,command,signal){const p=command.payload??{},type=command.type;
    if(type==='code_snapshot_files')return saveSnapshot(s,p.paths,p.label,signal);
    if(type==='code_list_snapshots')return {snapshots:snapshots(s).map(r=>({id:r.id,label:r.label,createdAt:r.createdAt,files:r.files.map(({path,sha256})=>({path,sha256}))}))};
    if(type==='code_read_snapshot_file'){const record=getSnapshot(s,p.id).files.find(f=>f.path===p.path);if(!record)throw new Error('File not found in snapshot');await s.files.resolve(p.path,true);return record;}
    if(type==='code_delete_snapshot'){const record=getSnapshot(s,p.id);await approve(s,command,'Delete this local checkpoint?',`${record.label}\nThis removes the stored copy, not project files.`,signal);await s.context.workspaceState.update(storeKey(s),snapshots(s).filter(r=>r.id!==p.id));return {deleted:true};}
    if(type==='code_compare_snapshot'||type==='code_restore_snapshot'){
      const record=getSnapshot(s,p.id),files=[];
      for(const saved of record.files){const current=await read(s,saved.path);files.push({path:saved.path,currentSha256:current.sha256,snapshotSha256:saved.sha256,changed:current.sha256!==saved.sha256,currentLines:current.content.split('\n').length,snapshotLines:saved.content.split('\n').length});}
      if(type==='code_compare_snapshot')return {files};
      for(const file of files)if(p.expectedSha256?.[file.path]!==file.currentSha256)throw new Error('Compare the snapshot and include current expectedSha256 for every file');
      await approve(s,command,'Restore this checkpoint?',`${record.label}\n${files.map(f=>f.path).join('\n')}\nExisting files will return to their captured contents.`,signal);
      const edit=new vscode.WorkspaceEdit();
      for(const saved of record.files){const current=await read(s,saved.path);if(current.sha256!==p.expectedSha256[saved.path])throw new Error('A file changed while approval was open');edit.replace(current.document.uri??vscode.Uri.file(await s.files.resolve(saved.path)),new vscode.Range(new vscode.Position(0,0),current.document.positionAt(current.content.length)),saved.content);}
      await api.guard(s,command.id,signal);if(!await vscode.workspace.applyEdit(edit))throw new Error('VS Code rejected the restore');
      const savedFiles=[];for(const file of files){const current=await read(s,file.path);if(!await current.document.save())throw new Error(`Restore applied but could not save ${file.path}. Inspect the editor before retrying.`);savedFiles.push(file.path);}return {restored:savedFiles};
    }
    if(type==='code_patch_file'){
      if(typeof p.find!=='string'||!p.find||typeof p.replace!=='string')throw new Error('Provide nonempty find text and replacement text');
      const current=await read(s,p.path);if(current.sha256!==p.expectedSha256)throw new Error('Stale baseline');
      const index=current.content.indexOf(p.find);if(index<0||current.content.indexOf(p.find,index+p.find.length)>=0)throw new Error('Find text must occur exactly once');
      return api.execute(s,{...command,type:'code_write_file',payload:{path:p.path,expectedSha256:p.expectedSha256,content:current.content.slice(0,index)+p.replace+current.content.slice(index+p.find.length)}},signal);
    }
    if(type==='code_create_directory'){
      const full=await s.files.resolve(p.path,true);await approve(s,command,'Create project directory?',p.path,signal);await s.files.resolve(p.path,true);await fs.mkdir(full,{recursive:true});return {created:p.path};
    }
    if (type === 'code_trash_files') {
      const paths = p.paths;
      if (!Array.isArray(paths) || !paths.length || paths.length > 20 || paths.some(file => typeof file !== 'string'))
        throw new Error('Choose 1–20 relative text-file paths.');
      const baseline = new Map();
      for (const file of new Set(paths)) {
        const current = await read(s, file);
        if (current.document.isDirty) throw new Error('Save unsaved changes before deleting ' + file);
        baseline.set(file, current.sha256);
      }
      await approve(s, command, 'Move these files to the trash?', [...baseline.keys()].join('\n'), signal);
      const snapshot = await saveSnapshot(s, [...baseline.keys()], 'Before trashing selected files', signal);
      const trashed = [], skipped = [];
      for (const file of baseline.keys()) {
        try {
          await api.guard(s, command.id, signal);
          const current = await read(s, file);
          const saved = snapshot.files.find(item => item.path === file);
          if (current.document.isDirty || current.sha256 !== baseline.get(file) || saved.sha256 !== current.sha256)
            throw new Error('File changed during approval.');
          const target = await s.files.resolve(file);
          ensureCurrent(s, signal);
          await vscode.workspace.fs.delete(vscode.Uri.file(target), { useTrash: true, recursive: false });
          trashed.push(file);
        } catch (e) { skipped.push({ path: file, error: e.message }); }
      }
      return { trashed, skipped, snapshot: snapshot.id };
    }
    if(type==='code_rename_file'||type==='code_delete_file'){
      const relative=type==='code_rename_file'?p.from:p.path,current=await read(s,relative);if(current.sha256!==p.expectedSha256)throw new Error('Read the current file and provide its expectedSha256');
      if(current.document.isDirty)throw new Error('Save or discard unsaved changes before renaming or deleting this file');
      const full=await s.files.resolve(relative),target=type==='code_rename_file'?await s.files.resolve(p.to,true):undefined;
      if(target){await s.files.resolve(path.dirname(p.to));try{await fs.lstat(target);throw new Error('Destination exists');}catch(error){if(error.code!=='ENOENT')throw error;}}
      await approve(s,command,type==='code_rename_file'?'Rename this project file?':'Move this file to the trash?',type==='code_rename_file'?`${p.from} → ${p.to}`:p.path,signal);
      if((await read(s,relative)).sha256!==p.expectedSha256)throw new Error('File changed while approval was open');
      if(type==='code_rename_file'){await s.files.resolve(p.to,true);const edit=new vscode.WorkspaceEdit();edit.renameFile(vscode.Uri.file(full),vscode.Uri.file(target),{overwrite:false});if(!await vscode.workspace.applyEdit(edit))throw new Error('VS Code rejected the rename');return {from:p.from,to:p.to};}
      await saveSnapshot(s,[relative],'Before deleting '+relative,signal);await vscode.workspace.fs.delete(vscode.Uri.file(full),{useTrash:true,recursive:false});return {trashed:p.path};
    }
    if(type.startsWith('code_git_')){
      if(['code_git_diff','code_git_blame'].includes(type)){if(typeof p.path!=='string')throw new Error('Provide one allowed project file path');await s.files.readDisk(p.path);}
      const gitArgs=['--no-pager','-c','core.fsmonitor=false','-c','core.untrackedCache=false'];
      const args=type==='code_git_status'?['status','--porcelain=v1','--','.']:type==='code_git_log'?['log','--no-show-signature','-30','--format=%h %ad %s','--date=iso-strict','--','.']:type==='code_git_branches'?['branch','--list','--format=%(refname:short)']:type==='code_git_blame'?['blame','--no-textconv','--line-porcelain','--',p.path]:['diff','--no-ext-diff','--no-textconv','--',p.path??'.'];
      if(p.path)await s.files.resolve(p.path);if(type==='code_git_blame'&&typeof p.path!=='string')throw new Error('A file path is required for blame');
      const cwd=await s.files.resolve('.');
      return new Promise((resolve,reject)=>execFile('git',[...gitArgs,...args],{cwd,windowsHide:true,timeout:15000,maxBuffer:200000,signal},(error,stdout,stderr)=>{if(error)return reject(new Error(String(stderr||error.message).slice(0,2000)));resolve({output:stdout.slice(0,48000),truncated:stdout.length>48000});}));
    }
    if(type==='code_workspace_symbols'){
      if(typeof p.query!=='string'||p.query.length>200)throw new Error('Provide a symbol query');return {symbols:await locations(s,await vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider',p.query))};
    }
    const current=await read(s,p.path),uri=vscode.Uri.file(await s.files.resolve(p.path));
    if(type==='code_document_symbols'){
      const values=await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider',uri),symbols=[];
      const walk=(items,depth)=>{if(depth>10)return;for(const item of items??[]){if(symbols.length>=200)return;symbols.push({name:item.name,kind:item.kind,line:(item.selectionRange??item.location?.range??item.range)?.start.line+1});walk(item.children,depth+1);}};walk(values,0);return {path:p.path,symbols};
    }
    if(type==='code_format_document'){
      if(current.sha256!==p.expectedSha256)throw new Error('Read the file and provide its current expectedSha256');
      const edits=await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider',uri,{tabSize:2,insertSpaces:true});if(!edits?.length)return {changed:false,reason:'No formatting edits returned; check that a formatter is installed'};
      let content=current.content;const ordered=edits.map(e=>({start:current.document.offsetAt(e.range.start),end:current.document.offsetAt(e.range.end),text:e.newText})).sort((a,b)=>b.start-a.start);
      let boundary=content.length;for(const edit of ordered){if(edit.end>boundary)throw new Error('Formatter returned overlapping edits');content=content.slice(0,edit.start)+edit.text+content.slice(edit.end);boundary=edit.start;}
      return api.execute(s,{...command,type:'code_write_file',payload:{path:p.path,expectedSha256:p.expectedSha256,content}},signal);
    }
    if(!Number.isInteger(p.line)||p.line<1||!Number.isInteger(p.column)||p.column<1)throw new Error('Provide 1-based line and column');
    if(p.line>current.document.lineCount||p.column>current.document.lineAt(p.line-1).text.length+1)throw new Error('Position is outside the document');
    const position=new vscode.Position(p.line-1,p.column-1);
    const provider=type==='code_find_references'?'vscode.executeReferenceProvider':type==='code_find_definition'?'vscode.executeDefinitionProvider':type==='code_find_type_definition'?'vscode.executeTypeDefinitionProvider':'vscode.executeHoverProvider';
    const result=await vscode.commands.executeCommand(provider,uri,position);ensureCurrent(s,signal);
    if(type==='code_hover')return {contents:(result??[]).flatMap(h=>h.contents??[]).map(c=>typeof c==='string'?c:c.value??'').join('\n').slice(0,15000)};
    return {locations:await locations(s,result)};
  }
  return {types:TYPES,execute,saveSnapshot};
}
module.exports={createAdvancedTools,TYPES};
