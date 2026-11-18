'use strict';
const {spawn}=require('node:child_process');
function runProcess(command,cwd,signal,onOutput=()=>{}) {
  return new Promise((resolve,reject)=>{
    if(signal.aborted)return reject(new Error('Operation cancelled.'));
    const child=process.platform==='win32'
      ?spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{cwd,windowsHide:true,stdio:['ignore','pipe','pipe']})
      :spawn('/bin/sh',['-c',command],{cwd,stdio:['ignore','pipe','pipe']});
    let output='',cancelled=false,timedOut=false;
    const capture=chunk=>{const text=chunk.toString();output=(output+text).slice(-48000);onOutput(text);};
    child.stdout.on('data',capture);child.stderr.on('data',capture);
    const stop=()=>{cancelled=true;if(process.platform==='win32'&&child.pid){spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}).on('error',()=>child.kill());}else child.kill('SIGKILL');};
    const timer=setTimeout(()=>{timedOut=true;stop();},120000);
    signal.addEventListener('abort',stop,{once:true});
    const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',stop);};
    child.once('error',error=>{cleanup();reject(error);});
    child.once('close',exitCode=>{cleanup();resolve({exitCode,output,cancelled,timedOut});});
  });
}
module.exports={runProcess};
