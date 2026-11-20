# Connectchy

**First time on Windows?** Follow the [copy-and-paste Windows setup guide](WINDOWS-SETUP.md) to install the database, download the tunnel tool, start the app and connect your editor.

Connect an AI agent to an open Roblox Studio session. One plugin file in Studio, one private
link for the AI. The agent can read the whole game, create and edit instances, write scripts
and GUIs, insert Creator Store assets, and rename, move or delete anything.

```
AI agent  --HTTP-->  Connectchy server (this app)  <--long poll--  plugin in Roblox Studio
```

## Use it

1. Open the app and create a connection.
2. **Settings → Connection & prompt**: download `StudioLink.rbxmx`, put it in Studio's Plugins folder
   (Studio > Plugins > Plugins Folder), restart Studio and open your place. The plugin panel
   shows CONNECTED and the dashboard shows "Studio online".
3. Copy the agent link from Settings → Connection & prompt and give it to an AI that can open URLs or make HTTP
   requests. The link returns plain-text instructions and the full command list.

The dashboard also lets you do everything by hand: browse the Explorer, read and edit scripts,
rename / duplicate / delete, set properties, run Luau, and see a live log of every command.

## Agent workspace

The default project view is a black, full-height agent chat. The upper-left agent switcher
filters the conversation by participant. The upper-right Settings dialog contains the
connection prompt, integrations, uploads and individually configurable workspace options. The sidebar
can be collapsed for a focused chat view; on small screens it starts closed. Existing projects
keep their credentials and core feature settings. New projects start with communication enabled.

Workspace additions include a task board (owners, priorities, due dates, dependencies and
optimistic revisions), shared notes, decisions, bookmarks, saved room handoffs, agent presence,
source checkpoints, structural path checks, upload library, project statistics, message replies,
pins, search, moderation, Markdown/JSON export and per-room browser drafts. Review-before-apply
and protected paths are opt-in. Feature switches retain saved data. View switches hide UI panels;
feature APIs such as tasks, search, export and checkpoints also enforce their own switch.

## Live online counter

The top of Home and every workspace shows how many copies of Connectchy are
running **right now**, and the number is animated when it changes. Each running
copy checks in every 30 seconds and stays counted for 90 seconds, so the number
rises when someone starts the app and falls when they stop it.

- **Public.** Every copy writes one tiny marker file into `presence/` in this
  repository the first time it runs, and removes it on a clean stop. The public
  number is the number of marker files, so every dashboard in the world shows the
  same figure, read back from GitHub without signing in.
- **Anonymous.** A marker holds a version string and a date. The marker name is a
  hash of a random install id kept on that computer; no account, IP address,
  machine name or person is stored. Markers live at `presence/<marker>.json` and
  `.github/workflows/presence.yml` validates every signal before it can be added.
- **Resilient.** If GitHub cannot be reached, the badge falls back to this
  dashboard's own live count and is labelled as local rather than showing a wrong
  number.

Turning on the public relay (repository owner, once):

1. Create a fine-grained token with **Contents: Read and write** on this
   repository, then add it as the repository secret
   `CONNECTCHY_PRESENCE_TOKEN`.
2. Add it as the same environment variable on the machine that hosts the
   dashboard, together with `CONNECTCHY_PRESENCE_REPO` if you forked the repo.
3. Optionally add a `CONNECTCHY_PRESENCE_SALT` value so hashes cannot be
   reproduced from an install id alone.

`GET /api/presence` returns the current number, `POST /api/presence` checks a
running copy in (and publishes its marker once), and `DELETE /api/presence`
removes a copy when it stops.

## Download counter

The top of Home and every workspace shows a **Download Counter** with the real number of installs
this dashboard has served. It is not a hard-coded figure: rows are written to `install_downloads`
only when the server actually hands out a Studio plugin file (`POST /api/plugin/download`) or the
packaged VS Code extension (`POST /api/downloads/vscode`), and the badge reads those rows back
through `GET /api/downloads`. Reporting a download the browser saved without a server round trip is
`POST /api/downloads` with `{ kind, installId, version?, platform?, token? }`.

The counter stores one row per browser/VS Code install and kind, so repeated downloads raise the
file total but not the number of people. Only a salted SHA-256 hash of a random install id in
`localStorage` is kept - never an IP address, user agent, account or the id itself - and the id can
be reset by clearing site data. If the database is unreachable the badge shows "—" rather than a
guess. `node scripts/verify-download-counter.mjs` checks counting, de-duplication, the served files
and that only hashes are stored.

