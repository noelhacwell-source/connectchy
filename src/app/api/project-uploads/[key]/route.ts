import { pool } from "@/db";
import { ApiError, jsonBody } from "@/lib/http-utils";
import {
  apiError,
  ownerRequest,
  projectName,
  saveArchive,
  downloadArchive,
  linkFor,
  noStore,
} from "@/lib/shared-projects";
type Context = { params: Promise<{ key: string }> };
async function lookup(ctx: Context) {
  const { key } = await ctx.params;
  if (!/^[0-9a-f]{64}$/.test(key))
    throw new ApiError(404, "Project unavailable.");
  const {
    rows: [p],
  } = await pool.query(
    "select key,name,version,files,bytes from shared_projects where key=$1",
    [key],
  );
  if (!p) throw new ApiError(404, "Project unavailable.");
  return p;
}
export async function GET(req: Request, ctx: Context) {
  try {
    const p = await lookup(ctx),
      q = new URL(req.url).searchParams;
    if (q.has("download"))
      return downloadArchive(
        p.key,
        q.has("version") ? Number(q.get("version")) : null,
      ).catch(apiError);
    const url = linkFor(req, p.key),
      target = "project-" + p.key.slice(0, 10) + "-v" + p.version;
    const download = url + "?download=1&version=" + p.version;
    const install =
      "python -c \"import pathlib,tempfile,urllib.request,zipfile; d=pathlib.Path('" +
      target +
      "'); d.mkdir(); f=tempfile.TemporaryFile(); import shutil; shutil.copyfileobj(urllib.request.urlopen('" +
      download +
      "'),f); zipfile.ZipFile(f).extractall(d); print(d.resolve())\"";
    const windowsDownload = `$ErrorActionPreference='Stop'; $dest=Join-Path (Get-Location) '${target}'; if(Test-Path -LiteralPath $dest){throw 'Destination already exists'}; $zip=Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString()+'.zip'); try { Invoke-WebRequest -UseBasicParsing -Uri '${download}' -OutFile $zip; Expand-Archive -LiteralPath $zip -DestinationPath $dest } finally { if(Test-Path -LiteralPath $zip){Remove-Item -LiteralPath $zip} }`;
    const pack =
      "python -c \"import pathlib,zipfile; root=pathlib.Path('" +
      target +
      "'); assert root.is_dir(); z=zipfile.ZipFile('" +
      target +
      ".zip','w',zipfile.ZIP_DEFLATED); [z.write(p,p.relative_to(root)) for p in root.rglob('*')]; z.close()\"";
    const push =
      'curl -f -X PUT -H "Content-Type: application/zip" -H "X-Project-Version: ' +
      p.version +
      '" --data-binary "@' +
      target +
      '.zip" "' +
      url +
      '"';
    return new Response(
      [
        p.name + " · version " + p.version,
        "Download and unpack this project (Python 3):",
        install,
        "Windows PowerShell download and unpack (one command):",
        windowsDownload,
        "After editing, run these from the same parent directory:",
        pack,
        push,
        "A successful push replaces the entire project. Reopen this link for the latest version. Anyone with this link can download and replace this project.",
      ].join("\n\n"),
      { headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" } },
    );
  } catch (err) {
    return apiError(err);
  }
}
export async function PUT(req: Request, ctx: Context) {
  try {
    const p = await lookup(ctx);
    if (Number(req.headers.get("x-project-version")) !== p.version)
      throw new ApiError(
        409,
        "Use the current version from the project link before pushing.",
      );
    return Response.json(
      await saveArchive(req, { key: p.key, version: p.version }),
      { headers: noStore },
    );
  } catch (err) {
    return apiError(err);
  }
}
export async function PATCH(req: Request, ctx: Context) {
  try {
    ownerRequest(req);
    const p = await lookup(ctx);
    const name = projectName((await jsonBody(req, 2000)).name);
    await pool.query("update shared_projects set name=$2 where key=$1", [
      p.key,
      name,
    ]);
    return Response.json({ name });
  } catch (err) {
    return apiError(err);
  }
}
export async function DELETE(req: Request, ctx: Context) {
  try {
    ownerRequest(req);
    const p = await lookup(ctx);
    await pool.query("delete from shared_projects where key=$1", [p.key]);
    return Response.json({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
