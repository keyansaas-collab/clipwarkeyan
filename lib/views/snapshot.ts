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
// Écrit un snapshot par clip, gèle si les vues baissent, ré-arme si ça repart.
export async function runSnapshots(db: DB): Promise<SnapshotResult> {
  const { data: clips, error } = await db
    .from("clips")
    .select("id, platform, url, status")
    .in("status", ["track", "hold"]);
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

  if (last && views < last.views) {
    await db.from("clips").update({ status: "hold" }).eq("id", clip.id);
    await db.from("fraud_flags").insert({
      clip_id: clip.id, kind: "negative_progress",
      detail: `Vues en baisse : ${last.views} → ${views}`,
    });
    res.flagged++;
  } else if (clip.status === "hold" && last && views >= last.views) {
    await db.from("clips").update({ status: "track" }).eq("id", clip.id);
  }
}
