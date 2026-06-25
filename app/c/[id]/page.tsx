"use client";

import React, { useEffect, useState, use } from "react";
import { Icon } from "@/components/ui";
import { fmt } from "@/lib/data";
import { getSupabase } from "@/lib/supabase/client";

type Camp = {
  id: string; name: string; description: string | null; rate: number;
  accent: string | null; clips: number; vues: number; clippers: number;
};

export default function PublicCampaign({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [camp, setCamp] = useState<Camp | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    getSupabase().rpc("public_campaign", { p_id: id }).then(({ data }) => {
      const c = Array.isArray(data) ? data[0] : data;
      if (c) setCamp({ id: c.id, name: c.name, description: c.description, rate: Number(c.rate) || 0, accent: c.accent, clips: Number(c.clips) || 0, vues: Number(c.vues) || 0, clippers: Number(c.clippers) || 0 });
      else setNotFound(true);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="lp"><div className="lp-hero" style={{ minHeight: "60vh" }}><div className="lp-eyebrow"><span className="dot" /> Chargement…</div></div></div>;
  if (notFound || !camp) return (
    <div className="lp">
      <nav className="lp-nav"><a href="/"><img className="logo-img" src="/clipwar-logo.png" alt="ClipWar" /></a><a className="lp-btn ghost sm" href="/app">Ouvrir l&apos;app</a></nav>
      <header className="lp-hero"><h1 className="lp-h1">Campagne introuvable</h1><p className="lp-lead">Cette campagne n&apos;existe pas ou n&apos;est plus active.</p><a className="lp-btn pri" href="/">Voir les campagnes ouvertes</a></header>
    </div>
  );

  return (
    <div className="lp">
      <nav className="lp-nav">
        <a href="/"><img className="logo-img" src="/clipwar-logo.png" alt="ClipWar" /></a>
        <a className="lp-btn ghost sm" href="/app">Ouvrir l&apos;app</a>
      </nav>

      <header className="lp-hero" style={{ paddingTop: 30 }}>
        <div className="lp-eyebrow"><span className="dot" /> Campagne ouverte</div>
        <div style={{ width: 76, height: 76, borderRadius: 22, background: camp.accent || "var(--grad)", display: "grid", placeItems: "center", margin: "10px auto 14px" }}>
          <span style={{ fontSize: 32, fontWeight: 800, color: "#0a0610" }}>{camp.name[0]}</span>
        </div>
        <h1 className="lp-h1" style={{ fontSize: 38 }}>{camp.name}</h1>
        <p className="lp-lead">{camp.description || "Clippe ce contenu, poste sur TikTok / Insta / YouTube, et sois payé à tes vues réelles."}</p>
        <div style={{ display: "inline-flex", gap: 8, alignItems: "center", background: "var(--surf)", border: "1px solid var(--line2)", borderRadius: 99, padding: "8px 16px", margin: "4px 0 18px", fontWeight: 700 }}>
          <span className="g" style={{ fontSize: 18 }}>{camp.rate} € / 1000 vues</span>
        </div>
        <div className="lp-actions">
          <a className="lp-btn pri" href="/app">Clipper cette campagne</a>
          <a className="lp-btn ghost" href="/#how">Comment ça marche</a>
        </div>
      </header>

      <section className="lp-live">
        <div className="lp-live-top"><div className="ttl"><span className="dot" /> Performance de la campagne</div></div>
        <div className="lp-kpis">
          <div className="lp-kpi"><div className="v gr">{fmt(camp.vues)}</div><div className="l">vues générées</div></div>
          <div className="lp-kpi"><div className="v">{fmt(camp.clips)}</div><div className="l">clips postés</div></div>
          <div className="lp-kpi"><div className="v">{fmt(camp.clippers)}</div><div className="l">clippers</div></div>
        </div>
        <div className="lp-lock"><Icon name="alert" /> Crée ton compte pour récupérer le contenu et soumettre ton clip.</div>
      </section>

      <section className="lp-foot">
        <h2>Transforme tes vues en cash</h2>
        <p>Rejoins la campagne « {camp.name} » — paiement à tes vues réelles, sans arnaque.</p>
        <a className="lp-btn pri" href="/app">Rejoindre la campagne</a>
      </section>
      <div className="lp-copy">ClipWar · War Room — © 2026</div>
    </div>
  );
}
