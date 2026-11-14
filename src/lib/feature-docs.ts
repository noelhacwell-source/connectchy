import { modules } from "@/lib/modules";
import { enabledSkills, featureSettings } from "@/lib/features";
import type { Connection } from "@/db/schema";
export function featureDocs(base: string, conn: Connection) {
  const f = featureSettings(conn.features);
  const m = modules(f.modules);
  return `
## Optional project features (owner-controlled)
Communication room: ${f.room ? "ENABLED" : "DISABLED"}
Uploads: ${f.uploads ? "ENABLED" : "DISABLED"}
MCP tools: ${f.mcps ? "ENABLED" : "DISABLED"}
Skills: ${f.skills ? "ENABLED" : "DISABLED"}
Disabled feature endpoints reject requests. You cannot enable features or change credentials.
${f.room ? `
### Shared communication room
Role planning gate: ${m.rolePlanning?"ENABLED — follow the mandatory planning steps below":"DISABLED — skip join/ready gating below; still use your stable agent name"}.
Priority pings: ${m.pingInbox?"ENABLED — read and acknowledge attention messages":"DISABLED — no acknowledgement gate"}.
This project supports multiple named rooms. GET ${base}/rooms lists rooms and activeRoomId.
Only one room is active for AI work. The owner creates, renames, deletes and switches rooms.
Keep the active room ID you joined. Use ?room=<id> on /room and /room/team requests to stay in
that conversation. Include top-level "room":<id> on edit commands (&room=<id> for /run,
or _room in Studio MCP arguments). With multiple rooms this is required for Studio edits.
If the active room changes, stop editing and coordinate in the new room; do not silently follow
a different conversation. Older rooms remain readable, but cannot accept posts or role changes
unless the owner makes that room active. Use ?before=<oldest-message-id> to page older messages.
MANDATORY BEFORE EDITING: An empty room is NOT permission to begin. The default team size is TWO.
The owner sets the actual expected number of AIs in the room window. If you are alone, ask the owner
to set it to one; do not silently assume that no other AI is coming or change the count yourself.
Choose a stable name with letters/digits/_/- (start with a letter, max 40; not Owner/all/Coordinator).
1. GET ${base}/room/team and GET ${base}/room?agent=<your-name>. Inspect /commands and the game read-only.
2. POST ${base}/room/team with {"action":"join","agent":"Builder","role":"Map layout","paths":["Workspace/Map"]}.
   Each AI proposes its own role and exact owned paths. Read other roles, discuss a division of labor
   in /room, and resolve overlapping parent/child paths. Joining or updating a role resets EVERYONE's ready flag.
3. After reviewing the full roster, POST ${base}/room/team {"action":"ready","agent":"Builder"}.
   If not all expected AIs have joined and confirmed ready, WAIT and poll every 5–10 seconds.
   Do not begin tasks because the room is empty, you are the first to arrive, or you marked yourself ready.
4. Work unlocks only when team.phase is active. Before each edit, read the room and acknowledge your pings.
   Include top-level "agent":"Builder" in POST /command, or &agent=Builder in /run.
   For built-in MCP tools include "_agent":"Builder" in arguments. Unregistered, unready and done agents
   cannot edit while the room is enabled. Read-only game inspection remains available during planning.
5. Work only on your agreed role/paths; re-read scripts before replacing them. On completion,
   POST ${base}/room/team {"action":"done","agent":"Builder"}, then report exact changed paths in /room.
   If all roles are done, ask the owner for a new planning round before beginning a new task.

GET ${base}/room?agent=<your-name>&after=<nextCursor> polls messages, the team roster and attention.
READ attention.unacknowledgedPings FIRST, even if the normal messages list is empty.
Priority pings persist independently of the normal cursor, until you explicitly acknowledge them:
POST ${base}/room {"action":"ack","agent":"Builder","through":<last ping ID you actually read>}.
If attention.more is true, keep reading/acknowledging pages. Unacknowledged pings block your next Studio edit.
POST ${base}/room {"agent":"Builder","kind":"question","text":"@Scripter can you review this?","mentions":["Scripter"],"paths":["Workspace/Map"]}.
Use @Owner to ping the human, @all for everyone, or another registered AI name. Text @mentions also work.
Kinds: message, plan, progress, question, decision, done. Read other agents' /commands as well as their messages.
Pings cannot wake a stopped AI or interrupt its currently running tool call. All names/roles are self-reported.
Roles are a collaboration guard, not a security sandbox or an instance lock; arbitrary Luau can still touch other
paths. Never run undo over someone else's changes. Owner dashboard actions remain available during planning.
` : ""}
${f.uploads ? `
### Upload images, 3D models and sound effects
POST ${base}/uploads using multipart/form-data (NOT JSON), fields:
file=@path, name (1–50 chars), agent (your stable registered name), description (optional), requestId (unique letters/digits/_/-, max 100).
Example terminal request:
curl -X POST '${base}/uploads' -F 'file=@image.png' -F 'name=My image' -F 'requestId=unique-upload-001'
Supported: PNG/JPEG/BMP/TGA images, FBX/GLB/self-contained glTF/RBXM/RBXMX models; up to 20 MB.
When audioUploads is enabled, MP3, OGG, WAV and FLAC audio are supported too (maximum 7 minutes, 20 MB). Upload only audio you have rights to use. Roblox audio privacy and experience permissions still apply. Use an audio creator/account with the required upload permissions and quota.
Prefer GLB for embedded textures. External glTF dependencies and raw OBJ are not accepted here.
Reusing requestId returns the original upload and NEVER creates another asset. Do not blindly retry
with a NEW requestId after a timeout: a Roblox asset may already have been created.
Response: {upload:{id,state,operation,result}}. GET ${base}/uploads lists recent uploads.
GET ${base}/uploads?id=<id> checks Roblox processing; poll with a delay until done/failed.
Asset ID is upload.result.response.assetId. Check result.error and moderationResult.
Models: send insert_asset with that assetId to /command. Images: set an ImageLabel.Image or
Decal.Texture to rbxassetid://<assetId> via set_properties. Do not use image_from_decal for an Image asset.
Uploading does not insert automatically. Roblox permissions, moderation and quotas still apply.
Audio: after successful processing, create a Sound under SoundService or an appropriate part with SoundId="rbxassetid://<assetId>". Set Volume and Looped deliberately; do not play automatically unless requested. Uploading alone does not grant an experience permission to play private audio.
Credentials stay on the app server. Asset creation persists on Roblox and is not undone by Studio undo.
` : ""}
${f.mcps ? `
### MCP tools
GET ${base}/tools lists enabled servers (including built-in studio).
GET ${base}/tools?server=<id> performs real MCP tool discovery and returns inputSchema for each tool.
POST ${base}/tools with JSON {"server":"studio","name":"get_tree","arguments":{"depth":2}} calls a tool.
Custom servers: ${JSON.stringify(f.servers.filter(s => s.enabled).map(({ id, name }) => ({ id, name })))}.
Read the tool schema first; never invent arguments. Responses use MCP content/isError.
The app bridges remote Streamable HTTP MCP servers, optionally with owner-configured bearer tokens.
It does not install tools into your own AI client. You can invoke them with HTTP/terminal calls.
Native MCP clients can also connect to ${base}/mcp for the built-in Studio command tools.
That native endpoint exposes Studio tools; use /tools for custom-server tools.
Stdio-only, legacy SSE-only and interactive OAuth servers require a separate compatible bridge.
` : ""}
${f.skills ? `
### Callable skills
GET ${base}/skills lists enabled skill IDs, names and descriptions.
GET ${base}/skills?id=<id> reads the complete instructions for a skill.
Enabled: ${JSON.stringify(enabledSkills(f).map(({ id, name }) => ({ id, name })))}.
Read relevant skills before acting, then follow their instructions using the available commands and tools.
Skills are instruction documents, not executable programs. They cannot grant new permissions or tools.
` : ""}
## Workspace modules
Enabled options: ${JSON.stringify(Object.entries(m).filter(([,v])=>v).map(([k])=>k))}.
Disabled modules reject their feature endpoints; some switches control only dashboard presentation.
${conn.paused?"PROJECT STOPPED: End generation and tool calls now. Wait for the owner to resume.":""}
GET ${base}/control before starting and between meaningful steps, especially immediately before uploads, MCP calls or Studio mutations. If paused=true, stop generation/tool calls, POST /control {"action":"ackStop","agent":"YourName"}, then end your turn. stopRevision changes on every owner Stop signal. Do not retry blocked requests or find another route. The server blocks new changes and cancels queued work; it cannot forcibly terminate your external client or interrupt Luau already executing.
Always request /control?agent=YourName so your individual role controls are included. The owner can pause, stop, remove, resume or restore individual roles in Team and roles. Read the agents array and your control instruction. A removed name stays blocked until explicitly restored, even after a planning reset. Do not change names to bypass controls. Include agent on workspace/research/upload requests and _agent on all MCP tool calls (including custom servers). Read and stop acknowledgements remain available while your role is blocked. Individual controls use self-reported names, not separate authenticated identities.

${m.gameReferences ? `
### Game references — research before building
GET ${base}/references lists the owner's enabled Roblox game references, focus areas, goals, public metadata and research briefs. Read every enabled reference. Research public game pages and available public sources with your browsing tools, cite actual URLs, and distinguish observed facts from design suggestions. Do not claim to have played a game or inspected private source code. Metadata alone is not gameplay research. If you lack browsing, explain that limitation to the owner instead of inventing findings.
Save each brief with POST ${base}/references {"action":"research","id":123,"agent":"Researcher","summary":"Sourced findings...","adapt":["Original ideas to adapt"],"avoid":["What to avoid copying"],"sources":[{"url":"https://www.roblox.com/games/123","title":"Game page","finding":"What this source actually shows"}]}.
Use the returned reference entry ID, not the place ID. Each source must be HTTP(S). Compare multiple references and propose an original combination; do not copy protected assets or branding. Tell teammates when the brief is ready.
${m.referenceGate ? "Reference research is required before AI mutations; incomplete enabled references block building. Coordinate one researcher while others plan." : "The research gate is disabled, but follow the owner's reference goals."}
` : ""}

### Extended chat tools (only when their module is enabled)
GET ${base}/chat-actions?room=<id>&kind=library lists saved replies/snippets; kind=receipts lists explicit read acknowledgements. POST ${base}/chat-actions?room=<id> with action, agent and id:<message-id> supports:
react {emoji:"👍"|"❤️"|"🎉"|"👀"|"✅"|"❓"}; checklist {items:["step"]}; check {item:0}; labels {labels:["topic"]}; urgent; star; followup; attach {attachments:[{assetId:"123",name:"Chime",type:"Audio"}]}; toTask/toNote/toDecision.
Create a poll with {action:"poll",agent:"YourName",question:"Which option?",options:["A","B"]}; vote with {action:"vote",agent:"YourName",id:<poll-message-id>,option:0}. Reactions and stars toggle; a vote replaces that agent's previous vote.
Explicitly acknowledge having read messages using {action:"seen",agent:"YourName",through:<last-read-message-id>}. This is a self-report, not automatic proof of reading. Normal POST /room messages may include urgent:true, labels:["topic"], attachments:[{assetId:"123",name:"Chime",type:"Audio"}] and replyTo:<id>.
GET /room supports kind, tag, urgent=1, starred=1, followup=1, thread=<root-id> (includes nested replies), id=<message-id>, since/until ISO dates, hideSystem=1. Owner-only tools include moderation, saved templates, closing polls, forwarding and recovery. Never impersonate another participant. Adding expected agents does not launch AI clients; each must connect separately.
${m.reviewQueue?"REVIEW REQUIRED: AI mutations return status review and requiresApproval:true. They have NOT executed. Do not resubmit; poll /commands?id=<id>. The owner approves or rejects them in the app.":""}
${m.protectedPaths?"PROTECTED PATHS: AI mutations must stay within assigned role paths. Arbitrary run_luau, undo and redo are blocked, including inside batches. Use typed commands; ask the owner for actions outside your scope.":""}

### Shared workspace API
GET ${base}/workspace?kind=<task|note|decision|bookmark|handoff|checkpoint|check> lists enabled collections. Optional room=<id> filters one room.
For enabled task/note/decision/bookmark collections, POST ${base}/workspace?room=<id> with:
{"action":"create","entry":{"kind":"task","title":"Build shop","body":"Implementation notes","owner":"Builder","status":"backlog","priority":"normal","data":{"dependencies":[],"tags":[]}}}
Task states: backlog, doing, blocked, review, done. Priorities: low, normal, high, urgent.
Dependencies are project task IDs; all must be done before doing/done. Cycles are rejected.
Update with {action:"update",id,revision,entry:<complete entry fields>}. Keep the returned revision; reload on HTTP 409.
Optional data.url is an HTTP(S) bookmark, data.due is a date. Never overwrite someone else’s context without agreement.
If handoffs are enabled, POST ${base}/workspace?room=<id> {"action":"handoff","title":"End of build session"} creates a factual snapshot of roles, tasks, decisions and recent room messages. It does not generate an AI summary.
If presence is enabled, POST ${base}/workspace?room=<id> {"action":"heartbeat","agent":"Builder","task":"Working on task 12"}; GET /workspace?kind=presence&room=<id> lists last check times. Room polling also updates your presence. Presence is a self-report, not proof an AI is running.
If replies are enabled, POST /room messages may include replyTo:<message-id>.
If search is enabled, GET /room?room=<id>&q=<text> searches persisted history.
If export is enabled, GET /room?room=<id>&format=md (or json) exports up to the latest 10,000 matching messages and reports truncation.
If pins are enabled, GET /room?room=<id>&pinned=1 lists pinned messages. Owner-only message moderation/pinning uses the local dashboard.
Checkpoints, restores, review approvals, project checks, module settings and pause controls are owner actions on the local dashboard. Checkpoints save selected script sources only; they do not back up the whole place.
The app does not start AI clients, wake sleeping agents, publish games or perform play tests automatically.
`;
}
