const releases = "https://api.github.com/repos/noelhacwell-source/connectchy/releases";
export default async function handler(req, res) {
  const headers = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_READ_TOKEN) headers.Authorization = "Bearer " + process.env.GITHUB_READ_TOKEN;
  try {
    let downloads = 0;
    for (let page = 1; ; page++) {
      const response = await fetch(releases + "?per_page=100&page=" + page, { headers, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw Error("Release data unavailable");
      const batch = await response.json();
      for (const release of batch) {
        if (release.draft || release.prerelease) continue;
        for (const asset of release.assets) {
          if (asset.name === "Connectchy.zip") downloads += asset.download_count;
        }
      }
      if (batch.length < 100) break;
    }
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=86400");
    res.status(200).json({ downloads });
  } catch {
    res.status(503).json({ error: "Download count unavailable" });
  }
}
