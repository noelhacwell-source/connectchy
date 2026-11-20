/** Versions stamped on a download so the counter can show what people install. */
export const PLUGIN_RELEASE_VERSION = "1.4.1";
export const VSCODE_RELEASE_VERSION = "0.3.2";
export const DOWNLOAD_KINDS = ["plugin", "vscode"] as const;
export type DownloadKind = (typeof DOWNLOAD_KINDS)[number];
export const DOWNLOAD_LABELS: Record<DownloadKind, string> = {
  plugin: "Roblox Studio plugin",
  vscode: "VS Code extension",
};
