import { pool } from "@/db";
import {
  apiError,
  ownerRequest,
  projectName,
  saveArchive,
  linkFor,
  noStore,
} from "@/lib/shared-projects";
export async function GET(req: Request) {
  try {
    ownerRequest(req);
    const { rows } = await pool.query(
      "select key,name,version,files,bytes,updated from shared_projects order by updated desc",
    );
    return Response.json(
      { projects: rows.map((p) => ({ ...p, link: linkFor(req, p.key) })) },
      { headers: noStore },
    );
  } catch (err) {
    return apiError(err);
  }
}
export async function POST(req: Request) {
  try {
    ownerRequest(req);
    const name = projectName(new URL(req.url).searchParams.get("name"));
    return Response.json(await saveArchive(req, { name }), {
      status: 201,
      headers: noStore,
    });
  } catch (err) {
    return apiError(err);
  }
}
