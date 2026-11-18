'use strict';
const assert=require('node:assert/strict');
const vscode=require('vscode');
async function run() {
  const extension=vscode.extensions.getExtension('connectchy-local.connectchy-vscode');
  assert(extension,'Development extension is available');
  await extension.activate();assert(extension.isActive);
  const commands=await vscode.commands.getCommands(true);
  for(const id of ['connectchy.connect','connectchy.disconnect','connectchy.openDashboard','connectchy.showOutput'])assert(commands.includes(id),id);
  await vscode.commands.executeCommand('connectchy.disconnect');
  assert(vscode.workspace.workspaceFolders?.length,'Isolated project folder is open');
  console.log('PASS: VS Code extension activates, registers controls, opens a project, and disconnects cleanly.');
}
module.exports={run};