Review proposals do not execute until approved locally. Script proposals show captured source
and a line diff, and approval rejects a changed baseline. Protected paths enforce typed command
targets and block AI run_luau, undo and redo (including inside batches). They are not a sandbox
for the behavior of scripts later run in gameplay. The local owner can still edit manually.

Pause prevents new commands from being queued or dispatched, but cannot interrupt an already
delivered command. Chat remains available. Script checkpoints save selected sources only; they
do not recreate deleted scripts or restore instances, properties, models or terrain. Restore
preflights script paths and sends one batch; a runtime failure can still yield a partial restore
and is reported. Checks verify readable paths, not code compilation or gameplay. Room handoffs
are factual stored snapshots, not generated AI summaries. Presence is self-reported room checks,
not proof an AI process is running. Link-connected clients poll independently. Imported models can respond when you use **Ask an agent**.

## Agent API

All endpoints live under the private link `/api/agent/<token>`.

| Endpoint | What it does |
| --- | --- |
| `GET /` | Instructions and command reference for the AI (plain text) |
| `GET /status` | Is Studio online, which place |
| `POST /command` | `{ "type": "...", "payload": {...} }` - run one command, wait for the result |
| `GET /run?type=...&payload=...` or `&b64=...` | Same, for tools that can only fetch URLs. Add `&nonce=` so a retry never builds twice |
| `GET /commands` / `?id=` | Command history / one command in full |

Commands: `get_tree`, `get_instance`, `find`, `list_scripts`, `search_scripts`, `get_selection`,
`create_instance`, `set_properties`, `rename`, `move`, `clone`, `delete`, `create_script`,
`get_source`, `set_source`, `append_source`, `search_assets`, `insert_asset`, `image_from_decal`,
`run_luau`, `batch`, `set_selection`, `undo`, `redo`. See `src/lib/command-docs.ts`.

## How it works

- `src/lib/plugin-core.ts`, `src/lib/plugin-handlers.ts`: the Studio plugin (Luau). The download
  route bakes the server address and a per-connection key into it.
- `src/app/api/plugin/poll`: the plugin long-polls here, receives commands, returns results.
- `src/lib/bridge.ts`: command queue (PostgreSQL), waiting for results, credentials.
- `src/components/*`: the dashboard.

Safety properties: only hashes of credentials are stored; commands queued while Studio is
offline are rejected, and anything older than 5 minutes is never delivered; every change is one
undo step in Studio; the plugin runs only in edit mode.

## Game references and agent controls

Add multiple Roblox game links under **Game references**. Connectchy retrieves public details;
your connected AI researches public sources and saves cited briefs. An optional research gate
blocks edits until those briefs are saved. Research requires the AI's own browsing tools.

The chat includes polls, reactions, checklists, threads, templates, filters, message recovery,
and more than 30 individually configurable chat options. **Team and roles** lets you pause,
stop, remove, resume or restore named agents. Removing an agent releases its team slot.
Project Stop and individual controls block new work and cancel queued commands. External AI
generation and already-running Luau cannot be forcibly interrupted. Agent names are self-reported.

## Limits

- Studio must be open. The app does not publish games. Plugin 1.3.0+ supports `run_playtest` for timed Play/Run sessions, server assertions, bounded output, and automatic cleanup. Console shows AI playtesting availability. Agents request tests over HTTP or MCP; the Studio plugin has Connect/Disconnect controls. Check `result.passed`; a successfully delivered command can contain a failed test. Tests take 1–60 seconds plus Studio startup; poll `/commands?id=` after a pending response. Owner Stop is honored inside tests when game HTTP requests are enabled; Studio's Stop also works. This does not automate mouse/keyboard inputs or verify visual layout.
- Optional Roblox Open Cloud uploads support images, models, and audio (MP3/OGG/WAV/FLAC).
  They require your own Roblox credentials, upload permissions, moderation approval and quota.
  Private audio may need experience permissions. Uploads persist on Roblox independently of Studio undo.
- The link is a password. Anyone holding it can change the open place. Delete the connection to
  revoke it.

## Start, updates and the Update badge

```powershell
npm install     # once
npm start       # every time
```

No `.bat` file is needed. On the first run `npm start` creates the private local
database settings, builds the app, prepares the tables and starts the dashboard
at http://127.0.0.1:3000. Later runs reuse that build and start immediately.

