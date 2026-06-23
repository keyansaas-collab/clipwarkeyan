import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getViews, Platform } from "@/lib/views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Déclenché par le bouton « Rafraîchir les vues » côté admin.
// Vérifie que l'appelant est bien staff (owner/admin) via son jeton,
// puis relève les vues de chaque clip track/hold (même logique que le cron).
export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return Response.json({ error: "no token" }, { status: 401 });

  const db = supabaseAdmin();

  // qui est-ce ?
  const { data: userData, error: uErr } = await db.auth.getUser(token);
  if (uErr || !userData?.user) return Response.json({ error: "invalid token" }, { status: 401 });

  // est-il staff ?
  const { data: prof } = await db.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
  if (!prof || (prof.role !== "owner" && prof.role !== "admin")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: clips, error } = await db
    .from("clips")
    .select("id, platform, url, status")
    .in("status", ["track", "hold"]);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let inserted = 0, flagged = 0, skipped = 0;

  for (const clip of clips ?? []) {
    const views = await getViews(clip.platform as Platform, clip.url);
    if (views == null) { skipped++; continue; }

    const { data: last } = await db
      .from("view_snapshots")
      .select("views")
      .eq("clip_id", clip.id)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    await db.from("view_snapshots").insert({ clip_id: clip.id, views });
    inserted++;

    // gèle le clip si les vues baissent (signal anti-triche)
    if (last && views < last.views) {
      await db.from("clips").update({ status: "hold" }).eq("id", clip.id);
      await db.from("fraud_flags").insert({
        clip_id: clip.id, kind: "negative_progress",
        detail: `Vues en baisse : ${last.views} → ${views}`,
      });
      flagged++;
    } else if (clip.status === "hold" && last && views >= last.views) {
      // ré-armé si la progression repart
      await db.from("clips").update({ status: "track" }).eq("id", clip.id);
    }
  }

  return Response.json({ ok: true, clips: clips?.length ?? 0, inserted, flagged, skipped });
}
