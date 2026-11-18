import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { connections } from "@/db/schema";
import { apiError, ApiError, jsonBody, ownerRequest } from "@/lib/http-utils";
import { project, type Context } from "@/lib/project-api";
import { MAX_CONFIGURABLE_MB } from "@/lib/video-limits";

const schema = z.object({
  limitMb: z.number().int().min(1).max(MAX_CONFIGURABLE_MB).nullable(),
});

export async function PATCH(req: Request, ctx: Context) {
  try {
    ownerRequest(req);
    const { conn } = await project(ctx);
    const parsed = schema.safeParse(await jsonBody(req, 1024));
    if (!parsed.success)
      throw new ApiError(
        400,
        "Enter a positive whole number of MB or choose Unlimited.",
      );
    const [row] = await db
      .update(connections)
      .set({ videoUploadLimitMb: parsed.data.limitMb })
      .where(eq(connections.id, conn.id))
      .returning({ limitMb: connections.videoUploadLimitMb });
    if (!row) throw new ApiError(404, "Workspace not found.");
    return Response.json(row);
  } catch (e) {
    return apiError(e);
  }
}