While the app runs it checks the official GitHub `main` branch at startup and
then **every 10 minutes**. When a newer commit is published, the button at the
top of Home and every workspace changes from **Changelog** to **Update**; open
it, review the changes, and choose **Update and restart**. The current dashboard
stays available while the new version builds.

`npm run start:update` starts the update launcher directly, and
`npm run dev` runs the development server.

## Run locally with an existing PostgreSQL server

```
npm install
# copy .env.example to .env and set DATABASE_URL for your PostgreSQL database
# use UTF8 database encoding for emoji and multilingual messages
npx drizzle-kit push
npm run build && npm start
```

## Public AI links when running locally

Install `cloudflared` or leave `cloudflared-windows-amd64.exe` in your Downloads folder.
You may also set `CLOUDFLARED_PATH` to its executable path.
`npm run dev` (or `npm start` after building) starts the app and a public HTTPS tunnel together.
If the app is already running, use `npm run tunnel` instead.
Each connection has its own private agent link under the shared public address.
The Setup panel shows the public link and tunnel status, including when opened through localhost.
Agent instructions use the public address. Studio plugins use the stable local app address.

Quick Tunnel addresses change when restarted. Share the updated AI link after a restart; the
Studio plugin does not need reinstalling. It connects to http://127.0.0.1:3000 directly.
The app must be running on the same computer as Studio. The tunnel is only needed by online AIs.
The Connectchy panel has a saved server-address field and an optional project-link field.
Paste another project’s private AI link and click Save / pair and reconnect to switch projects
without reinstalling. Pairing is available only through the local app address. A deleted project
cannot be recovered by reconnecting; pair the plugin with an existing project instead.
Set PLUGIN_ORIGIN for a different plugin server address, or set PORT for a different local port.
For a stable hosted address, set `PUBLIC_ORIGIN` to your permanent HTTPS origin and arrange
its hosting/tunnel separately. The local database must also be running.

## Optional project tools

The room window includes **New room**, **Rename**, **Delete**, and a project-room selector.
Each room preserves its own messages, ping acknowledgements and role plan. Existing conversation
history is migrated to **Main room** on first access. Older rooms can be read and paged backward
with **Load older messages**. Browsing an older room does not move AIs into it; **Use this room
for AI work** changes the project's active room. Only one room is active for work at a time.
Archiving preserves a room for restoration. **Delete permanently** removes the room and its scoped records, including private conversations and video attachments. Removing the last room creates a fresh Main room. These actions do not undo or delete anything in Roblox Studio.
Agents list `/rooms`, use `?room=<id>` on room and team requests, and pin top-level `room` on
Studio edit calls (`_room` for MCP). Multiple-room projects require that pin to avoid accidentally
editing under a different room's plan after the owner switches rooms.

Open **Tools & uploads** on the local dashboard. Room, uploads, MCPs and skills have
independent persisted switches; disabled APIs reject requests. Copy the refreshed prompt from
Setup after changing them. Online agents must re-read their link to see updated instructions.
Settings and credentials can only be managed from localhost, not through the Cloudflare tunnel.

- **Room:** persistent project-specific messages, kinds and affected paths. The owner has a
  floating live room window. Agents read `/room?after=<cursor>` and post `{agent,text,kind,paths}`.
  Agents must poll; this does not start agents or guarantee they read messages. The owner sets
  expected team size in the room (default two). AIs register roles and exact paths at `/room/team`,
  resolve overlapping parent/child scopes, then all confirm ready before Studio edits unlock.
  Joining/updating a role clears everyone's ready flag. Set one expected AI for solo work.
  Completed roles cannot keep editing. New planning rounds clear the roster.
  Pings to `@Owner`, `@all` or AI names persist in the priority inbox (`?agent=<name>`) until
  acknowledged with POST `/room` `{action:"ack",agent,through}`. Unacknowledged pings block
  that AI's next Studio edit. They cannot interrupt an in-flight call or wake a stopped agent.
  Include top-level `agent` in commands (query `agent` in GET /run, `_agent` in Studio MCP
  arguments). Activity history records agent names. Roles are a collaboration guard, not an
  instance lock or a sandbox for arbitrary Luau. Names remain self-reported.
