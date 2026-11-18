import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { studioAgents, studioTopics } from "@/db/schema";
import { ApiError } from "./http-utils";
import { validId, validText } from "./studio-access";
import type { TopicContent } from "./studio-types";

type Actor = { id: number; name: string };
type Action = Record<string, unknown>;
const fields = z
  .array(
    z.object({
      prompt: z.string().trim().min(1).max(500),
      options: z
        .array(z.string().trim().min(1).max(150))
        .min(2)
        .max(10)
        .refine((a) => new Set(a).size === a.length),
    }),
  )
  .min(1)
  .max(12);

export async function changeTopic(
  connectionId: number,
  roomId: number,
  actor: Actor,
  b: Action,
) {
  if (b.action === "create") {
    const kind = String(b.kind),
      title = validText(b.title, 160, "Title");
    if (!["private", "survey", "question"].includes(kind))
      throw new ApiError(400, "Choose a conversation type.");
    const content: TopicContent = {
      description: String(b.description ?? "").slice(0, 4000),
      pinned: false,
      closed: false,
      tags: [],
      questions: [],
      ballots: {},
      posts: [],
      accepted: null,
      followers: [],
    };
    let members: number[] = [];
    if (kind === "survey") {
      const result = fields.safeParse(b.questions);
      if (!result.success)
        throw new ApiError(
          400,
          "Add 1–12 questions with 2–10 distinct choices each.",
        );
      content.questions = result.data;
    }
    if (kind === "private") {
      if (!Array.isArray(b.members) || b.members.length > 30)
        throw new ApiError(400, "Choose up to 30 participants.");
      members = [
        ...new Set([
          ...b.members.map(validId),
          ...(actor.id ? [actor.id] : []),
        ]),
      ];
      if (!members.length)
        throw new ApiError(400, "Select at least one agent.");
      const rows = await db
        .select({ id: studioAgents.id })
        .from(studioAgents)
        .where(
          and(
            eq(studioAgents.connectionId, connectionId),
            inArray(studioAgents.id, members),
          ),
        );
      if (rows.length !== members.length)
        throw new ApiError(400, "Unknown participant.");
    }
    const [topic] = await db
      .insert(studioTopics)
      .values({ roomId, kind, title, content, members, author: actor.name })
      .returning();
    return { topic };
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(studioTopics)
      .where(
        and(
          eq(studioTopics.roomId, roomId),
          eq(studioTopics.id, validId(b.id)),
        ),
      )
      .for("update");
    if (
      !row ||
      (row.kind === "private" && actor.id && !row.members.includes(actor.id))
    )
      throw new ApiError(404, "Conversation not found.");
    if (b.action === "delete") {
      await tx.delete(studioTopics).where(eq(studioTopics.id, row.id));
      return { deleted: row.id };
    }
    const c = row.content;
    let title = row.title;
    const post = c.posts.find((p) => p.id === b.postId);
    const editable = () => {
      if (c.closed)
        throw new ApiError(409, "Reopen this conversation to contribute.");
    };
    switch (b.action) {
      case "rename":
        title = validText(b.title, 160, "Title");
        break;
      case "describe":
        c.description = String(b.description ?? "").slice(0, 4000);
        break;
      case "pin":
        c.pinned = b.value === true;
        break;
      case "close":
        c.closed = b.value === true;
        break;
      case "follow":
        c.followers = c.followers.filter((n) => n !== actor.id);
        if (b.value === true) c.followers.push(actor.id);
        break;
      case "tags": {
        const tags = z
          .array(z.string().trim().min(1).max(32))
          .max(8)
          .safeParse(b.tags);
        if (!tags.success)
          throw new ApiError(400, "Use up to eight short tags.");
        c.tags = [...new Set(tags.data)];
        break;
      }
      case "duplicate": {
        if (row.kind === "private")
          throw new ApiError(
            400,
            "Start a new private chat to choose members.",
          );
        const [topic] = await tx
          .insert(studioTopics)
          .values({
            roomId,
            kind: row.kind,
            title: (title + " (copy)").slice(0, 160),
            author: actor.name,
            content: {
              ...c,
              pinned: false,
              closed: false,
              ballots: {},
              posts: [],
              accepted: null,
              followers: [],
            },
          })
          .returning();
        return { topic };
      }
      case "vote":
      case "withdraw": {
        editable();
        if (row.kind !== "survey") throw new ApiError(400, "Choose a survey.");
        if (b.action === "withdraw") delete c.ballots[actor.id];
        else {
          const choices = z
            .array(z.number().int().nonnegative())
            .safeParse(b.choices);
          if (
            !choices.success ||
            choices.data.length !== c.questions.length ||
            choices.data.some((v, i) => v >= c.questions[i].options.length)
          )
            throw new ApiError(400, "Choose one valid option per question.");
          c.ballots[actor.id] = choices.data;
        }
        break;
      }
      case "post": {
        editable();
        if (c.posts.length >= 500)
          throw new ApiError(
            409,
            "This thread holds 500 posts. Start another thread or remove old posts.",
          );
        c.posts.push({
          id: randomUUID(),
          actor: actor.id,
          author: actor.name,
          text: validText(b.text, 6000, "Message"),
          time: new Date().toISOString(),
          likes: [],
        });
        break;
      }
      case "editPost":
      case "removePost":
      case "like":
      case "accept": {
        if (!post) throw new ApiError(404, "Post not found.");
        if (b.action === "removePost") {
          c.posts = c.posts.filter((p) => p.id !== post.id);
          if (c.accepted === post.id) c.accepted = null;
        }
        if (b.action === "editPost") {
          editable();
          if (actor.id && actor.id !== post.actor)
            throw new ApiError(403, "Only the author can edit this post.");
          post.text = validText(b.text, 6000, "Message");
        }
        if (b.action === "like") {
          post.likes = post.likes.filter((n) => n !== actor.id);
          if (b.value === true) post.likes.push(actor.id);
        }
        if (b.action === "accept") {
          if (row.kind !== "question")
            throw new ApiError(400, "Choose a Q&A answer.");
          c.accepted = b.value === true ? post.id : null;
        }
        break;
      }
      default:
        throw new ApiError(400, "Unknown collaboration action.");
    }
    const [topic] = await tx
      .update(studioTopics)
      .set({ title, content: c, updatedAt: new Date() })
      .where(eq(studioTopics.id, row.id))
      .returning();
    return { topic };
  });
}
