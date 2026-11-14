import { and, eq, desc, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { workspaceEntries, roomMessages } from "@/db/schema";
import { project, type Context } from "@/lib/project-api";
import { modules } from "@/lib/modules";
import { ApiError, apiError, jsonBody, ownerRequest } from "@/lib/http-utils";
import { ensureActiveRoom } from "@/lib/project-rooms";
function parseGameUrl(value: string) {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new ApiError(400, "Paste a full Roblox game URL.");
  }
  if (
    u.protocol !== "https:" ||
    !["www.roblox.com", "roblox.com"].includes(u.hostname) ||
    u.username ||
    u.password
  )
    throw new ApiError(400, "Use an https://www.roblox.com/games/... link.");
  const id = u.pathname.match(/^\/(?:[a-z]{2}\/)?games\/(\d+)/i)?.[1];
  if (!id || id.length > 20)
    throw new ApiError(400, "The link must contain a numeric Roblox place ID.");
  return { placeId: id, url: `https://www.roblox.com/games/${id}` };
}
async function roblox(url: string) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    redirect: "error",
  });
  if (!r.ok) throw new Error(`Roblox HTTP ${r.status}`);
  return r.json();
}
export async function GET(_req: Request, ctx: Context) {
  try {
    const { conn, settings } = await project(ctx);
    if (!modules(settings.modules).gameReferences)
      throw new ApiError(403, "Game references are disabled.");
    return Response.json(
      {
        references: await db
          .select()
          .from(workspaceEntries)
          .where(
            and(
              eq(workspaceEntries.connectionId, conn.id),
              eq(workspaceEntries.kind, "reference"),
              isNull(workspaceEntries.archivedAt),
            ),
          )
          .orderBy(desc(workspaceEntries.id)),
        instruction:
          "For each enabled reference, inspect the public game information, research cited public sources with your own browsing tools, and save an original design brief via action research. Do not claim to have played or seen private source code.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request, ctx: Context) {
  try {
    const { conn, settings } = await project(ctx),
      m = modules(settings.modules);
    if (!m.gameReferences)
      throw new ApiError(403, "Game references are disabled.");
    const body = await jsonBody(req, 90000);
    await guardAgentRequest(req,conn,body.agent);
    if (conn.paused) {
      try {
        ownerRequest(req);
      } catch {
        throw new ApiError(
          423,
          "Project stopped. Wait for resume before writing research.",
        );
      }
    }
    if (body.action === "add") {
      ownerRequest(req);
      const p = z
        .object({
          url: z.string().max(2000),
          focus: z
            .array(
              z.enum([
                "art",
                "gameplay",
                "ui",
                "audio",
                "progression",
                "world",
              ]),
            )
            .max(6)
            .default(["gameplay"]),
          goal: z.string().max(3000).default(""),
        })
        .safeParse(body);
      if (!p.success)
        throw new ApiError(
          400,
          "Provide a Roblox URL, reference focus and optional goal.",
        );
      const parsed = parseGameUrl(p.data.url);
      let metadata: Record<string, unknown> = {};
      let warning = "";
      const sources = [parsed.url];
      try {
        const u = await roblox(
          `https://apis.roblox.com/universes/v1/places/${parsed.placeId}/universe`,
        );
        if (!u.universeId) throw new Error("No public universe");
        const detailsUrl = `https://games.roblox.com/v1/games?universeIds=${u.universeId}`;
        const games = await roblox(detailsUrl);
        const game = games.data?.[0];
        if (!game) throw new Error("No public game metadata");
        metadata = {
          universeId: u.universeId,
          name: game.name,
          description: game.description,
          creator: game.creator?.name,
          visits: game.visits,
          playing: game.playing,
          maxPlayers: game.maxPlayers,
          genre: game.genre,
          updated: game.updated,
        };
        sources.push(detailsUrl);
        try {
          const thumbs = await roblox(
            `https://thumbnails.roblox.com/v1/games/icons?universeIds=${u.universeId}&returnPolicy=PlaceHolder&size=512x512&format=Png&isCircular=false`,
          );
          metadata.thumbnail = thumbs.data?.[0]?.imageUrl;
        } catch {}
      } catch (e) {
        warning =
          e instanceof Error ? e.message : "Public metadata unavailable";
      }
      const entry = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${conn.id})`);
        const existing = await tx
          .select()
          .from(workspaceEntries)
          .where(
            and(
              eq(workspaceEntries.connectionId, conn.id),
              eq(workspaceEntries.kind, "reference"),
              isNull(workspaceEntries.archivedAt),
            ),
          );
        if (existing.length >= 30)
          throw new ApiError(
            400,
            "This project supports up to 30 game references.",
          );
        if (existing.some((e) => e.data.placeId === parsed.placeId))
          throw new ApiError(
            409,
            "That game is already in the reference library.",
          );
        const [row] = await tx
          .insert(workspaceEntries)
          .values({
            connectionId: conn.id,
            kind: "reference",
            title: String(
              metadata.name ?? `Roblox game ${parsed.placeId}`,
            ).slice(0, 160),
            body: "",
            status: "requested",
            data: {
              ...parsed,
              focus: p.data.focus,
              goal: p.data.goal,
              enabled: true,
              metadata,
              sources,
              metadataFetchedAt: new Date().toISOString(),
              warning,
            },
          })
          .returning();
        return row;
      });
      if (settings.room) {
        const room = await ensureActiveRoom(conn.id);
        await db
          .insert(roomMessages)
          .values({
            connectionId: conn.id,
            roomId: room.id,
            agent: "Coordinator",
            kind: "plan",
            text: `@all New game reference: ${entry.title}. Read /references, research its public design and save a cited adaptation brief before building. Focus: ${p.data.focus.join(", ")}. Goal: ${p.data.goal}`,
            mentions: ["all"],
          });
      }
      return Response.json({ ok: true, reference: entry });
    }
    const id = Number(body.id);
    if (!Number.isSafeInteger(id) || id < 1)
      throw new ApiError(400, "Invalid reference ID.");
    const [row] = await db
      .select()
      .from(workspaceEntries)
      .where(
        and(
          eq(workspaceEntries.id, id),
          eq(workspaceEntries.connectionId, conn.id),
          eq(workspaceEntries.kind, "reference"),
          isNull(workspaceEntries.archivedAt),
        ),
      );
    if (!row) throw new ApiError(404, "Reference not found.");
    if (body.action === "research") {
      const p = z
        .object({
          agent: z.string().min(1).max(40),
          summary: z.string().trim().min(30).max(30000),
          adapt: z.string().min(1).max(12000),
          avoid: z.string().max(12000).default(""),
          sources: z
            .array(
              z.object({
                url: z.url().refine((s) => /^https?:\/\//.test(s)),
                title: z.string().max(200),
                finding: z.string().min(1).max(3000),
              }),
            )
            .min(1)
            .max(30),
        })
        .safeParse(body);
      if (!p.success)
        throw new ApiError(
          400,
          "Provide agent, summary (30+ characters), adapt, avoid and at least one cited source with a finding.",
        );
      const [reference] = await db
        .update(workspaceEntries)
        .set({
          body: p.data.summary,
          status: "researched",
          data: {
            ...row.data,
            research: p.data,
            researchedAt: new Date().toISOString(),
          },
          revision: row.revision + 1,
          updatedAt: new Date(),
        })
        .where(eq(workspaceEntries.id, id))
        .returning();
      return Response.json({ ok: true, reference });
    }
    ownerRequest(req);
    if (body.action === "toggle") {
      if (typeof body.enabled !== "boolean")
        throw new ApiError(400, "Provide enabled true/false.");
      await db
        .update(workspaceEntries)
        .set({
          data: { ...row.data, enabled: body.enabled },
          updatedAt: new Date(),
        })
        .where(eq(workspaceEntries.id, id));
    } else if (body.action === "delete")
      await db
        .update(workspaceEntries)
        .set({ archivedAt: new Date() })
        .where(eq(workspaceEntries.id, id));
    else throw new ApiError(400, "Unknown reference action.");
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
import { guardAgentRequest } from "@/lib/room-coordination";
