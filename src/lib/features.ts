import { DEFAULT_MODULES, modules, type ModuleSettings } from "@/lib/modules";
export type McpConnection = { id: string; name: string; url: string; enabled: boolean; token?: string };
export type Skill = { id: string; name: string; description: string; instructions: string; enabled: boolean };
export type FeatureSettings = {
  mode?: "roblox" | "vscode";
  modules?: ModuleSettings;
  room: boolean; uploads: boolean; mcps: boolean; skills: boolean;
  creatorType: "userId" | "groupId"; creatorId: string;
  servers: McpConnection[]; customSkills: Skill[]; disabledBuiltinSkills: string[];
};
export const DEFAULT_FEATURES: FeatureSettings = {
  modules: DEFAULT_MODULES,
  room: false, uploads: false, mcps: false, skills: false,
  creatorType: "userId", creatorId: "", servers: [], customSkills: [], disabledBuiltinSkills: [],
};
export const BUILTIN_SKILLS: Skill[] = [
  { id: "inspect-first", name: "Inspect before building", description: "Understand the place and plan changes before editing.", enabled: true,
    instructions: "Call get_tree, list_scripts and get_selection. Read relevant scripts with get_source. Check recent /commands and, if enabled, /room for other agents' work. State your plan and the paths you will modify. Preserve existing work. Use small batches, inspect results, and report the exact paths changed. Never claim to play-test when you have only inspected code." },
  { id: "roblox-ui", name: "Build Roblox UI", description: "Create responsive, readable interfaces in Studio.", enabled: true,
    instructions: "Inspect StarterGui before creating UI. Create a ScreenGui with ResetOnSpawn=false, use scale-based layouts with sensible size constraints, UIListLayout/UIPadding and readable text. Keep interaction in LocalScripts and validate privileged actions on the server. Inspect the resulting tree and scripts. Ask the owner to play-test interaction; this bridge cannot verify rendered gameplay." },
  { id: "coordinate", name: "Coordinate shared work", description: "Avoid overwriting another AI's changes.", enabled: true,
    instructions: "An empty room is not permission to start. Read /room/team, register a unique agent name, role and exact paths with action join, discuss non-overlapping work, then mark ready. Wait for team.phase=active and every expected AI to be ready. The owner controls expected team size. Read /room?agent=your-name, process attention.unacknowledgedPings FIRST and explicitly acknowledge read pings. Include your agent name on edit commands (_agent in MCP arguments). Ping @Owner or teammates for decisions. Re-read scripts before editing and inspect /commands. Only work on your agreed role. Mark your role done through /room/team and post results. Roles are not a security sandbox; do not run undo over another agent's work." },
];
export function featureSettings(value: Partial<FeatureSettings> | null | undefined): FeatureSettings {
  return { ...DEFAULT_FEATURES, ...value, modules: modules(value?.modules) };
}
export function enabledSkills(settings: FeatureSettings) {
  const builtins=BUILTIN_SKILLS.map(skill=>settings.mode!=="vscode"?skill:skill.id==="inspect-first"?{...skill,instructions:"Call code_get_workspace, code_list_files, code_get_active_editor and code_get_diagnostics. Read relevant files with code_read_file before proposing edits. Keep expectedSha256 from the current read. Agree exact relative paths with teammates and inspect recent commands. Check terminal exit codes and test output before claiming success."}:skill.id==="roblox-ui"?{...skill,name:"Build application UI",description:"Build interfaces in the connected code project.",instructions:"Inspect the existing application and UI framework first. Read files and understand routing, styles and accessibility. Propose small, consistent edits with current SHA-256 baselines. Use approved commands to build or test; do not claim a visual or interaction test from code inspection alone."}:skill);
  return [...builtins.filter(s=>!settings.disabledBuiltinSkills.includes(s.id)),...settings.customSkills].filter(s=>s.enabled);
}
