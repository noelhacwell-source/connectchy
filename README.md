# Studio Link

Connect an AI agent to an open Roblox Studio session. One plugin file in Studio, one private
link for the AI. The agent can read the whole game, create and edit instances, write scripts
and GUIs, insert Creator Store assets, and rename, move or delete anything.

```
AI agent  --HTTP-->  Studio Link server (this app)  <--long poll--  plugin in Roblox Studio
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
connection prompt, integrations, uploads and 27 independent workspace options. The sidebar
can be collapsed for a focused chat view; on small screens it starts closed. Existing projects
keep their credentials and core feature settings. New projects start with communication enabled.

Workspace additions include a task board (owners, priorities, due dates, dependencies and
optimistic revisions), shared notes, decisions, bookmarks, saved room handoffs, agent presence,
source checkpoints, structural path checks, upload library, project statistics, message replies,
pins, search, moderation, Markdown/JSON export and per-room browser drafts. Review-before-apply
and protected paths are opt-in. Feature switches retain saved data. View switches hide UI panels;
feature APIs such as tasks, search, export and checkpoints also enforce their own switch.

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
not proof an AI process is running. Studio Link does not start AI clients or run models.

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

## Limits

- Studio must be open. The plugin cannot publish, play test, or upload new image / mesh files:
  assets must already exist on Roblox (search or asset id).
- The link is a password. Anyone holding it can change the open place. Delete the connection to
  revoke it.

## Run locally

```
npm install
# set DATABASE_URL in .env
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
The Studio Link panel has a saved server-address field and an optional project-link field.
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
Deleted rooms are hidden/soft-deleted; at least one room must remain. Deleting an active room
selects another remaining room. These actions do not undo or delete anything in Roblox Studio.
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
