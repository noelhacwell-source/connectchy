# Connectchy for VS Code

Connect a local project folder to the AI team in your Connectchy app.

1. In Connectchy, create a workspace with mode **Visual Studio Code**.
2. Install this VSIX using **Extensions: Install from VSIX**.
3. Open and trust your project folder in VS Code.
4. Click the Connectchy icon, then **Connect project**, and paste the workspace/AI link.
5. Set **Expected agents** in the app and give the same AI prompt to each agent.

The extension supports project browsing, file reads/search, active editor context, diagnostics, creating and editing files, and approved terminal commands. Existing files require a current SHA-256 baseline and a reviewed diff. Mutations and terminal commands require explicit approval in VS Code. Secret files, symbolic links and build outputs are excluded from file tools. Terminal commands run with your user permissions and can access outside the folder; inspect the exact command before approving it. Stop/disconnect cancels active operations and kills the command process tree. File tools use a single selected local folder; remote and virtual workspaces are not supported.

Connection keys use VS Code SecretStorage. Reconnect the last project by leaving the link input blank. Connections never start automatically. The extension does not run or supply an AI model; use AI clients that can open the app's agent link and call HTTP/MCP tools.

Default app server: http://127.0.0.1:3000. Change `connectchy.serverUrl` if the app uses another local port. Use a VS Code workspace link, not a Roblox workspace link. In multi-root workspaces, choose one folder to connect.

Use **Connectchy: Disconnect** or the sidebar Disconnect button to stop sharing. Already-applied file edits remain in the project and can be undone in VS Code or reverted with version control. Unsaved editor changes are included when an agent reads a file. Approved writes save the entire updated file; inspect the diff first. A build or test may fail even when delivery succeeded; agents must check exit codes and output.

## 0.2 recovery and project tools

Every approved existing-file write now creates a local pre-edit checkpoint. Manual checkpoints support up to 20 files / 500 KB and retain the last 10 snapshots per connected folder. Compare a snapshot before restoring it and provide the current hash for every file. Restore applies a single editor edit; files that were deleted can be recovered by reading the snapshot file and proposing a create. Checkpoints are local to VS Code and are not full project or Git backups.

New tools include exact single-occurrence patches, approved directory creation, non-overwriting rename, trash deletion, symbol/reference/definition/type/hover queries, formatting proposals, and bounded Git status/diff/log/branch/blame reads. Navigation and formatting depend on installed language providers. Git diff/blame are restricted to one allowed text file so they cannot expose excluded credential files.

Mission Control in the app adds shared issues, milestones, memory, runbooks/runs, releases, risks, dependency records, permission profiles, maintenance, test evidence and benchmarks. Release freezes and maintenance block new agent mutations. Permission profiles use self-reported agent names, not separate authenticated accounts. Review each proposed change or terminal command before approving it.
### Agent Mode

Connect a trusted folder and select **Enable Agent Mode** in the Connectchy sidebar. Text-file creation and updates can then apply without a prompt for each edit during that connection. The extension checks file paths, current content hashes, and unsaved editor changes. Rename, trash, checkpoint restores, and terminal commands use their dedicated confirmation. The setting resets when you disconnect.