- **Uploads:** save a Roblox Open Cloud Assets Read/Write key and user/group creator ID,
  then enable uploads. Multipart POST `/uploads` accepts `file`, `name`, `description` and
  an idempotent `requestId`. Poll `/uploads?id=<id>` for the Roblox asset ID. Insert models
  with `insert_asset`, or apply an Image asset ID to an ImageLabel/Decal property. Uploading
  alone does not insert anything. Supported formats and 20 MB limit appear in the UI. Prefer
  GLB for embedded model textures. OBJ and glTF sidecar files are not supported. Roblox
  moderation/quotas/ownership restrictions apply; uploads create persistent cloud assets.
  Keys and custom MCP tokens are encrypted in PostgreSQL using `.local-runtime/credential-key`.
  Back up that key with the database; losing it makes saved credentials unreadable.
- **MCP:** built-in Studio tools, a Microsoft Learn preset, and custom Streamable HTTP MCP
  endpoints with optional bearer tokens. `/tools` lists servers; `/tools?server=<id>` discovers
  schemas; POST `/tools` with `{server,name,arguments}` calls a real tool. `/mcp` is a native
  stateless Streamable HTTP MCP endpoint exposing Studio tools. External AI clients can use
  HTTP calls without installing native connectors. Stdio-only, legacy SSE-only, interactive
  OAuth servers, and automatic installation into the AI's own client are not implemented.
- **Skills:** three built-in guides plus editable custom instruction documents. Read `/skills`
  and `/skills?id=<id>`. Global and individual switches control availability. Skills instruct
  an AI; they do not execute programs or grant tools, and the AI must choose to follow them.

### Verification

With the local app and database running:

```
node scripts/verify-features.mjs
node scripts/verify-coordination.mjs
node scripts/verify-rooms.mjs
node scripts/verify-uploads.mjs
node scripts/verify-workspace.mjs
npm run typecheck
npm run lint
```

Feature verification creates and removes disposable projects, tests switches/room/skills,
checks owner-only configuration, calls Microsoft's public documentation MCP, and exercises a
native MCP handshake. Upload verification uses real local database storage but mocks Roblox's
upstream responses; it never creates a real Roblox asset. Real Roblox upload and model insertion
must be checked after the owner supplies valid credentials and an appropriate file.

Workspace verification uses a disposable simulated Studio session to exercise actual command queues, reviews, stale proposals, checkpoints/restores, pause, typed path protection, task dependencies, message features and disabled APIs. It never changes the owner’s open Studio game. The production build and browser checks cover desktop and narrow layouts.

## VS Code workspaces

On the home page select **Visual Studio Code** when creating a workspace. The existing room conversation, expected AI count, roles, team controls, tasks and notes are reused. Workspace mode is fixed at creation; Roblox workspaces keep their behavior.

The extension source is in `extensions/connectchy-vscode`. The installable package is served at `/downloads/connectchy-vscode.vsix`. Install through VS Code's **Extensions: Install from VSIX**, open a trusted local folder, and run **Connectchy: Connect Project**. Paste the workspace link from Connection setup. In a multi-root workspace choose one folder. Connection keys are kept in VS Code SecretStorage; reconnecting requires an explicit Connect action. No AI model is bundled.

Agents use the `code_*` catalog from their private link or the built-in MCP server. File reads include editor buffers and SHA-256 baselines. Existing-file edits show a diff, require approval inside VS Code, and reject stale baselines. Creates cannot overwrite existing files. File tools reject traversal, symbolic links, credential files and common build outputs. Terminal commands require approval of the exact command, run with the user's permissions, and are not a filesystem sandbox. They have a 120-second limit and bounded output. Stop/disconnect cancels active operations. The extension journals delivered commands to avoid silently replaying an interrupted edit or command. File operations require existing parent directories; large/binary files and remote/virtual workspaces are not supported by this version.

Verification: `node scripts/verify-vscode.mjs` exercises mode/client isolation, two-agent coordination, command delivery/results, MCP, Stop and replacement agents. `npm test --prefix extensions/connectchy-vscode` checks file boundaries, approvals, stale edits, cancellation and process output. `extensions/connectchy-vscode/test/host-runner.js` is an extension-host smoke test, run with VS Code's `--extensionDevelopmentPath` and `--extensionTestsPath` flags against an isolated folder. Repackage using `npm run package --prefix extensions/connectchy-vscode`.

## Mission Control feature release

The inventory is in `FEATURES-RELEASE.md` and in the app’s **Feature catalog**. The workspace controls section lists the supported search, filter, export, and deletion operations for each record collection.

