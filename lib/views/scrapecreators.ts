// Vues TikTok + Instagram via ScrapeCreators.
// Header `x-api-key`. La forme du JSON varie selon les endpoints,
// donc on cherche le champ de vues en profondeur, par ordre de priorité.

const BASE = "https://api.scrapecreators.com";

async function call(endpoint: string, url: string): Promise<any | null> {
  const key = process.env.SCRAPECREATORS_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${BASE}${endpoint}?url=${encodeURIComponent(url)}`, {
      headers: { "x-api-key": key },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Cherche, DANS L'ORDRE DE PRIORITÉ des clés, la première valeur numérique > 0.
// (parcours en largeur : on privilégie les niveaux hauts de l'arbre)
function deepFindNumber(obj: any, keys: string[]): number | null {
  const queue: any[] = [obj];
  while (queue.length) {
    const node = queue.shift();
    if (node == null || typeof node !== "object") continue;
    for (const key of keys) {
      if (key in node) {
        const val = node[key];
        if (typeof val === "number" && isFinite(val) && val > 0) return val;
        if (typeof val === "string" && /^\d+$/.test(val) && Number(val) > 0) return Number(val);
      }
    }
    for (const k of Object.keys(node)) {
      if (node[k] && typeof node[k] === "object") queue.push(node[k]);
    }
  }
  return null;
}

const VIEW_KEYS = [
  "play_count", "video_play_count", "ig_play_count",
  "playCount", "video_view_count", "view_count", "viewCount", "views",
];

// Normalise une URL Instagram : /reels/ → /reel/, retire le tracking (?igsh=…),
// ne garde que /<type>/<id>/.
function normalizeIgUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean); // ex: ["reels","DZ-5XMWNLTu"]
    let type = parts[0];
    const id = parts[1];
    if (type === "reels") type = "reel";
    if (id && (type === "reel" || type === "p" || type === "tv")) {
      return `https://www.instagram.com/${type}/${id}/`;
    }
    return `https://www.instagram.com${u.pathname}`;
  } catch {
    return url;
  }
}

export async function getTiktokViews(url: string): Promise<number | null> {
  const data = (await call("/v2/tiktok/video", url)) ?? (await call("/v1/tiktok/video", url));
  if (!data) return null;
  return deepFindNumber(data, ["play_count", "playCount", "view_count", "viewCount", "views"]);
}

export async function getInstagramViews(url: string): Promise<number | null> {
  const data = await call("/v1/instagram/post", normalizeIgUrl(url));
  if (!data) return null;
  return deepFindNumber(data, VIEW_KEYS);
}

// Debug : renvoie l'URL normalisée + la réponse brute (pour diagnostiquer un champ).
export async function rawDebug(platform: "tiktok" | "instagram", url: string) {
  if (platform === "instagram") {
    const norm = normalizeIgUrl(url);
    const data = await call("/v1/instagram/post", norm);
    return { normalizedUrl: norm, found: data ? deepFindNumber(data, VIEW_KEYS) : null, raw: data };
  }
  const data = (await call("/v2/tiktok/video", url)) ?? (await call("/v1/tiktok/video", url));
  return { normalizedUrl: url, found: data ? deepFindNumber(data, ["play_count", "playCount", "view_count", "viewCount", "views"]) : null, raw: data };
}
