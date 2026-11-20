import { bigint, customType, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { DEFAULT_VIDEO_LIMIT_MB } from "@/lib/video-limits";
import { DEFAULT_FEATURES, type FeatureSettings } from "@/lib/features";
import { DEFAULT_TEAM, type TeamPlan } from "@/lib/team-types";

/**
 * A connection pairs one Roblox Studio plugin install with one agent link.
 * Only hashes of the credentials are stored: the agent token is shown once to
 * its owner, and the plugin key is derived from it on demand.
 */
export const connections = pgTable(
  "connections",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    pluginKeyHash: text("plugin_key_hash").notNull(),
    placeName: text("place_name"),
    placeId: text("place_id"),
    pluginVersion: text("plugin_version"),
    /** Public address the owner's browser uses for this dashboard. Printed in the AI docs. */
    origin: text("origin"),
    features: jsonb("features").$type<FeatureSettings>().notNull().default(DEFAULT_FEATURES),
    credentials: text("credentials"),
    team: jsonb("team").$type<TeamPlan>().notNull().default(DEFAULT_TEAM),
    activeRoomId: integer("active_room_id"),
    videoUploadLimitMb: bigint("video_upload_limit_mb", { mode: "number" }).default(DEFAULT_VIDEO_LIMIT_MB),
    paused: integer("paused").notNull().default(0),
    stopRevision:integer("stop_revision").notNull().default(0),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("connections_token_hash_idx").on(t.tokenHash),
    uniqueIndex("connections_plugin_key_hash_idx").on(t.pluginKeyHash),
  ],
);

