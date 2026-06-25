import { NextRequest } from "next/server";
import { detectPlatform, getViews, Platform } from "@/lib/views";
import { rawDebug } from "@/lib/views/scrapecreators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Test :  /api/views/test?key=TON_CRON_SECRET&url=https://...
// Ajoute &raw=1 pour voir l'URL normalisée + la réponse brute (TikTok/Instagram).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("key") !== process.env.CRON_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = searchParams.get("url");
  if (!url) return Response.json({ error: "paramètre url manquant" }, { status: 400 });

  const platform = (searchParams.get("platform") as Platform) || detectPlatform(url);
  if (!platform) return Response.json({ error: "plateforme non reconnue dans l'URL" }, { status: 400 });

  if (searchParams.get("raw") === "1" && (platform === "tiktok" || platform === "instagram")) {
    return Response.json({ platform, ...(await rawDebug(platform, url)) });
  }

  const views = await getViews(platform, url);
  return Response.json({ platform, url, views });
}
