import { getYoutubeViews } from "./youtube";
import { getTiktokViews, getInstagramViews } from "./scrapecreators";

export type Platform = "tiktok" | "instagram" | "youtube";

export function detectPlatform(url: string): Platform | null {
  const u = url.toLowerCase();
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  return null;
}

// Renvoie le nombre de vues actuel d'un clip, selon sa plateforme.
// null = échec (vidéo introuvable, supprimée, ou clé absente).
export async function getViews(platform: Platform, url: string): Promise<number | null> {
  switch (platform) {
    case "youtube":   return getYoutubeViews(url);
    case "tiktok":    return getTiktokViews(url);
    case "instagram": return getInstagramViews(url);
    default:          return null;
  }
}
