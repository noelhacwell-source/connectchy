import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  roomMessages,
  studioAgents,
  studioTopics,
  studioVideos,
} from "@/db/schema";
import {
  apiError,
  ApiError,
  ownerRequest,
  jsonBody,
  boundedBody,
} from "@/lib/http-utils";
import { project, type Context } from "@/lib/project-api";
import { requestRoom } from "@/lib/project-rooms";
import { guardAgentRequest } from "@/lib/room-coordination";
import { unseal } from "@/lib/secrets";
import { validId, validText } from "@/lib/studio-access";
import { changeTopic } from "@/lib/studio-topics";
import { isOnline, runCommand } from "@/lib/bridge";
import { COMMAND_DOCS } from "@/lib/command-docs";
import { VSCODE_COMMANDS, isVSCode } from "@/lib/vscode";
import { modules } from "@/lib/modules";

export async function POST(req: Request, ctx: Context) {
  try {
    ownerRequest(req);
    const { conn, settings } = await project(ctx);
    if (!settings.room || conn.paused)
      throw new ApiError(
        409,
        "Enable communication and resume the project first.",
      );
    const b = await jsonBody(req, 12000),
      room = await requestRoom(req, conn.id, !b.topicId),
      prompt = validText(b.prompt, 6000, "Prompt");
    const agentMatch = and(
      eq(studioAgents.connectionId, conn.id),
      eq(studioAgents.id, validId(b.agentId)),
    );
    const [agent] = await db.select().from(studioAgents).where(agentMatch);
    if (!agent?.provider || !agent.secret)
      throw new ApiError(404, "Choose an imported provider agent.");
    await guardAgentRequest(req, conn, agent.name);
    let context: string, task: string;
    const images: { type: "image_url"; image_url: { url: string } }[] = [];
    if (b.topicId) {
      const [topic] = await db
        .select()
        .from(studioTopics)
        .where(
          and(
            eq(studioTopics.roomId, room.id),
            eq(studioTopics.id, validId(b.topicId)),
          ),
        );
      if (
        !topic ||
        (topic.kind === "private" && !topic.members.includes(agent.id))
      )
        throw new ApiError(403, "This agent is not a participant.");
      if (topic.content.closed)
        throw new ApiError(409, "Reopen the conversation first.");
      context = JSON.stringify({
        kind: topic.kind,
        title: topic.title,
        description: topic.content.description,
        questions: topic.content.questions,
        recent: topic.content.posts
          .slice(-25)
          .map((p) => ({ author: p.author, text: p.text.slice(0, 1800) })),
      });
      task =
        topic.kind === "survey"
          ? 'Return JSON {"choices":[zero-based option index per question]} to cast your ballot.'
          : "Reply in plain text to this conversation.";
    } else {
      const history = await db
        .select({
          id: roomMessages.id,
          author: roomMessages.agent,
          text: roomMessages.text,
        })
        .from(roomMessages)
        .where(
          and(eq(roomMessages.roomId, room.id), isNull(roomMessages.deletedAt)),
        )
        .orderBy(desc(roomMessages.id))
        .limit(20);
      context = JSON.stringify(
        history.reverse().map((m) => ({ ...m, text: m.text.slice(0, 1800) })),
      );
      task =
        b.make === "survey"
          ? 'Return JSON {"title":"...","questions":[{"prompt":"...","options":["...","..."]}]}.'
          : b.make === "question"
            ? 'Return JSON {"title":"the question","description":"context"}.'
            : "Reply in plain text to the room.";
      if (b.make === "private") {
        const roster = await db
          .select({ id: studioAgents.id, name: studioAgents.name })
          .from(studioAgents)
          .where(eq(studioAgents.connectionId, conn.id));
        context += "\nAvailable agents: " + JSON.stringify(roster);
        task =
          'Create a private chat based on the user’s instructions. Return JSON {"title":"...","description":"...","members":[numeric directory IDs of the agents invited]}. The owner and you will be included.';
      }
      if (b.videoId) {
        if (!modules(settings.modules).chatAttachments)
          throw new ApiError(403, "Chat attachments are disabled.");
        const [clip] = await db
          .select({ frames: studioVideos.frames, meta: roomMessages.meta })
          .from(studioVideos)
          .innerJoin(roomMessages, eq(roomMessages.id, studioVideos.messageId))
          .where(
            and(
              eq(roomMessages.roomId, room.id),
              eq(roomMessages.id, validId(b.videoId)),
              isNull(roomMessages.deletedAt),
            ),
          );
        if (!clip) throw new ApiError(404, "Clip not found in this room.");
        if (b.videoInput === "caption") {
          context +=
            "\nClip caption and metadata: " + JSON.stringify(clip.meta.video);
          task +=
            " This request includes the clip caption and metadata. Answer from that text and the user's description. Be explicit when a question requires actually seeing or hearing the clip.";
        } else {
          context +=
            "\nSampled video frames in time order: " +
            JSON.stringify(clip.meta.video);
          task +=
            " This request includes still frames from the indicated times. Use those samples when answering questions about the visuals.";
          images.push(
            ...clip.frames.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          );
        }
      }
    }
    const code = isVSCode(conn.features);
    const commandCatalog = code ? VSCODE_COMMANDS : COMMAND_DOCS;
    const proposing = !b.topicId && b.make === "command";
    if (proposing) {
      task = 'Propose one editor command for the owner to review. Return JSON {"type":"command name","payload":{}}. The command has not been executed.';
      context += "\nAvailable commands: "+JSON.stringify(commandCatalog.map(c=>[c.type,c.payload]));
    }
    const editor = code ? "VS Code" : "Roblox Studio";
    const live = {editor, online:isOnline(conn), lastHeartbeat:conn.lastSeenAt, project:conn.name, place:conn.placeName, room:room.name, roster:room.team.participants.map(p => p.agent)};
    context += "\nCurrent bridge status: " + JSON.stringify(live);
    if (b.inspectEditor === true && live.online) {
      const result = await runCommand(conn, {type:code ? "code_get_workspace" : "get_tree", payload:code ? {} : {depth:1}, agent:agent.name, room:room.id, timeoutMs:10000});
      context += "\nEditor inspection result: " + JSON.stringify(result.body).slice(0,16000);
    }
    const content = prompt + "\n\nConversation context:\n" + context;
    const response = await fetch(agent.provider + "/chat/completions", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(90000),
      headers: {
        Authorization: "Bearer " + unseal(agent.secret),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: agent.model,
        messages: [
          {
            role: "system",
            content:
              "You are " + agent.name + ". " + agent.instructions + "\n" + task + "\nUse the current bridge status for connectivity. Report command execution or registration only when confirmed by the supplied results. A connected editor does not imply that an action was performed.",
          },
          {
            role: "user",
            content: images.length
              ? [{ type: "text", text: content }, ...images]
              : content,
          },
        ],
      }),
    });
    if (!response.ok)
      throw new ApiError(
        502,
        "Provider returned HTTP " +
          response.status +
          ". Check the model ID, key and supported input types." +
          (images.length
            ? " For a text model, select Caption and description."
            : ""),
      );
    const result = JSON.parse(
      (await boundedBody(response, 1000000)).toString("utf8"),
    );
    const answer = validText(
      result.choices?.[0]?.message?.content,
      64000,
      "Provider reply",
    );
    const latest = await project(ctx);
    if (
      !latest.settings.room ||
      latest.conn.paused ||
      latest.conn.stopRevision !== conn.stopRevision
    )
      throw new ApiError(409, "Project controls changed during this reply.");
    await guardAgentRequest(req, latest.conn, agent.name);
    await requestRoom(req, conn.id, !b.topicId);
    if (
      !(
        await db
          .select({ id: studioAgents.id })
          .from(studioAgents)
          .where(agentMatch)
      ).length
    )
      throw new ApiError(409, "Agent was removed.");
    function structured() {
      try {
        return JSON.parse(
          answer.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""),
        );
      } catch {
        throw new ApiError(
          422,
          "The provider returned an invalid structured reply. Try again.",
        );
      }
    }
    if (proposing) {
      const data = structured();
      if (!data || !commandCatalog.some(c=>c.type===data.type) || !data.payload || typeof data.payload!=="object" || Array.isArray(data.payload)) throw new ApiError(422,"The model proposed an invalid editor command.");
      return Response.json({proposal:{type:data.type,payload:data.payload,agent:agent.name,room:room.id,nonce:crypto.randomUUID()}});
    }
    if (b.topicId) {
      const vote = task.startsWith("Return JSON");
      return Response.json(
        await changeTopic(conn.id, room.id, agent, {
          action: vote ? "vote" : "post",
          id: b.topicId,
          ...(vote
            ? { choices: structured().choices }
            : { text: answer.slice(0, 6000) }),
        }),
      );
    }
    if (b.make === "survey" || b.make === "question" || b.make === "private") {
      const data = structured();
      return Response.json(
        await changeTopic(conn.id, room.id, agent, {
          action: "create",
          kind: b.make,
          title: data.title,
          description: data.description,
          questions: data.questions,
          members: data.members,
        }),
      );
    }
    const message = await db.transaction(async (tx) => {
      const [request] = await tx
        .insert(roomMessages)
        .values({
          connectionId: conn.id,
          roomId: room.id,
          agent: "Owner",
          text: prompt,
          replyTo: b.videoId ? validId(b.videoId) : null,
        })
        .returning({ id: roomMessages.id });
      const [reply] = await tx
        .insert(roomMessages)
        .values({
          connectionId: conn.id,
          roomId: room.id,
          agent: agent.name,
          text: answer.slice(0, 6000),
          replyTo: request.id,
        })
        .returning();
      return reply;
    });
    return Response.json({ message });
  } catch (e) {
    if (e instanceof SyntaxError)
      return apiError(
        new ApiError(502, "The provider returned an unreadable response."),
      );
    if (
      e instanceof TypeError ||
      (e instanceof Error && ["TimeoutError", "AbortError"].includes(e.name))
    )
      return apiError(
        new ApiError(
          502,
          "Could not reach the provider. Check its base URL and availability.",
        ),
      );
    return apiError(e);
  }
}
