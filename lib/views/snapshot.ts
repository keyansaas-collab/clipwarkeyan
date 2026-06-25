import { getViews, Platform } from "@/lib/views";

type DB = ReturnType<typeof import("@/lib/supabase/admin").supabaseAdmin>;

const CONCURRENCY = 8;

export type SnapshotResult = {
  checked: number;
  inserted: number;
  flagged: number;
  skipped: number;
  byPlatform: Record<string, { ok: number; fail: number }>;
};

// Relève les vues de tous les clips track/hold, en parallèle par lots.
// Si clipperId est fourni, ne relève que les clips de ce clipper.
export async function runSnapshots(db: DB, clipperId?: string): Promise<SnapshotResult> {
  let q = db.from("clips").select("id, platform, url, status").in("status", ["track", "hold"]);
  if (clipperId) q = q.eq("clipper_id", clipperId);
  const { data: clips, error } = await q;
  if (error) throw new Error(error.message);

  const res: SnapshotResult = {
    checked: clips?.length ?? 0, inserted: 0, flagged: 0, skipped: 0,
    byPlatform: { tiktok: { ok: 0, fail: 0 }, instagram: { ok: 0, fail: 0 }, youtube: { ok: 0, fail: 0 } },
  };

  const list = clips ?? [];
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const chunk = list.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map((clip) => processOne(db, clip, res)));
  }
  return res;
}

async function processOne(db: DB, clip: any, res: SnapshotResult) {
  const plat = clip.platform as Platform;
  const bucket = res.byPlatform[plat] || (res.byPlatform[plat] = { ok: 0, fail: 0 });

  let views: number | null = null;
  try { views = await getViews(plat, clip.url); } catch { views = null; }

  if (views == null) { res.skipped++; bucket.fail++; return; }
  bucket.ok++;

  const { data: last } = await db
    .from("view_snapshots")
    .select("views")
    .eq("clip_id", clip.id)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await db.from("view_snapshots").insert({ clip_id: clip.id, views });
  res.inserted++;

  // Une baisse de vues n'est suspecte que si elle est SIGNIFICATIVE.
  // Les plateformes (surtout YouTube) recomptent et retirent quelques vues
  // invalides en permanence : une petite baisse est normale, pas de la triche.
  // On ne gèle que si la chute dépasse À LA FOIS un seuil absolu ET un %.
  // (modifiables ici)
  const DROP_ABS = 25;    // vues
  const DROP_PCT = 0.03;  // 3 % du compteur précédent
  if (last) {
    const drop = last.views - views;
    if (drop > DROP_ABS && drop > last.views * DROP_PCT) {
      await db.from("clips").update({ status: "hold" }).eq("id", clip.id);
      await db.from("fraud_flags").insert({
        clip_id: clip.id, kind: "negative_progress",
        detail: `Chute de vues : ${last.views} → ${views} (−${drop})`,
      });
      res.flagged++;
    }
  }
  // La remise en suivi d'un clip gelé se fait à la main (admin → Réactiver),
  // pour ne jamais défaire une mise en pause décidée par le staff.
}
