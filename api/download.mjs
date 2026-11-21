const releases = "https://api.github.com/repos/noelhacwell-source/connectchy/releases";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const headers = { Accept: "application/vnd.github+json" };
    if (process.env.GITHUB_READ_TOKEN) headers.Authorization = "Bearer " + process.env.GITHUB_READ_TOKEN;
    const latest = await fetch(releases + "/latest", { headers });
    if (!latest.ok) throw Error();
    const asset = (await latest.json()).assets.find(item => item.name === "Connectchy.zip");
    if (!asset) throw Error();
    const download = await fetch(releases + "/assets/" + asset.id, {
      headers: { ...headers, Accept: "application/octet-stream" }, redirect: "manual"
    });
    const location = download.headers.get("location");
    if (download.status === 302 && location && new URL(location).protocol === "https:") {
      return res.redirect(302, location);
    }
    if (download.status !== 200 || !download.body) throw Error();
    const { Readable } = await import("node:stream");
    const { pipeline } = await import("node:stream/promises");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="Connectchy.zip"');
    await pipeline(Readable.fromWeb(download.body), res);
  } catch {
    if (!res.headersSent) res.status(503).send("Download temporarily unavailable. Please try again later.");
  }
}
