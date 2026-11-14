import { enabledSkills } from "@/lib/features";
import { apiError, ApiError } from "@/lib/http-utils";
import { project, type Context } from "@/lib/project-api";
export const dynamic = "force-dynamic";
export async function GET(req: Request, ctx: Context) {
  try {
    const { settings } = await project(ctx);
    if (!settings.skills) throw new ApiError(403, "Skills are disabled.");
    const skills = enabledSkills(settings), id = new URL(req.url).searchParams.get("id");
    if (id) {
      const skill = skills.find(s => s.id === id);
      if (!skill) throw new ApiError(404, "Skill not found or disabled.");
      return Response.json({ skill });
    }
    return Response.json({ skills: skills.map(({ id, name, description }) => ({ id, name, description })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return apiError(e); }
}
