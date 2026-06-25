"use client";

// ─────────────────────────────────────────────────────────────
//  ClipWar — données ADMIN réelles
//  Appelle les fonctions SQL staff-only (patch 06) et expose des
//  structures typées au cockpit. Remplace les tableaux fictifs
//  clippersFull / adminClips / alerts / views7days / aVerserTotal.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

export type AdmClipStatus = "track" | "paid" | "hold" | "rejected";

export type AdmClipper = {
  id: string; name: string; rank: string; avatar_url: string | null; country: string | null; is_minor: boolean;
  tiktok: string | null; instagram: string | null; youtube: string | null;
  payout_method: string | null; payout_detail: string | null;
  clips: number; vues_total: number; vues_7: number; gain: number;
};

export type AdmClip = {
  id: string; clipper_id: string; clipper_name: string;
  campaign_id: string | null; campaign_name: string | null; rate: number;
  asset_id: string | null; asset_title: string | null;
  platform: string; url: string; status: AdmClipStatus; submitted_at: string;
  vues: number; net_7d: number; paid_views: number; due: number; gain: number;
  hold_reason?: string | null;
};

export type AdmPayment = {
  id: string; clipper_id: string; clipper_name: string | null;
  period_start: string; period_end: string;
  net_views: number; amount: number; status: string; created_at: string;
};

export type AdmDash = { vues_7: number; a_verser: number; clippers_actifs: number; pubs_7: number };
export type AdmViewDay = { day: string; net: number };
export type AdmAsset = { id: string; title: string; campaign_id: string | null; vues: number; downloads: number; clips: number };
export type AdmFraud = {
  id: number; clip_id: string | null; kind: string; detail: string | null; resolved: boolean;
  created_at: string; clipper_name: string | null; platform: string | null; asset_title: string | null;
  url?: string | null; clip_status?: string | null;
};

export type AdminData = {
  dash: AdmDash;
  clippers: AdmClipper[];
  clips: AdmClip[];
  views7: AdmViewDay[];
  assets: AdmAsset[];
  fraud: AdmFraud[];
  payments: AdmPayment[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

const EMPTY_DASH: AdmDash = { vues_7: 0, a_verser: 0, clippers_actifs: 0, pubs_7: 0 };
const n = (v: any) => Number(v) || 0;

export function useAdminData(enabled: boolean): AdminData {
  const [dash, setDash] = useState<AdmDash>(EMPTY_DASH);
  const [clippers, setClippers] = useState<AdmClipper[]>([]);
  const [clips, setClips] = useState<AdmClip[]>([]);
  const [views7, setViews7] = useState<AdmViewDay[]>([]);
  const [assets, setAssets] = useState<AdmAsset[]>([]);
  const [fraud, setFraud] = useState<AdmFraud[]>([]);
  const [payments, setPayments] = useState<AdmPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) { setLoading(false); return; }
    const sb = getSupabase();
    setLoading(true); setError(null);

    const [dashR, clippersR, clipsR, viewsR, assetsR, fraudR, payR] = await Promise.all([
      sb.rpc("admin_dashboard"),
      sb.rpc("admin_clippers"),
      sb.rpc("admin_clips"),
      sb.rpc("admin_views_7d"),
      sb.rpc("admin_assets"),
      sb.rpc("admin_fraud"),
      sb.rpc("admin_payments"),
    ]);

    const firstErr = [dashR, clippersR, clipsR, viewsR, assetsR, fraudR, payR].find((r) => r.error)?.error;
    if (firstErr) setError(firstErr.message);

    const d = (dashR.data || [])[0];
    setDash(d ? { vues_7: n(d.vues_7), a_verser: n(d.a_verser), clippers_actifs: n(d.clippers_actifs), pubs_7: n(d.pubs_7) } : EMPTY_DASH);

    setClippers((clippersR.data || []).map((r: any) => ({
      id: r.id, name: r.name, rank: r.rank, avatar_url: r.avatar_url, country: r.country, is_minor: !!r.is_minor,
      tiktok: r.tiktok, instagram: r.instagram, youtube: r.youtube,
      payout_method: r.payout_method, payout_detail: r.payout_detail,
      clips: n(r.clips), vues_total: n(r.vues_total), vues_7: n(r.vues_7), gain: n(r.gain),
    })));

    setClips((clipsR.data || []).map((r: any) => ({
      id: r.id, clipper_id: r.clipper_id, clipper_name: r.clipper_name,
      campaign_id: r.campaign_id, campaign_name: r.campaign_name, rate: n(r.rate),
      asset_id: r.asset_id, asset_title: r.asset_title,
      platform: r.platform, url: r.url, status: r.status, submitted_at: r.submitted_at,
      vues: n(r.vues), net_7d: n(r.net_7d), paid_views: n(r.paid_views), due: n(r.due), gain: n(r.gain),
      hold_reason: r.hold_reason ?? null,
    })));

    setViews7((viewsR.data || []).map((r: any) => ({ day: r.day, net: n(r.net) })));
    setAssets((assetsR.data || []).map((r: any) => ({
      id: r.id, title: r.title, campaign_id: r.campaign_id, vues: n(r.vues), downloads: n(r.downloads), clips: n(r.clips),
    })));
    setFraud((fraudR.data || []).map((r: any) => ({
      id: n(r.id), clip_id: r.clip_id, kind: r.kind, detail: r.detail, resolved: !!r.resolved,
      created_at: r.created_at, clipper_name: r.clipper_name, platform: r.platform, asset_title: r.asset_title,
      url: r.url ?? null, clip_status: r.clip_status ?? null,
    })));
    setPayments((payR.data || []).map((r: any) => ({
      id: r.id, clipper_id: r.clipper_id, clipper_name: r.clipper_name,
      period_start: r.period_start, period_end: r.period_end,
      net_views: n(r.net_views), amount: n(r.amount), status: r.status, created_at: r.created_at,
    })));

    setLoading(false);
  }, [enabled]);

  useEffect(() => { reload(); }, [reload]);

  return { dash, clippers, clips, views7, assets, fraud, payments, loading, error, reload };
}

// libellé court pour un type d'alerte anti-triche
export const fraudLabel: Record<string, string> = {
  negative_progress: "Progression négative",
  duplicate: "Doublon suspecté",
  deleted_after_pay: "Clip supprimé après bilan",
  spike: "Pic de vues anormal",
};
export const fraudIcon: Record<string, string> = {
  negative_progress: "!", duplicate: "⧉", deleted_after_pay: "∅", spike: "↑",
};
