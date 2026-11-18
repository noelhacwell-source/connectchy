'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runProcess}=require('../src/process-runner');
test('terminal output, nonzero exit, cancellation and output bounds',async()=>{
  const controller=new AbortController();
  const text=process.platform==='win32'?"Write-Output 'test output'; exit 3":"printf 'test output'; exit 3";
  const result=await runProcess(text,process.cwd(),controller.signal);assert.equal(result.exitCode,3);assert(result.output.includes('test output'));
  const abort=new AbortController();const pending=runProcess(process.platform==='win32'?'Start-Sleep -Seconds 30':'sleep 30',process.cwd(),abort.signal);setTimeout(()=>abort.abort(),400);const stopped=await pending;assert.equal(stopped.cancelled,true);
  const bounded=await runProcess(process.platform==='win32'?"Write-Output ('x' * 100000)":"printf '%100000s' x",process.cwd(),controller.signal);assert(bounded.output.length<=48000);
});
