"use client";

import React, { useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { CampaignReal, AssetReal } from "@/lib/catalog";

function detect(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("tiktok")) return "tiktok";
  if (u.includes("instagram")) return "instagram";
  if (u.includes("youtu")) return "youtube";
  return "";
}

export type SubmitPrefill = { assetId: string; campaignId: string | null };

export default function SubmitSheet({
  clipperId, campaigns, assets, prefill, onDone,
}: {
  clipperId: string;
  campaigns: CampaignReal[];
  assets: AssetReal[];
  prefill?: SubmitPrefill | null;
  onDone: () => void;
}) {
  const [url, setUrl] = useState("");
  const [plat, setPlat] = useState("tiktok");
  // attribution
  const initialCamp = prefill?.campaignId || (campaigns[0]?.id ?? "");
  const [campaignId, setCampaignId] = useState(initialCamp);
  const [assetId, setAssetId] = useState(prefill?.assetId ?? ""); // "" = clip original / sans asset
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // assets filtrés sur la campagne choisie (+ celui pré-rempli même si autre campagne)
  const campAssets = useMemo(
    () => assets.filter((a) => a.campaign_id === campaignId),
    [assets, campaignId]
  );

  function onUrl(v: string) {
    setUrl(v);
    const d = detect(v);
    if (d) setPlat(d);
  }
  function onCampaign(v: string) {
    setCampaignId(v);
    // si l'asset choisi n'appartient pas à la nouvelle campagne, on le réinitialise
    const a = assets.find((x) => x.id === assetId);
    if (a && a.campaign_id !== v) setAssetId("");
  }

  async function submit() {
    if (!url.trim()) { setErr("Colle le lien de ton clip."); return; }
    if (!campaignId) { setErr("Choisis une campagne."); return; }
    setBusy(true); setErr(null);
    const { error } = await getSupabase().from("clips").insert({
      clipper_id: clipperId,
      campaign_id: campaignId,
      asset_id: assetId || null,        // null = clip original / sans asset
      platform: plat,
      url: url.trim(),
      status: "track",
    });
    setBusy(false);
    if (error) {
      setErr(error.code === "23505" ? "Ce lien a déjà été soumis." : error.message);
      return;
    }
    onDone();
  }

  const prefillAsset = prefill ? assets.find((a) => a.id === prefill.assetId) : null;

  return (
    <>
      <h3>Soumettre un clip</h3>
      <p style={{ color: "var(--mut)", fontSize: 13 }}>On suit ses vues automatiquement dès l&apos;ajout.</p>

      {prefillAsset && (
        <div className="prefill" style={{ marginTop: 10 }}>↓ Pré-rempli depuis « {prefillAsset.title} » — corrige si besoin.</div>
      )}

      <div className="field">
        <label>Lien du clip</label>
        <input placeholder="https://tiktok.com/@..." value={url} onChange={(e) => onUrl(e.target.value)} />
      </div>

      <div className="field">
        <label>Plateforme</label>
        <select value={plat} onChange={(e) => setPlat(e.target.value)}>
          <option value="tiktok">TikTok</option>
          <option value="instagram">Instagram</option>
          <option value="youtube">YouTube</option>
        </select>
        <div className="prefill">Détectée automatiquement depuis le lien — corrige si besoin.</div>
      </div>

      <div className="field">
        <label>Campagne</label>
        <select value={campaignId} onChange={(e) => onCampaign(e.target.value)}>
          {campaigns.length === 0 && <option value="">Aucune campagne disponible</option>}
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="prefill">Indispensable pour savoir quel contenu a généré quelles vues.</div>
      </div>

      <div className="field">
        <label>Asset source</label>
        <select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
          <option value="">Clip original / sans asset</option>
          {campAssets.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
        <div className="prefill">Choisis l&apos;asset que tu as clippé, ou « clip original » si c&apos;est ton propre montage.</div>
      </div>

      <button className="btn btn-pri" style={{ marginTop: 18, padding: 14 }} onClick={submit} disabled={busy}>
        {busy ? "Envoi…" : "Soumettre le clip"}
      </button>
      {err && <div className="auth-err">{err}</div>}
    </>
  );
}