**Mission Control** uses existing project/room storage; it does not require a new database table or schema migration. It has issues, milestones, project memory, reusable runbooks and frozen run instances, release acceptance/freeze controls, scored risks, dependencies, agent profiles, maintenance windows, test cases with actual command evidence, benchmarks and shared saved views. Records have optimistic revisions; imports and bulk changes are transactional. History retains the last 20 prior revisions. The board read limit is 2,000 records and displays a truncation warning; imports/bulk actions are capped at 100. Local session goals and focus timers are browser-local. Profiles use self-reported agent names rather than separate authenticated identities; per-agent quota checks and queue insertion are serialized to prevent parallel requests from exceeding limits. Release freezes and maintenance apply to new agent mutations, not already-delivered work or explicit owner actions.

Agent API: `GET/POST /api/agent/<token>/workbench?room=<id>&agent=<name>`. Read `kinds` to discover board fields and lifecycle states. Agent docs include the shared workflow endpoints. Owners alone manage permission profiles, maintenance, release freezes, import and archive operations. Build/test evidence is only marked passed from an explicit `passed:true` result or a zero exit code; command delivery alone does not mean a test passed.

Roblox tools require **StudioLink 1.4.0**. VS Code recovery/navigation tools require **Connectchy 0.2.0**. The installed local packages have been updated; restart Studio and reload VS Code to load them. Typed Roblox edits still use undo recording. Syntax compilation does not execute scripts and is not a gameplay test. VS Code language navigation depends on installed language providers. Local checkpoints retain ten snapshots and are not full-project backups.

Verification: `verify-feature-release.mjs`, `verify-workbench-model.mjs`, `verify-mission-control.mjs`, `verify-command-budgets.mjs`, `verify-roblox-advanced.mjs`, and `verify-runtime.mjs` in `scripts`, plus the VS Code extension test suite and extension-host smoke test. The Roblox suite executes all 22 new handlers against an isolated engine fixture; a real Studio game was not available for live validation. Existing room/chat/coordination/workspace/playtest checks were also run. The framework was patched to Next.js 16.4.6; the production dependency audit reports no known vulnerabilities. Some development-only dependency advisories remain; no forced major downgrades were applied.
## Collaboration and custom agents

Open **Settings → Agents** to import a Chat Completions-compatible provider with its API base URL, model ID, key and optional instructions. Use **Ask an agent** in a room, survey, question or private chat to request a model response. Each request sends the selected conversation context to the configured provider. Keys are encrypted using the local credential key. Existing editor clients can continue using the project link.

For an external client, **Link agent** issues a separate individual key for collaboration and deletion. Give that client its project link and key. It sends the key as the `X-Agent-Key` header. Rotate or remove keys from the directory. Private conversations are visible to their participants and the local owner. The owner can read, post and delete across those conversations. Removing and re-adding an agent creates a new identity.

The **Videos** tab accepts MP4, WebM and MOV with a browser-supported codec. Use **Customize → Uploads** to set a workspace-wide limit in MB or choose **Unlimited**. Existing workspaces start at 500 MB. Linked agents with the project link can request shared media or sampled frames. **Ask about clip** can send up to eight JPEG frames to a vision model, or send only the caption, details and instructions to a text model. Use **Edit details** to add a description or a transcript excerpt.

Workspace appearance is saved per project and browser. Use **Settings → Appearance** for custom wallpaper, dimming, image fit, position, pattern, accent and message size.

The normal startup script installs the collaboration tables and adds video streaming storage for existing databases. For a fresh install, follow the database setup above. With the app running locally, run `node scripts/verify-collaboration.mjs` to exercise identity isolation, surveys, model calls, media transport and permanent cleanup against a disposable project and local provider fixture.
### Workspace controls

The **Videos** sidebar tab works in both editors and includes clips already posted to rooms. Deleting video media leaves the original chat message. **Manage records** lists each tab’s available collections and supports filtering, export, selected removal, and full-collection removal. Room collections are scoped to the selected room. Catalog and insight cards can be hidden and restored in bulk. Home and Workspace settings both have **Delete workspace**.

Use **Customize** in the home or workspace toolbar to rearrange and rename navigation, move panels, change colors and typography, and adjust density. Layout and appearance are saved in this browser. The upload limit is shared across the workspace.

The VS Code extension **0.3.0** adds **Enable Agent Mode** to the Connectchy sidebar. The mode applies text-file creation and updates during the current connection. Terminal commands require approval. Explorer file trashing supports up to twenty explicit project text files per reviewed batch.
