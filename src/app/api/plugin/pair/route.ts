import { derivePluginKey, findByToken, noStore } from "@/lib/bridge";
import { apiError, ApiError, jsonBody, ownerRequest } from "@/lib/http-utils";
export async function POST(req: Request) {
  try {
    ownerRequest(req);
    const body = await jsonBody(req, 4000);
    const conn = await findByToken(body.token);
    if (!conn) throw new ApiError(404, "Project not found. Copy the AI link from an existing project's Setup tab.");
    return Response.json({ key: derivePluginKey(body.token), name: conn.name }, { headers: noStore });
  } catch (e) { return apiError(e); }
}
