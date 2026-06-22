"use client";

// ─────────────────────────────────────────────────────────────
//  ClipWar — catalogue RÉEL (campagnes + assets)
//  Source unique de vérité, lue depuis Supabase. Remplace les
//  constantes fictives `campaigns` / `assets` de lib/data.ts pour
//  toutes les surfaces que le clipper touche + les écrans Catalogue
//  de l'admin (Campagnes / Assets).
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

export type CampaignReal = {
  id: string;
  name: string;
  description: string | null;
  rate: number;            // € / 1000 vues nettes (= rate_per_1000)
  accent: string;          // gradient pour l'UI
  is_active: boolean;
  assetCount: number;      // nb d'assets rattachés
  clipCount: number;       // nb de clips rattachés (réel)
};

export type AssetReal = {
  id: string;
  campaign_id: string | null;
  title: string;
  duration: string | null;
  storage_url: string | null;
  source: string;
  downloads: number;       // compteur global réel
  clips: number;           // compteur global réel
};

export type Catalog = {
  campaigns: CampaignReal[];
  assets: AssetReal[];
  loading: boolean;
  reload: () => Promise<void>;
};

const FALLBACK_GRAD = "linear-gradient(135deg,#2DE2E6,#8B6CFF)";

export function useCatalog(enabled: boolean): Catalog {
  const [campaigns, setCampaigns] = useState<CampaignReal[]>([]);
  const [assets, setAssets] = useState<AssetReal[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!enabled) { setLoading(false); return; }
    const sb = getSupabase();
    setLoading(true);

    const [campRes, assetRes, aStatsRes, cStatsRes] = await Promise.all([
      sb.from("campaigns").select("id, name, description, rate_per_1000, accent, is_active").order("created_at", { ascending: true }),
      sb.from("assets").select("id, campaign_id, title, duration, storage_url, source").order("created_at", { ascending: false }),
      sb.rpc("asset_stats"),
      sb.rpc("campaign_stats"),
    ]);

    const aStats = new Map<string, { downloads: number; clips: number }>();
    (aStatsRes.data || []).forEach((r: any) => aStats.set(r.asset_id, { downloads: Number(r.downloads) || 0, clips: Number(r.clips) || 0 }));
    const cStats = new Map<string, { assets: number; clips: number }>();
    (cStatsRes.data || []).forEach((r: any) => cStats.set(r.campaign_id, { assets: Number(r.assets) || 0, clips: Number(r.clips) || 0 }));

    const camps: CampaignReal[] = (campRes.data || []).map((c: any) => {
      const s = cStats.get(c.id) || { assets: 0, clips: 0 };
      return {
        id: c.id,
        name: c.name,
        description: c.description,
        rate: Number(c.rate_per_1000) || 1,
        accent: c.accent || FALLBACK_GRAD,
        is_active: c.is_active !== false,
        assetCount: s.assets,
        clipCount: s.clips,
      };
    });

    const ass: AssetReal[] = (assetRes.data || []).map((a: any) => {
      const s = aStats.get(a.id) || { downloads: 0, clips: 0 };
      return {
        id: a.id,
        campaign_id: a.campaign_id,
        title: a.title,
        duration: a.duration,
        storage_url: a.storage_url,
        source: a.source || "drive",
        downloads: s.downloads,
        clips: s.clips,
      };
    });

    setCampaigns(camps);
    setAssets(ass);
    setLoading(false);
  }, [enabled]);

  useEffect(() => { reload(); }, [reload]);

  return { campaigns, assets, loading, reload };
}

// ── helpers (équivalents réels de campName / campGrad / initials) ──
export const campNameOf = (camps: CampaignReal[], id: string | null) =>
  camps.find((c) => c.id === id)?.name ?? "";
export const campGradOf = (camps: CampaignReal[], id: string | null) =>
  camps.find((c) => c.id === id)?.accent ?? FALLBACK_GRAD;
export const campRateOf = (camps: CampaignReal[], id: string | null) =>
  camps.find((c) => c.id === id)?.rate ?? 1;
export const initialsOf = (s: string) =>
  s.split(" ").map((w) => w[0] || "").join("").slice(0, 2).toUpperCase();
