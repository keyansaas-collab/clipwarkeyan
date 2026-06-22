// Vues YouTube via l'API officielle (YouTube Data API v3).
// Gratuit dans le quota (10 000 unités/jour ; 1 relevé = 1 unité).

export function extractYoutubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || null;
    const v = u.searchParams.get("v");
    if (v) return v;
    // format /embed/<id> ou /v/<id>
    const m = u.pathname.match(/\/(embed|v)\/([^/?]+)/);
    return m ? m[2] : null;
  } catch {
    return null;
  }
}

export async function getYoutubeViews(url: string): Promise<number | null> {
  const id = extractYoutubeId(url);
  if (!id) return null;
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  const endpoint = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${id}&key=${key}`;
  const res = await fetch(endpoint, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  const v = data?.items?.[0]?.statistics?.viewCount;
  return v != null ? Number(v) : null;
}
