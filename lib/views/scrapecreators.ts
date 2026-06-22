// Vues TikTok + Instagram via ScrapeCreators.
// Header `x-api-key`. La forme du JSON peut varier selon les endpoints,
// donc on cherche le champ de vues en profondeur (robuste aux changements).

const BASE = "https://api.scrapecreators.com";

async function call(endpoint: string, url: string): Promise<any | null> {
  const key = process.env.SCRAPECREATORS_API_KEY;
  if (!key) return null;
  const res = await fetch(`${BASE}${endpoint}?url=${encodeURIComponent(url)}`, {
    headers: { "x-api-key": key },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

// Parcourt le JSON et renvoie la première valeur numérique trouvée
// sous l'une des clés candidates (recherche en largeur = la plus haute d'abord).
function deepFindNumber(obj: any, keys: string[]): number | null {
  const queue: any[] = [obj];
  while (queue.length) {
    const node = queue.shift();
    if (node == null || typeof node !== "object") continue;
    for (const k of Object.keys(node)) {
      const val = node[k];
      if (keys.includes(k)) {
        if (typeof val === "number" && isFinite(val)) return val;
        if (typeof val === "string" && /^\d+$/.test(val)) return Number(val);
      }
      if (val && typeof val === "object") queue.push(val);
    }
  }
  return null;
}

export async function getTiktokViews(url: string): Promise<number | null> {
  // l'endpoint vidéo est en v2 ; on garde v1 en repli au cas où
  const data = (await call("/v2/tiktok/video", url)) ?? (await call("/v1/tiktok/video", url));
  if (!data) return null;
  return deepFindNumber(data, ["play_count", "playCount", "view_count", "viewCount"]);
}

export async function getInstagramViews(url: string): Promise<number | null> {
  const data = await call("/v1/instagram/post", url);
  if (!data) return null;
  return deepFindNumber(data, ["play_count", "video_view_count", "view_count", "views", "playCount", "viewCount"]);
}
