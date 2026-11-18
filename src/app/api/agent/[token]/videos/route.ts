import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  connections,
  projectRooms,
  roomMessages,
  studioVideoChunks,
  studioVideos,
} from "@/db/schema";
import { apiError, ApiError, jsonBody } from "@/lib/http-utils";
import { project, type Context } from "@/lib/project-api";
import { requestRoom } from "@/lib/project-rooms";
import { studioActor, validId } from "@/lib/studio-access";
import { modules } from "@/lib/modules";
import { videoSizeLimitBytes } from "@/lib/video-limits";
import type { VideoInfo } from "@/lib/studio-types";

const partSize = 4 * 1024 * 1024;
const maxFrames = 8;
const maxFrameLength = 300_000;
const maxMetadataBytes = maxFrames * maxFrameLength + 64 * 1024;
// Keep the original JSON API available for existing agent clients.
const legacyMaxBytes = 50 * 1024 * 1024;
const legacyEncodedBytes = 4 * Math.ceil(legacyMaxBytes / 3);

const metadata = z.object({
  name: z.string().min(1).max(160),
  mime: z.enum(["video/mp4", "video/webm", "video/quicktime", "image/png", "image/jpeg", "image/webp", "image/gif"]),
  duration: z.number().nonnegative().max(86400),
  caption: z.string().max(4000),
  frames: z
    .array(
      z
        .string()
        .max(maxFrameLength)
        .regex(/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+=*$/),
    )
    .min(1)
    .max(maxFrames),
  times: z.array(z.number().nonnegative()).min(1).max(maxFrames),
});
const legacyInput = metadata.extend({
  original: z
    .string()
    .min(16)
    .max(legacyEncodedBytes)
    .regex(/^[A-Za-z0-9+/]+=*$/)
    .refine(
      (original) => Buffer.byteLength(original, "base64") <= legacyMaxBytes,
    ),
});
const binaryInput = metadata.extend({ size: z.number().int().min(12) });

async function access(ctx: Context) {
  const { conn, settings } = await project(ctx);
  if (!settings.room || !modules(settings.modules).chatAttachments)
    throw new ApiError(403, "Enable communication and chat attachments first.");
  return conn;
}

/** Read at most one storage part at a time, preserving leftover bytes across reads. */
function videoReader(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  let remaining: Uint8Array | undefined;
  return {
    async read(length: number) {
      const bytes = Buffer.allocUnsafe(length);
      let offset = 0;
      while (offset < length) {
        if (!remaining?.length) {
          const chunk = await reader.read();
          if (chunk.done) break;
          remaining = chunk.value;
        }
        const count = Math.min(length - offset, remaining.length);
        bytes.set(remaining.subarray(0, count), offset);
        offset += count;
        remaining = remaining.subarray(count);
      }
      return bytes.subarray(0, offset);
    },
    // Cancelling the request stream can close the socket before the error reaches the uploader.
    close: () => reader.releaseLock(),
  };
}

function validateVideo(input: z.infer<typeof metadata>, bytes: Buffer) {
  const validContainer =
    input.mime === "image/png" ? bytes.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a","hex"))
      : input.mime === "image/jpeg" ? bytes.subarray(0,3).equals(Buffer.from("ffd8ff","hex"))
      : input.mime === "image/webp" ? bytes.toString("ascii",0,4)==="RIFF" && bytes.toString("ascii",8,12)==="WEBP"
      : input.mime === "image/gif" ? ["GIF87a","GIF89a"].includes(bytes.toString("ascii",0,6))
      : input.mime === "video/webm"
      ? bytes.length >= 4 && bytes.readUInt32BE(0) === 0x1a45dfa3
      : bytes.toString("ascii", 4, 8) === "ftyp";
  if (
    !validContainer || (input.mime.startsWith("image/") ? input.duration !== 0 || input.frames.length !== 1 : input.duration <= 0) ||
    input.times.length !== input.frames.length ||
    input.times.some((t) => t > input.duration)
  )
    throw new ApiError(
      400,
      "The video container or frame timestamps are invalid.",
    );
}

function requireVideoSize(size: number, limitMb: number | null) {
  if (size > videoSizeLimitBytes(limitMb))
    throw new ApiError(
      413,
      `This workspace accepts videos up to ${limitMb} MB.`,
    );
}

