'use strict';
const vscode=require('vscode');
const fs=require('node:fs/promises');
const path=require('node:path');
const {ProjectFiles,sha}=require('./project-files');
const {runProcess}=require('./process-runner');
const {createAdvancedTools}=require('./advanced-tools');
let session,output,status,treeEmitter;
const proposals=new Map();
const wait=(ms,signal)=>new Promise(resolve=>{const timer=setTimeout(done,ms);function done(){clearTimeout(timer);signal?.removeEventListener('abort',done);resolve();}signal?.addEventListener('abort',done,{once:true});});
function showState(text) {
  const mode = session?.agentMode ? ' · Agent mode' : '';
  status.text = `$(plug) Connectchy: ${text}${mode}`;
  status.tooltip = 'Connectchy — connected project';
  treeEmitter.fire();
}
async function toggleAgentMode() {
  const current = session;
  if (!current) {
    await vscode.window.showInformationMessage('Connect a project before enabling Agent Mode.');
    return;
  }
  if (current.agentMode) {
    current.agentMode = false;
    output.appendLine('Agent Mode disabled.');
    showState(path.basename(current.root));
    return;
  }
  const choice = await vscode.window.showInformationMessage(
    'Enable Agent Mode for this connection?',
    {modal:true, detail:'Agents can create and update text files inside the connected folder without a prompt for each edit. Terminal commands, renames, trash, and checkpoint restores use their existing approval prompts.'},
    'Enable Agent Mode',
  );
  if (choice !== 'Enable Agent Mode' || session !== current) return;
  ensureCurrent(current, current.abort.signal);
  current.agentMode = true;
  output.appendLine('Agent Mode enabled for: ' + current.root);
  showState(path.basename(current.root));
}
function disconnect() {if(session){session.abort.abort();session.active?.abort();session=undefined;}if(status)showState('Disconnected');}
async function request(s,endpoint,body,signal=s.abort.signal) {
  const response=await fetch(s.server+endpoint,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-plugin-key':s.key},body:body?JSON.stringify(body):undefined,signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
  return data;
}
function ensureCurrent(s,signal) {
  if(session!==s||signal.aborted||s.abort.signal.aborted)throw new Error('Connection closed or operation cancelled.');
  if(!vscode.workspace.isTrusted)throw new Error('The project must be trusted in VS Code.');
  if(!vscode.workspace.workspaceFolders?.some(f=>f.uri.scheme==='file'&&f.uri.fsPath===s.root))throw new Error('The connected project is no longer open.');
}
async function guard(s,id,signal) {
  ensureCurrent(s,signal);
  const control=await request(s,`/api/plugin/control?command=${id}`,undefined,signal);
  if(control.paused)throw new Error('Stopped by the owner or the agent was removed/paused.');
  ensureCurrent(s,signal);
}
async function read(s,relative) {
  const full=await s.files.resolve(relative);
  await s.files.readDisk(relative);
  const document=await vscode.workspace.openTextDocument(vscode.Uri.file(full));
  const content=document.getText();
  if(Buffer.byteLength(content)>100000||content.includes('\0'))throw new Error('Expected a text file of at most 100 KB.');
  return {document,content,sha256:sha(content)};
}
async function approve(s,command,title,detail,signal) {
  await guard(s,command.id,signal);
  const answer=await vscode.window.showWarningMessage(title,{modal:true,detail:`Requested by: ${command.agent??'Local dashboard'}\n\n${detail}`},'Approve');
  if(answer!=='Approve')throw new Error('Declined by user in VS Code. Do not retry without discussing the change.');
  await guard(s,command.id,signal);
}
async function execute(s,command,signal) {
  const p=command.payload||{},type=command.type;
  await guard(s,command.id,signal);
  const advanced=createAdvancedTools({vscode,read,approve,ensureCurrent,guard,execute});
  if(advanced.types.includes(type))return advanced.execute(s,command,signal);
  switch(type) {
    case 'code_get_workspace': return {name:path.basename(s.root),root:s.root,editor:'Visual Studio Code',fileTools:'Relative paths; excluded files and links are blocked',agentMode:!!s.agentMode,editsRequireApproval:!s.agentMode,terminalRequiresApproval:true};
    case 'code_list_files': return s.files.list(p.path??'.');
    case 'code_read_file': {const value=await read(s,p.path);return {path:p.path,content:value.content,sha256:value.sha256,unsaved:value.document.isDirty};}
    case 'code_search_files': {
      if(typeof p.text!=='string'||!p.text||p.text.length>500)throw new Error('Search text is required (max 500 characters).');
      const {files,truncated}=await s.files.list(p.path??'.'),matches=[];
      for(const file of files) {
        ensureCurrent(s,signal);
        try {const {content}=await read(s,file);const lines=content.split(/\r?\n/);for(let i=0;i<lines.length&&matches.length<100;i++)if(lines[i].includes(p.text))matches.push({path:file,line:i+1,text:lines[i].slice(0,500)});}catch(error){if(signal.aborted)throw error;}
        if(matches.length>=100)break;
      }
      return {matches,truncated:truncated||matches.length>=100};
    }
    case 'code_get_active_editor': {
      const editor=vscode.window.activeTextEditor;if(!editor)return {editor:null};
      if(editor.document.uri.scheme!=='file')return {editor:null};
      const relative=s.files.relative(editor.document.uri.fsPath);await s.files.resolve(relative);
      return {path:relative,language:editor.document.languageId,unsaved:editor.document.isDirty,selection:{startLine:editor.selection.start.line+1,endLine:editor.selection.end.line+1,text:editor.document.getText(editor.selection).slice(0,10000)}};
    }
    case 'code_get_diagnostics': {
      const diagnostics=[];
      for(const [uri,items] of vscode.languages.getDiagnostics()) {
        if(uri.scheme!=='file')continue;
        const relative=s.files.relative(uri.fsPath);if(p.path&&p.path!==relative)continue;
        try {await s.files.resolve(relative);}catch{continue;}
        for(const d of items) {if(diagnostics.length>=200)break;diagnostics.push({path:relative,line:d.range.start.line+1,severity:d.severity,message:d.message.slice(0,1000),source:d.source});}
      }
      return {diagnostics};
    }
    case 'code_create_file':
    case 'code_write_file': {
      if(typeof p.content!=='string'||Buffer.byteLength(p.content)>100000)throw new Error('File content must be text of at most 100 KB.');
      const create=type==='code_create_file',full=await s.files.resolve(p.path,create),uri=vscode.Uri.file(full);
      let original;
      if(create){try{await fs.lstat(full);throw new Error('File already exists.');}catch(error){if(error.code!=='ENOENT')throw error;}await s.files.resolve(path.dirname(p.path));}
      else {original=await read(s,p.path);if(typeof p.expectedSha256!=='string'||p.expectedSha256!==original.sha256)throw new Error('Stale baseline. Read the file again before editing.');}
      if (s.agentMode && original?.document.isDirty) throw new Error('Save local changes before applying an automatic agent edit.');
      const automatic = !!s.agentMode;
      const proposal=vscode.Uri.parse(`connectchy-proposal:/${command.id}/${encodeURIComponent(path.basename(full))}`);
      proposals.set(proposal.toString(),p.content);
      try {
        if (!automatic) {
          if(!create)await vscode.commands.executeCommand('vscode.diff',uri,proposal,`Connectchy proposal: ${p.path}`,{preview:true});
          await approve(s,command,`${create?'Create':'Update'} ${p.path}?`,create?p.content.slice(0,3000):'Review the proposed diff in the editor. This change will be applied to your project and saved.',signal);
        }
        await s.files.resolve(p.path,create);
        if(!create){original=await read(s,p.path);if(original.sha256!==p.expectedSha256)throw new Error('File changed while approval was open. Read it again.');}
        const edit=new vscode.WorkspaceEdit();
        if(create){edit.createFile(uri,{overwrite:false,ignoreIfExists:false});edit.insert(uri,new vscode.Position(0,0),p.content);}
        else edit.replace(uri,new vscode.Range(new vscode.Position(0,0),original.document.positionAt(original.content.length)),p.content);
        ensureCurrent(s,signal);
        if(!create&&s.context)await advanced.saveSnapshot(s,[p.path],'Before editing '+p.path,signal);
        await guard(s,command.id,signal);
        if (automatic && (!s.agentMode || original?.document.isDirty)) throw new Error('Automatic edit cancelled because Agent Mode changed or there are unsaved local changes.');
        if(!create&&sha(original.document.getText())!==p.expectedSha256)throw new Error('File changed before applying the edit');
        if(!await vscode.workspace.applyEdit(edit))throw new Error('VS Code rejected the edit.');
        const document=await vscode.workspace.openTextDocument(uri);
        if(!await document.save())throw new Error('Change applied in the editor but could not be saved. Inspect the file before retrying.');
        return {path:p.path,sha256:sha(document.getText()),saved:true,approval:automatic?'agent-mode':'reviewed'};
      } finally {proposals.delete(proposal.toString());}
    }
    case 'code_build':
    case 'code_test':
    case 'code_run_command': {
      const text=type==='code_build'?'dotnet build':type==='code_test'?'dotnet test':p.command;
      if(typeof text!=='string'||!text.trim()||text.length>4000)throw new Error('Command must be a nonempty string of at most 4000 characters.');
      const cwd=await s.files.resolve(p.cwd??'.');
      if(!(await fs.stat(cwd)).isDirectory())throw new Error('Command working directory must be a project directory.');
      await approve(s,command,'Run this terminal command?',`${text}\n\nFolder: ${cwd}\n\nCommands run with your user permissions and may access files or services outside this project. Timeout: 120 seconds.`,signal);
      await s.files.resolve(p.cwd??'.');
      output.appendLine(`Approved command: ${text}`);
      return runProcess(text,cwd,signal,chunk=>output.append(chunk));
    }
    default: throw new Error('Unsupported VS Code command: '+type);
  }
}
async function poll(s,context) {
  let outbox=[];
  const journalKey='connectchy.results.'+sha(s.server+s.key+s.root),journal=context.workspaceState.get(journalKey,{});
  while(session===s&&!s.abort.signal.aborted) {
    try {
      const data=await request(s,'/api/plugin/poll',{client:'vscode',version:'vscode-'+context.extension.packageJSON.version,place:{name:path.basename(s.root)},results:outbox});
      outbox=[];showState(data.paused?'Stopped':path.basename(s.root));
      for(const command of data.commands??[]) {
        if(journal[command.id]) {outbox.push(journal[command.id]);continue;}
        const controller=new AbortController();s.active=controller;
        const signal=AbortSignal.any([controller.signal,s.abort.signal]);
        const interrupted={id:command.id,ok:false,error:'Interrupted operation. Inspect project files and output before retrying.'};
        journal[command.id]=interrupted;
        await context.workspaceState.update(journalKey,journal);
        let checking=false;
        const heartbeat=setInterval(async()=>{
          if(checking)return;checking=true;
          try {await guard(s,command.id,signal);await request(s,'/api/plugin/poll',{client:'vscode',version:'vscode-'+context.extension.packageJSON.version,noWait:true},signal);}
          catch {controller.abort();}finally{checking=false;}
        },2000);
        let entry;
        try {showState('AI: '+command.type);const result=await execute(s,command,signal);const json=JSON.stringify({value:result});if(Buffer.byteLength(json)>300000)throw new Error('Result is too large. Request a smaller folder or fewer results.');entry={id:command.id,ok:true,json};}
        catch(error){entry={id:command.id,ok:false,error:String(error.message??error).slice(0,20000)};}
        finally{clearInterval(heartbeat);s.active=undefined;}
        journal[command.id]=entry;
        const ids=Object.keys(journal);for(const id of ids.slice(0,-30))delete journal[id];
        await context.workspaceState.update(journalKey,journal);
        outbox.push(entry);output.appendLine(`${command.type}: ${entry.ok?'completed':entry.error}`);
      }
    } catch(error) {
      if(s.abort.signal.aborted)break;
      output.appendLine('Connection: '+error.message);showState('Reconnecting');await wait(2000,s.abort.signal);
    }
  }
}
async function pairingRequest(origin, endpoint, options={}) {
  let response;
  try {
    response=await fetch(origin+endpoint,{...options,redirect:'error',signal:AbortSignal.timeout(10000)});
  } catch {
    throw new Error('Cannot reach Connectchy at '+origin+'. Open the local dashboard and copy its VS Code workspace link. For a public AI link, set connectchy.serverUrl to your local dashboard address.');
  }
  const data=await response.json().catch(()=>null);
  if(!data)throw new Error('The server at '+origin+' did not return a Connectchy response. Check the dashboard address.');
  if(!response.ok)throw new Error(data.error || 'Connectchy returned HTTP '+response.status+'.');
  return data;
}
async function connect(context) {
  if(session){await vscode.window.showInformationMessage('Already connected. Disconnect before switching projects.');return;}
  if(!vscode.workspace.isTrusted)throw new Error('Trust the project in VS Code before connecting.');
  const folders=vscode.workspace.workspaceFolders?.filter(f=>f.uri.scheme==='file');
  if(!folders?.length)throw new Error('Open a local project folder in VS Code first.');
  const folder=folders.length===1?folders[0]:await vscode.window.showWorkspaceFolderPick({placeHolder:'Choose the folder to share with your AI team'});
  if(!folder)return;
  let server=new URL(vscode.workspace.getConfiguration('connectchy').get('serverUrl','http://127.0.0.1:3000'));
  if(!['http:','https:'].includes(server.protocol)||server.username||server.password||server.pathname!=='/'||server.search||server.hash)throw new Error('Set connectchy.serverUrl to the app address without a path.');
  const secretName='connectchy.connection.'+sha(folder.uri.fsPath),saved=await context.secrets.get(secretName);
  const link=await vscode.window.showInputBox({title:'Connectchy — connect project',prompt:saved?'Paste a VS Code workspace link, or leave blank to reconnect the saved connection.':'Paste the private workspace or AI link from your VS Code workspace in Connectchy.',password:true,ignoreFocusOut:true});
  if(link===undefined)return;
  let key;
  if(!link.trim()&&saved){const previous=JSON.parse(saved);server=new URL(previous.server);key=previous.key;}
  else {
    const input=link.trim();
    let token=input;
    if(!/^sl_[A-Za-z0-9_-]{20,100}$/.test(input)){
      let url;
      try {url=new URL(input);} catch {throw new Error('Copy the workspace link from Connectchy’s VS Code setup panel.');}
      const match=url.pathname.match(/^\/(?:c|api\/agent)\/(sl_[A-Za-z0-9_-]{20,100})\/?$/);
      if(!match || !['http:','https:'].includes(url.protocol) || url.username || url.password)throw new Error('Paste a Connectchy workspace or AI link.');
      token=match[1];
      // Pairing is owner-only. Public AI links use the configured local dashboard.
      if(['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.origin===server.origin)server=new URL(url.origin);
    }
    const info=await pairingRequest(server.origin, '/api/agent/'+token+'/status');
    if(info.mode!=='vscode')throw new Error('Create a Visual Studio Code workspace in the app and use its link.');
    const paired=await pairingRequest(server.origin,'/api/plugin/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
    key=paired.key;
  }
  if(!await vscode.window.showInformationMessage(`Connect ${folder.name} to your AI team?`,{modal:true,detail:'Agents with your private workspace link can read project text. File edits show a diff and require approval here. Terminal commands require separate approval. Disconnect or use Stop in the app at any time.'},'Connect'))return;
  if(session)throw new Error('Another connection was started.');
  await context.secrets.store(secretName,JSON.stringify({server:server.origin,key}));
  const s={server:server.origin,key,root:folder.uri.fsPath,files:new ProjectFiles(folder.uri.fsPath),abort:new AbortController(),active:undefined,context};
  session=s;showState(folder.name);output.appendLine('Connected folder: '+folder.uri.fsPath);void poll(s,context);
}
function activate(context) {
  output=vscode.window.createOutputChannel('Connectchy');status=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);status.command='connectchy.connect';status.show();treeEmitter=new vscode.EventEmitter();
  context.subscriptions.push(output,status,treeEmitter,
    vscode.workspace.registerTextDocumentContentProvider('connectchy-proposal',{provideTextDocumentContent:uri=>proposals.get(uri.toString())??''}),
    vscode.window.registerTreeDataProvider('connectchy.connection',{onDidChangeTreeData:treeEmitter.event,getTreeItem:item=>item,getChildren:()=>{
      const info=new vscode.TreeItem(session?`Connected: ${path.basename(session.root)}`:'Project disconnected');
      const item=(label,command,icon)=>{const row=new vscode.TreeItem(label);row.command={command,title:label};row.iconPath=new vscode.ThemeIcon(icon);return row;};
      return [info,item(session?'Disconnect':'Connect project',session?'connectchy.disconnect':'connectchy.connect','plug'),...(session ? [item(session.agentMode?'Disable Agent Mode':'Enable Agent Mode','connectchy.toggleAgentMode','zap')] : []),item('Open Connectchy app','connectchy.openDashboard','link-external'),item('Connection log','connectchy.showOutput','output')];
    }}),
    vscode.commands.registerCommand('connectchy.connect',()=>connect(context).catch(error=>vscode.window.showErrorMessage(error.message))),
    vscode.commands.registerCommand('connectchy.disconnect',disconnect),
    vscode.commands.registerCommand('connectchy.toggleAgentMode',()=>toggleAgentMode().catch(error=>vscode.window.showErrorMessage(error.message))),
    vscode.commands.registerCommand('connectchy.showOutput',()=>output.show()),
    vscode.commands.registerCommand('connectchy.openDashboard',()=>vscode.env.openExternal(vscode.Uri.parse(session?.server ?? vscode.workspace.getConfiguration('connectchy').get('serverUrl','http://127.0.0.1:3000')))),
    vscode.workspace.onDidChangeWorkspaceFolders(disconnect));
  showState('Disconnected');
}
function deactivate(){disconnect();}
module.exports={activate,deactivate};