/** Queue of commands for Studio. status: pending -> sent -> done | error */
export const commands = pgTable(
  "commands",
  {
    id: serial("id").primaryKey(),
    connectionId: integer("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    status: text("status").notNull().default("pending"),
    result: jsonb("result"),
    error: text("error"),
    source: text("source").notNull().default("agent"),
    agent: text("agent"),
    roomId: integer("room_id"),
    before: jsonb("before").$type<{path:string;source:string}[]>(),
    nonce: text("nonce"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("commands_conn_status_idx").on(t.connectionId, t.status),
    index("commands_conn_id_idx").on(t.connectionId, t.id),
  ],
);

export type Connection = typeof connections.$inferSelect;
export type Command = typeof commands.$inferSelect;

export const projectRooms = pgTable("project_rooms", {
  id: serial("id").primaryKey(),
  connectionId: integer("connection_id").notNull().references(() => connections.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  team: jsonb("team").$type<TeamPlan>().notNull().default(DEFAULT_TEAM),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const roomMessages = pgTable("room_messages", {
  id: serial("id").primaryKey(),
  connectionId: integer("connection_id").notNull().references(() => connections.id, { onDelete: "cascade" }),
  roomId: integer("room_id").references(() => projectRooms.id, { onDelete: "cascade" }),
  agent: text("agent").notNull(),
  text: text("text").notNull(),
  kind: text("kind").notNull().default("message"),
  paths: jsonb("paths").$type<string[]>().notNull().default([]),
  mentions: jsonb("mentions").$type<string[]>().notNull().default([]),
  pinned:integer("pinned").notNull().default(0),
  replyTo:integer("reply_to"),
  meta:jsonb("meta").$type<Record<string,unknown>>().notNull().default({}),
  editedAt:timestamp("edited_at",{withTimezone:true}),
  deletedAt:timestamp("deleted_at",{withTimezone:true}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("room_connection_id_idx").on(t.connectionId, t.id)]);

export const roomReads = pgTable("room_reads", {
  id: serial("id").primaryKey(),
  connectionId: integer("connection_id").notNull().references(() => connections.id, { onDelete: "cascade" }),
  roomId: integer("room_id").references(() => projectRooms.id, { onDelete: "cascade" }),
  agent: text("agent").notNull(),
  through: integer("through").notNull().default(0),
}, t => [uniqueIndex("room_reads_room_agent_idx").on(t.connectionId, t.roomId, t.agent)]);

export const uploads = pgTable("asset_uploads", {
  id: serial("id").primaryKey(),
  connectionId: integer("connection_id").notNull().references(() => connections.id, { onDelete: "cascade" }),
  requestId: text("request_id").notNull(),
  filename: text("filename").notNull(),
  assetType: text("asset_type").notNull(),
  operation: text("operation"),
  state: text("state").notNull().default("submitting"),
  result: jsonb("result").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("uploads_request_idx").on(t.connectionId, t.requestId)]);

export const workspaceEntries = pgTable("workspace_entries", {
  id:serial("id").primaryKey(),
  connectionId:integer("connection_id").notNull().references(()=>connections.id,{onDelete:"cascade"}),
  roomId:integer("room_id").references(()=>projectRooms.id,{onDelete:"cascade"}),
  kind:text("kind").notNull(),
  title:text("title").notNull(),
  body:text("body").notNull().default(""),
  owner:text("owner").notNull().default(""),
  status:text("status").notNull().default("backlog"),
  priority:text("priority").notNull().default("normal"),
  data:jsonb("data").$type<Record<string,unknown>>().notNull().default({}),
  revision:integer("revision").notNull().default(1),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
  updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
  archivedAt:timestamp("archived_at",{withTimezone:true}),
},t=>[index("entries_project_kind_idx").on(t.connectionId,t.kind)]);

export const agentPresence = pgTable("agent_presence", {
  id:serial("id").primaryKey(),
  connectionId:integer("connection_id").notNull().references(()=>connections.id,{onDelete:"cascade"}),
  roomId:integer("room_id").notNull().references(()=>projectRooms.id,{onDelete:"cascade"}),
  agent:text("agent").notNull(),
  task:text("task").notNull().default(""),
  lastSeenAt:timestamp("last_seen_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex("presence_room_agent_idx").on(t.roomId,t.agent)]);

export const chatReceipts=pgTable("chat_receipts",{id:serial("id").primaryKey(),roomId:integer("room_id").notNull().references(()=>projectRooms.id,{onDelete:"cascade"}),agent:text("agent").notNull(),through:integer("through").notNull().default(0),updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow()},t=>[uniqueIndex("chat_receipt_agent_idx").on(t.roomId,t.agent)]);
export const studioAgents = pgTable("studio_agents", {
  id: serial("id").primaryKey(),
  connectionId: integer("connection_id").notNull().references(() => connections.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  handle: text("handle").notNull(),
  keyHash: text("key_hash").notNull(),
  provider: text("provider"),
  model: text("model"),
  secret: text("secret"),
  instructions: text("instructions").notNull().default(""),
}, t => [uniqueIndex("studio_agent_name_idx").on(t.connectionId, t.handle)]);
export const studioTopics = pgTable("studio_topics", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull().references(() => projectRooms.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  members: jsonb("members").$type<number[]>().notNull().default([]),
  content: jsonb("content").$type<import("@/lib/studio-types").TopicContent>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("studio_topic_room_idx").on(t.roomId)]);
export const studioVideos = pgTable("studio_videos", {
  messageId: integer("message_id").primaryKey().references(() => roomMessages.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  original: text("original").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  frames: jsonb("frames").$type<string[]>().notNull(),
});

/**
 * One row per editor install that received a download from this dashboard, keyed
 * by a salted hash of the browser's install id. The raw id and IP are never
 * stored, so the counter can never be traced back to a person.
 */
export const installDownloads = pgTable(
  "install_downloads",
  {
    id: serial("id").primaryKey(),
    installHash: text("install_hash").notNull(),
    kind: text("kind").notNull(),
    version: text("version"),
    platform: text("platform"),
    connectionId: integer("connection_id").references(() => connections.id, { onDelete: "set null" }),
    firstDownloadedAt: timestamp("first_downloaded_at", { withTimezone: true }).notNull().defaultNow(),
    lastDownloadedAt: timestamp("last_downloaded_at", { withTimezone: true }).notNull().defaultNow(),
    downloads: integer("downloads").notNull().default(1),
  },
  (t) => [
    uniqueIndex("install_downloads_install_kind_idx").on(t.installHash, t.kind),
    index("install_downloads_kind_idx").on(t.kind),
  ],
);

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });
export const studioVideoChunks = pgTable("studio_video_chunks", {
  messageId: integer("message_id").notNull().references(() => studioVideos.messageId, { onDelete: "cascade" }),
  part: integer("part").notNull(),
  bytes: bytea("bytes").notNull(),
}, t => [primaryKey({ columns: [t.messageId, t.part] })]);
