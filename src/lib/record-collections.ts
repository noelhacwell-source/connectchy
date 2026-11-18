import { WORKBENCH } from "./workbench-model";
import type { ModuleId } from "./modules";

type Collection = {
  label: string;
  feature?: ModuleId;
  scope: "room" | "project";
  behavior?: string;
};
export const RECORD_COLLECTIONS: Record<string, Collection> = {
  room: {
    label: "Rooms",
    feature: "roomManagement",
    scope: "project",
    behavior:
      "This permanently removes the rooms and their messages, videos, and records. A fresh room is created if needed.",
  },
  message: { label: "Messages", feature: "messageEditing", scope: "room" },
  video: {
    label: "Videos & images",
    feature: "chatAttachments",
    scope: "project",
    behavior:
      "This removes the video and its frames. The original message text stays in chat.",
  },
  survey: { label: "Surveys", scope: "room" },
  question: { label: "Questions", scope: "room" },
  private: { label: "Private chats", scope: "room" },
  task: { label: "Tasks", feature: "taskBoard", scope: "room" },
  note: { label: "Notes", feature: "notes", scope: "room" },
  decision: { label: "Decisions", feature: "decisions", scope: "room" },
  bookmark: { label: "Bookmarks", feature: "bookmarks", scope: "room" },
  handoff: { label: "Handoffs", feature: "handoffs", scope: "room" },
  checkpoint: { label: "Checkpoints", feature: "checkpoints", scope: "room" },
  check: { label: "Project checks", feature: "checks", scope: "room" },
  reference: {
    label: "References",
    feature: "gameReferences",
    scope: "project",
  },
  asset: {
    label: "Assets",
    feature: "assetLibrary",
    scope: "project",
    behavior:
      "This removes entries from the project library. Published Roblox assets remain in Roblox.",
  },
  activity: {
    label: "Completed activity",
    feature: "activity",
    scope: "project",
    behavior:
      "This clears entries from the activity list and preserves execution receipts.",
  },
  review: {
    label: "Waiting reviews",
    feature: "reviewQueue",
    scope: "project",
    behavior:
      "This discards pending proposals and preserves execution receipts.",
  },
  reply: {
    label: "Saved replies",
    feature: "chatSavedReplies",
    scope: "project",
  },
  snippet: { label: "Snippets", feature: "chatSnippets", scope: "project" },
  ...Object.fromEntries(
    Object.entries(WORKBENCH).map(([kind, definition]) => [
      "workbench:" + kind,
      { label: definition.label, feature: "missionControl", scope: "room" },
    ]),
  ),
};

export const COLLECTIONS_BY_TAB: Record<string, string[]> = {
  chat: ["message", "reply", "snippet", "room"],
  collaboration: ["survey", "question", "private"],
  videos: ["video"],
  mission: Object.keys(RECORD_COLLECTIONS).filter((kind) =>
    kind.startsWith("workbench:"),
  ),
  assets: ["asset"],
  reviews: ["review"],
  references: ["reference"],
  activity: ["activity"],
  console: ["activity"],
  ...Object.fromEntries(
    [
      "task",
      "note",
      "decision",
      "bookmark",
      "handoff",
      "checkpoint",
      "check",
    ].map((kind) => [kind, [kind]]),
  ),
};

export type ManagedRecord = {
  mime?: string;
  id: number;
  title: string;
  detail: string;
  state: string;
  author: string;
  date: string;
  revision?: number;
  roomId?: number;
};