async function saveVideo(
  connectionId: number,
  roomId: number,
  actor: { id: number; name: string },
  data: z.infer<typeof metadata>,
  source:
    | { original: string }
    | { size: number; reader: ReturnType<typeof videoReader> },
) {
  const { name, duration, times, caption, mime, frames } = data;
  return db.transaction(async (tx) => {
    const [message] = await tx
      .insert(roomMessages)
      .values({
        connectionId,
        roomId,
        agent: actor.name,
        text: caption || name,
        meta: { video: { mime, name, duration, times, caption } },
      })
      .returning();
    const binary = "reader" in source;
    await tx.insert(studioVideos).values({
      messageId: message.id,
      original: binary ? "" : source.original,
      sizeBytes: binary ? source.size : null,
      mime,
      frames,
    });
    if (binary) {
      for (let offset = 0; offset < source.size; offset += partSize) {
        const expected = Math.min(partSize, source.size - offset);
        const bytes = await source.reader.read(expected);
        if (bytes.length !== expected)
          throw new ApiError(
            400,
            "The upload ended before the full video arrived.",
          );
        if (offset === 0) validateVideo(data, bytes);
        await tx
          .insert(studioVideoChunks)
          .values({ messageId: message.id, part: offset / partSize, bytes });
      }
      if ((await source.reader.read(1)).length)
        throw new ApiError(400, "The video exceeds its stated size.");
      // The room or project may have changed while the file was uploading.
      const [current] = await tx
        .select({
          activeRoomId: connections.activeRoomId,
          paused: connections.paused,
          videoUploadLimitMb: connections.videoUploadLimitMb,
        })
        .from(connections)
        .where(eq(connections.id, connectionId));
      if (current.activeRoomId !== roomId || (actor.id && current.paused))
        throw new ApiError(
          409,
          "The active room or project status changed during upload.",
        );
      requireVideoSize(source.size, current.videoUploadLimitMb);
    }
    return message;
  });
}

export async function POST(req: Request, ctx: Context) {
  const streaming =
    req.headers.get("content-type")?.split(";")[0].trim() ===
    "application/octet-stream";
  try {
    const conn = await access(ctx);
    const actor = await studioActor(req, conn);
    const room = await requestRoom(req, conn.id, true);
    if (!streaming) {
      const parsed = legacyInput.safeParse(
        await jsonBody(req, legacyEncodedBytes + maxMetadataBytes),
      );
      if (!parsed.success)
        throw new ApiError(
          400,
          "The legacy JSON format accepts MP4, WebM or MOV up to 50 MiB with JPEG preview frames. Use the Videos tab for larger uploads.",
        );
      requireVideoSize(
        Buffer.byteLength(parsed.data.original, "base64"),
        conn.videoUploadLimitMb,
      );
      validateVideo(
        parsed.data,
        Buffer.from(parsed.data.original.slice(0, 24), "base64"),
      );
      const message = await saveVideo(conn.id, room.id, actor, parsed.data, {
        original: parsed.data.original,
      });
      return Response.json({ message }, { status: 201 });
    }
    const length = Number(req.headers.get("content-length"));
    requireVideoSize(length - maxMetadataBytes - 4, conn.videoUploadLimitMb);
    if (!req.body) throw new ApiError(400, "Attach a video.");
    const reader = videoReader(req.body);
    try {
      const prefix = await reader.read(4);
      if (prefix.length !== 4)
        throw new ApiError(400, "Missing video metadata.");
      const metadataLength = prefix.readUInt32BE();
      if (!metadataLength || metadataLength > maxMetadataBytes)
        throw new ApiError(400, "Invalid video metadata size.");
      const raw = await reader.read(metadataLength);
      if (raw.length !== metadataLength)
        throw new ApiError(400, "Incomplete video metadata.");
      let data: unknown;
      try {
        data = JSON.parse(raw.toString("utf8"));
      } catch {
        throw new ApiError(400, "Invalid video metadata.");
      }
      const parsed = binaryInput.safeParse(data);
      if (!parsed.success)
        throw new ApiError(
          400,
          "Provide an MP4, WebM or MOV with JPEG preview frames.",
        );
      const { size } = parsed.data;
      requireVideoSize(size, conn.videoUploadLimitMb);
      if (length && length !== size + metadataLength + 4)
        throw new ApiError(400, "The video size does not match the request.");
      const message = await saveVideo(conn.id, room.id, actor, parsed.data, {
        size,
        reader,
      });
      return Response.json({ message }, { status: 201 });
    } finally {
      reader.close();
    }
  } catch (e) {
    const response = apiError(e);
    // A rejected upload can leave bytes on the connection. Keep the error
    // response readable and tell HTTP/1 clients to use a fresh connection.
    if (streaming) response.headers.set("Connection", "close");
    return response;
  }
}

function streamVideo(messageId: number, start: number, end: number) {
  let offset = start;
  return new ReadableStream({
    async pull(controller) {
      const part = Math.floor(offset / partSize);
      const [row] = await db
        .select({ bytes: studioVideoChunks.bytes })
        .from(studioVideoChunks)
        .where(
          and(
            eq(studioVideoChunks.messageId, messageId),
            eq(studioVideoChunks.part, part),
          ),
        );
      const from = offset % partSize;
      const bytes = row?.bytes.subarray(from, from + end - offset + 1);
      if (!bytes?.length) throw new Error("Video data is no longer available.");
      controller.enqueue(bytes);
      offset += bytes.length;
      if (offset > end) controller.close();
    },
  });
}

