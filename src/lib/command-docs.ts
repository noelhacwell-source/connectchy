import {EXPANDED_ROBLOX_COMMANDS} from "./expanded-commands";
export type CommandDoc = {
  type: string;
  group: "Read" | "Build" | "Scripts" | "Assets" | "Control";
  summary: string;
  payload: string;
  example: Record<string, unknown>;
};

export const COMMAND_DOCS: CommandDoc[] = [
  ...EXPANDED_ROBLOX_COMMANDS,
  { type: "get_tree", group: "Read", summary: "Explorer tree. No path = the main services. Capped at 2000 nodes.", payload: "{ path?, depth? = 2 }", example: { path: "Workspace", depth: 3 } },
  { type: "get_instance", group: "Read", summary: "Properties, attributes, tags, children and (for scripts) source of one instance.", payload: "{ path }", example: { path: "Workspace/Baseplate" } },
  { type: "find", group: "Read", summary: "Find instances by name substring and/or class (IsA).", payload: "{ query?, className?, under?, limit? = 100 }", example: { className: "BasePart", under: "Workspace" } },
  { type: "list_scripts", group: "Read", summary: "Every Script / LocalScript / ModuleScript in the game with its line count.", payload: "{ under? }", example: {} },
  { type: "search_scripts", group: "Read", summary: "Search all script sources for plain text. Returns matching lines.", payload: "{ text, limit? = 100 }", example: { text: "RemoteEvent" } },
  { type: "get_selection", group: "Read", summary: "What the user currently has selected in Studio.", payload: "{}", example: {} },

  { type: "create_instance", group: "Build", summary: "Create any instance. 'children' nests more instances in one call.", payload: "{ className, parent, name?, properties?, children?: [{ className, name?, properties?, children? }] }", example: { className: "Part", parent: "Workspace", name: "Floor", properties: { Size: [40, 1, 40], Position: [0, 0, 0], Anchored: true, Color: [90, 200, 120], Material: "Enum.Material.Grass" } } },
  { type: "set_properties", group: "Build", summary: "Change properties on an existing instance.", payload: "{ path, properties }", example: { path: "Workspace/Floor", properties: { Transparency: 0.5 } } },
  { type: "rename", group: "Build", summary: "Rename an instance.", payload: "{ path, name }", example: { path: "Workspace/Floor", name: "Arena" } },
  { type: "move", group: "Build", summary: "Re-parent an instance.", payload: "{ path, parent }", example: { path: "Workspace/Arena", parent: "ReplicatedStorage" } },
  { type: "clone", group: "Build", summary: "Duplicate an instance, optionally into another parent / with new properties.", payload: "{ path, parent?, name?, properties? }", example: { path: "Workspace/Arena", name: "Arena2" } },
  { type: "delete", group: "Build", summary: "Destroy an instance and everything inside it.", payload: "{ path }", example: { path: "Workspace/Arena2" } },

  { type: "create_script", group: "Scripts", summary: "Create a Script, LocalScript or ModuleScript with source.", payload: "{ parent, name, scriptType? = 'Script', source }", example: { parent: "ServerScriptService", name: "Main", scriptType: "Script", source: "print('hello')" } },
  { type: "get_source", group: "Scripts", summary: "Read a script's source.", payload: "{ path }", example: { path: "ServerScriptService/Main" } },
  { type: "set_source", group: "Scripts", summary: "Replace a script's source.", payload: "{ path, source }", example: { path: "ServerScriptService/Main", source: "print('v2')" } },
  { type: "append_source", group: "Scripts", summary: "Append text to a script. Use it to send long scripts in several small requests.", payload: "{ path, source }", example: { path: "ServerScriptService/Main", source: "\nprint('more')" } },

  { type: "search_assets", group: "Assets", summary: "Search the Creator Store for free models or decals (images).", payload: "{ query, kind? = 'models' | 'decals' }", example: { query: "low poly tree", kind: "models" } },
  { type: "insert_asset", group: "Assets", summary: "Insert a model / mesh / sound / decal by asset id.", payload: "{ assetId, parent? = 'Workspace', name?, position?: [x,y,z] }", example: { assetId: 123456789, parent: "Workspace", position: [0, 5, 0] } },
  { type: "image_from_decal", group: "Assets", summary: "Turn a decal asset id into the image id usable in ImageLabel.Image / Decal.Texture.", payload: "{ assetId }", example: { assetId: 123456789 } },

  { type: "run_luau", group: "Control", summary: "Run Luau in the plugin context (full Studio API). Returns the values the chunk returns plus print output.", payload: "{ code }", example: { code: "local p = Instance.new('Part') p.Anchored = true p.Parent = workspace return p:GetFullName()" } },
  { type: "batch", group: "Control", summary: "Run many commands in order as one undo step. Much faster than separate requests. Always check 'allOk' / 'failed' in the result.", payload: "{ commands: [{ type, payload }], stopOnError? = true }", example: { commands: [{ type: "create_instance", payload: { className: "Folder", parent: "Workspace", name: "Map" } }, { type: "create_instance", payload: { className: "Part", parent: "Workspace/Map", name: "Wall", properties: { Anchored: true, Size: [20, 10, 1] } } }] } },
  { type: "set_selection", group: "Control", summary: "Select instances in Studio so the user sees what you built.", payload: "{ paths: [path] }", example: { paths: ["Workspace/Map"] } },
  { type: "undo", group: "Control", summary: "Undo the last change in Studio.", payload: "{}", example: {} },
  { type: "redo", group: "Control", summary: "Redo.", payload: "{}", example: {} },
  { type: "run_playtest", group: "Control", summary: "Start a real timed Studio Play or Run session (plugin 1.3.0+). Optional server-side assertion code runs in the test, with output and errors returned. A temporary test runner is removed afterwards. Does not publish the game or simulate keyboard/mouse input. Do not batch. Poll /commands?id when pending; never retry with a new nonce. Check result.passed, not just command ok.", payload: "{ mode?: 'play' | 'run' = 'play', duration?: integer 1..60 = 10, code?: server-side Luau (32 KB max) }", example: { mode: "play", duration: 15, code: "local Players = game:GetService('Players')\nlocal deadline = os.clock() + 10\nrepeat task.wait(0.1) until #Players:GetPlayers() > 0 or os.clock() > deadline\nassert(#Players:GetPlayers() > 0, 'No player spawned')\nreturn 'Player joined successfully'" } },
];

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** Plain-text instructions served at the agent link. Written for an AI to read. */
export function buildAgentDocs(base: string, name: string, online: boolean, place: string | null) {
  const groups = ["Read", "Build", "Scripts", "Assets", "Control"] as const;
  const reference = groups
    .map(
      (g) =>
        `### ${g}\n` +
        COMMAND_DOCS.filter((c) => c.group === g)
          .map((c) => `- \`${c.type}\` ${c.payload}\n  ${c.summary}\n  example payload: ${JSON.stringify(c.example)}`)
          .join("\n"),
    )
    .join("\n\n");
  const demo = { className: "Part", parent: "Workspace", name: "Hello", properties: { Anchored: true, Size: [4, 1, 4] } };

  return `# Connectchy - live connection to Roblox Studio

You are reading the control link for the Roblox Studio connection "${name}".
Studio is currently ${online ? `ONLINE${place ? ` (place: ${place})` : ""}` : "OFFLINE - the user must open Roblox Studio with the Connectchy plugin installed"}.

Every request you send through this link is executed inside the user's open Roblox Studio
session by a plugin: you can read the whole game, create and edit instances, write scripts,
build GUIs, insert Creator Store assets and run Luau. Treat this URL as a secret.

Base URL: ${base}

## How to send a command

POST (preferred, any size):
  POST ${base}/command
  Content-Type: application/json
  {"type":"create_instance","payload":${JSON.stringify(demo)}}

GET (works with fetch-only / browse-only tools):
  ${base}/run?type=get_tree&payload=${encodeURIComponent(JSON.stringify({ path: "Workspace", depth: 2 }))}
  ${base}/run?type=create_instance&b64=${b64(demo)}
  - payload = URL-encoded JSON, or b64 = base64url-encoded JSON (safer for code).
  - Add &nonce=<any unique string> to every GET that changes something. If your tool retries
    the request, the same nonce returns the first result instead of building twice.
  - Keep GET URLs under ~6000 characters. For long scripts use create_script with the first
    part, then append_source for the rest.

Response: {"id":12,"status":"done","ok":true,"result":{...},"error":null,"ms":140}
  - ok:false with an "error" string means the command failed inside Studio. Read it and fix.
  - HTTP 409 = Studio is offline. HTTP 202 = still running; read it later at
    ${base}/commands?id=<id>

Other endpoints:
  GET ${base}/status     connection state and place name
  GET ${base}/commands   recent command history (what has been built so far)

## Paths

Instances are addressed by slash paths starting at a service: "Workspace/Map/Wall",
"StarterGui/Hud/Frame/Title", "ServerScriptService/Main". When siblings share a name, the
2nd, 3rd... are addressed as "Part#2", "Part#3". Every create/rename/move returns the new path.

## Property values

- numbers, booleans, strings: as-is
- Vector3 [x,y,z] | Vector2 [x,y] | UDim2 [xScale,xOffset,yScale,yOffset] | UDim [scale,offset]
- Color3 [r,g,b] with 0-255 values, or "#rrggbb"
- Enums as strings: "Enum.Material.Neon"
- CFrame {"__type":"CFrame","position":[x,y,z],"rotation":[rx,ry,rz]} (degrees)
- Instance references (PrimaryPart, Adornee, Part0...): the path string
- Font {"__type":"Font","family":"rbxasset://fonts/families/GothamSSm.json","weight":"Bold"}
- Special keys inside properties: "Attributes": {name: value}, "Tags": ["tag"]
- Anything else (sequences, constraints, terrain): use run_luau.

## Commands

${reference}

## How to work

1. GET /status, then get_tree to see what already exists. Never assume an empty place.
2. Plan the game, then build in batches: map and parts, then server scripts in
   ServerScriptService, shared modules and RemoteEvents in ReplicatedStorage, LocalScripts in
   StarterPlayer/StarterPlayerScripts, GUIs as ScreenGui under StarterGui.
3. Prefer batch (or one run_luau that builds many parts in a loop) over hundreds of requests.
4. After each stage verify with get_tree / get_source. If a command fails, read the error.
5. Anchor static parts. Never write infinite loops in run_luau - it blocks the plugin.
6. For existing assets use search_assets or an asset ID. For new image/model files, check the
   optional uploads feature below. Uploads go through the app's Roblox API, not the Studio plugin.
7. Changes land in the user's open place and are undoable (Ctrl+Z or the undo command).
   Do not delete things you did not create unless the user asked.
`;
}
