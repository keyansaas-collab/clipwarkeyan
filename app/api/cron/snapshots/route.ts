import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getViews, Platform } from "@/lib/views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Déclenché par le cron Vercel (voir vercel.json).
// Relève les vues de chaque clip "track"/"hold", écrit un snapshot,
// et gèle le clip si les vues baissent (signal anti-triche).
export async function GET(req: NextRequest) {
  // Vercel envoie automatiquement "Authorization: Bearer <CRON_SECRET>"
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data: clips, error } = await db
    .from("clips")
    .select("id, platform, url, status")
    .in("status", ["track", "hold"]);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  let inserted = 0, flagged = 0, skipped = 0;

  for (const clip of clips ?? []) {
    const views = await getViews(clip.platform as Platform, clip.url);
    if (views == null) { skipped++; continue; }  // vidéo introuvable/supprimée

    const { data: last } = await db
      .from("view_snapshots")
      .select("views")
      .eq("clip_id", clip.id)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    await db.from("view_snapshots").insert({ clip_id: clip.id, views });
    inserted++;

    // Progression négative = purge de bots probable → gel + flag.
    if (last && views < last.views) {
      await db.from("fraud_flags").insert({
        clip_id: clip.id,
        kind: "negative_progress",
        detail: `Vues passées de ${last.views} à ${views}`,
      });
      await db.from("clips").update({ status: "hold" }).eq("id", clip.id);
      flagged++;
    }
  }

  return Response.json({ checked: clips?.length ?? 0, inserted, flagged, skipped });
}