export async function PATCH(req: Request, ctx: Context) {
  try {
    const conn = await access(ctx);
    const actor = await studioActor(req, conn);
    const id = validId(new URL(req.url).searchParams.get("id"));
    const parsed = metadata
      .pick({ caption: true })
      .extend({ name: z.string().trim().min(1).max(160) })
      .safeParse(await jsonBody(req, 32_768));
    if (!parsed.success)
      throw new ApiError(
        400,
        "Enter a title and a caption of up to 4,000 characters.",
      );
    const video = await db.transaction(async (tx) => {
      const [clip] = await tx
        .select({
          meta: roomMessages.meta,
          text: roomMessages.text,
          author: roomMessages.agent,
        })
        .from(roomMessages)
        .innerJoin(studioVideos, eq(studioVideos.messageId, roomMessages.id))
        .innerJoin(projectRooms, eq(roomMessages.roomId, projectRooms.id))
        .where(
          and(
            eq(roomMessages.id, id),
            eq(roomMessages.connectionId, conn.id),
            isNull(roomMessages.deletedAt),
            isNull(projectRooms.deletedAt),
          ),
        )
        .for("update", { of: roomMessages });
      if (!clip?.meta.video) throw new ApiError(404, "Video not found.");
      if (actor.id && clip.author !== actor.name)
        throw new ApiError(
          403,
          "Only the workspace owner or uploader can edit this clip.",
        );
      const previous = clip.meta.video as VideoInfo;
      const video = { ...previous, ...parsed.data };
      await tx
        .update(roomMessages)
        .set({
          meta: { ...clip.meta, video },
          text:
            clip.text === (previous.caption || previous.name)
              ? video.caption || video.name
              : clip.text,
        })
        .where(eq(roomMessages.id, id));
      return video;
    });
    return Response.json({ video });
  } catch (e) {
    return apiError(e);
  }
}

export async function GET(req: Request, ctx: Context) {
  try {
    const conn = await access(ctx);
    const q = new URL(req.url).searchParams;
    if (!q.has("id")) {
      const room = await requestRoom(req, conn.id);
      const clips = await db.select({id:studioVideos.messageId, meta:roomMessages.meta}).from(studioVideos)
        .innerJoin(roomMessages, eq(roomMessages.id, studioVideos.messageId))
        .where(and(eq(roomMessages.roomId, room.id), isNull(roomMessages.deletedAt)))
        .orderBy(desc(studioVideos.messageId));
      return Response.json({clips:clips.map(c => ({id:c.id, name:(c.meta.video as VideoInfo)?.name, caption:(c.meta.video as VideoInfo)?.caption}))}, {headers:{"Cache-Control":"no-store"}});
    }
    const id = validId(q.get("id"));
    const match = and(
      eq(studioVideos.messageId, id),
      eq(roomMessages.connectionId, conn.id),
      isNull(roomMessages.deletedAt),
      isNull(projectRooms.deletedAt),
    );
    if (q.get("frames") === "1") {
      const [row] = await db
        .select({ frames: studioVideos.frames, meta: roomMessages.meta })
        .from(studioVideos)
        .innerJoin(roomMessages, eq(roomMessages.id, studioVideos.messageId))
        .innerJoin(projectRooms, eq(roomMessages.roomId, projectRooms.id))
        .where(match);
      if (!row) throw new ApiError(404, "Video not found.");
      return Response.json(
        { video: row.meta.video, frames: row.frames },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const [row] = await db
      .select({
        original: studioVideos.original,
        size: studioVideos.sizeBytes,
        mime: studioVideos.mime,
      })
      .from(studioVideos)
      .innerJoin(roomMessages, eq(roomMessages.id, studioVideos.messageId))
      .innerJoin(projectRooms, eq(roomMessages.roomId, projectRooms.id))
      .where(match);
    if (!row) throw new ApiError(404, "Video not found.");

    const bytes =
      row.size === null ? Buffer.from(row.original, "base64") : null;
    const size = row.size ?? bytes!.length;
    const range = req.headers.get("range");
    const headers: Record<string, string> = {
      "Content-Type": row.mime,
      "Cache-Control": "private, no-store",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    };
    let start = 0;
    let end = size - 1;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match?.[1]) {
        start = Number(match[1]);
        if (match[2]) end = Math.min(end, Number(match[2]));
      } else if (match?.[2]) {
        start = Math.max(0, size - Number(match[2]));
      }
      if (!match || (!match[1] && !match[2]) || start > end || start >= size)
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    }
    headers["Content-Length"] = String(end - start + 1);
    return new Response(
      bytes ? bytes.subarray(start, end + 1) : streamVideo(id, start, end),
      {
        status: range ? 206 : 200,
        headers,
      },
    );
  } catch (e) {
    return apiError(e);
  }
}
