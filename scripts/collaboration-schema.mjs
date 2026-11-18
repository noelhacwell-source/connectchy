import pg from "pg";

// Existing installs can upgrade on startup without an interactive schema push.
export async function ensureCollaborationSchema(connectionString) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query(`BEGIN;
      SELECT pg_advisory_xact_lock(81476031);
      CREATE TABLE IF NOT EXISTS shared_projects (key text primary key, name text not null, version integer not null default 1, files integer not null, bytes bigint not null, updated timestamptz not null default now());
      CREATE TABLE IF NOT EXISTS shared_project_parts (key text references shared_projects(key) on delete cascade, part integer not null, bytes bytea not null, primary key(key,part));
      CREATE TABLE IF NOT EXISTS studio_agents (
        id serial PRIMARY KEY, connection_id integer NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
        name text NOT NULL, handle text NOT NULL, key_hash text NOT NULL, provider text, model text,
        secret text, instructions text NOT NULL DEFAULT ''
      );
      CREATE UNIQUE INDEX IF NOT EXISTS studio_agent_name_idx ON studio_agents(connection_id, handle);
      CREATE TABLE IF NOT EXISTS studio_topics (
        id serial PRIMARY KEY, room_id integer NOT NULL REFERENCES project_rooms(id) ON DELETE CASCADE,
        kind text NOT NULL, title text NOT NULL, author text NOT NULL, members jsonb NOT NULL DEFAULT '[]',
        content jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS studio_topic_room_idx ON studio_topics(room_id);
      CREATE TABLE IF NOT EXISTS studio_videos (
        message_id integer PRIMARY KEY REFERENCES room_messages(id) ON DELETE CASCADE,
        mime text NOT NULL, original text NOT NULL, frames jsonb NOT NULL
      );
      ALTER TABLE connections ADD COLUMN IF NOT EXISTS video_upload_limit_mb bigint DEFAULT 500;
      ALTER TABLE studio_videos ADD COLUMN IF NOT EXISTS size_bytes bigint;
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_attribute WHERE attrelid = 'studio_videos'::regclass
          AND attname = 'size_bytes' AND atttypid = 'integer'::regtype
        ) THEN
          ALTER TABLE studio_videos ALTER COLUMN size_bytes TYPE bigint;
        END IF;
      END $$;
      CREATE TABLE IF NOT EXISTS studio_video_chunks (
        message_id integer NOT NULL REFERENCES studio_videos(message_id) ON DELETE CASCADE,
        part integer NOT NULL, bytes bytea NOT NULL,
        PRIMARY KEY (message_id, part)
      );
      COMMIT;`);
  } finally {
    await client.end();
  }
}
