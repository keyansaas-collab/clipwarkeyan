"use client";

import React, { useState } from "react";
import { Hud } from "./ui";
import { fmt, euro, platLabel, agoLabel, challenges } from "@/lib/data";
import { Catalog, AssetReal, campNameOf, campGradOf, initialsOf } from "@/lib/catalog";
import {
  useAdminData, AdminData, AdmClipper, AdmClip, AdmAsset, AdmViewDay,
  fraudLabel, fraudIcon,
} from "@/lib/adminData";

export type AdmActions = {
  go: (tab: string) => void;
  openImport: () => void;
  openClipper: (id: string) => void;
  openNewChallenge: () => void;
  openNewCampaign: () => void;
  openPayVerify: (id: string) => void;
  showToast: (m: string) => void;
};

/* ───────────── helpers ───────────── */
const WD = ["D", "L", "M", "M", "J", "V", "S"]; // dim→sam
function wdOf(dateStr: string) {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return WD[new Date(y, (m || 1) - 1, d || 1).getDay()];
}
function last7Window() {
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 6);
  return start;
}
function pubsLast7(dates: string[]): number[] {
  const counts = new Array(7).fill(0);
  const start = last7Window();
  dates.forEach((s) => {
    const t = new Date(s);
    const diff = Math.floor((t.getTime() - start.getTime()) / 864e5);
    if (diff >= 0 && diff < 7) counts[diff]++;
  });
  return counts;
}
function last7Labels(): string[] {
  const start = last7Window(); const out: string[] = [];
  for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); out.push(WD[d.getDay()]); }
  return out;
}
const pillOf = (st: string) =>
  ({ track: ["p-track", "En suivi"], paid: ["p-paid", "Payé"], hold: ["p-hold", "Gelé"], rejected: ["p-hold", "Rejeté"] } as Record<string, string[]>)[st] || ["p-track", st];
const deltaClass = (d: number) => (d > 0 ? "up" : d < 0 ? "down" : "flat");
const deltaTxt = (d: number) => (d > 0 ? "+" : "") + fmt(d);

function Bars({ data, labels }: { data: number[]; labels?: string[] }) {
  const max = Math.max(...data, 1);
  return (
    <>
      <div className="adm-bars">{data.map((v, i) => <div key={i} className="adm-bar" style={{ height: Math.max(6, (v / max) * 100) + "%" }} title={fmt(v)} />)}</div>
      {labels && <div className="adm-daylabels">{labels.map((l, i) => <span key={i}>{l}</span>)}</div>}
    </>
  );
}

/* ───────────── CLIP cliquable ───────────── */
function ClipRowLink({ c, showClipper }: { c: AdmClip; showClipper?: boolean }) {
  const pill = pillOf(c.status);
  const ago = c.submitted_at ? agoLabel(Math.max(0, Math.floor((Date.now() - new Date(c.submitted_at).getTime()) / 864e5))) : "";
  return (
    <a className="row cliprow" href={c.url} target="_blank" rel="noopener noreferrer">
      <div className="thumb" style={{ background: "var(--surf2)", color: "var(--mut)" }}>{(platLabel[c.platform] || c.platform)[0]}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="t" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {c.asset_title || "(contenu original)"} <span className="ext">↗</span>
        </div>
        <div className="s">
          {showClipper ? c.clipper_name + " · " : ""}{platLabel[c.platform] || c.platform} · {ago} <span className={"pill " + pill[0]} style={{ marginLeft: 4 }}>{pill[1]}</span>
        </div>
      </div>
      <div className="end">
        <div className="vue">{fmt(c.vues)}</div>
        <div className={"delta " + deltaClass(c.net_7d)}>{deltaTxt(c.net_7d)} · 7 j</div>
      </div>
    </a>
  );
}

/* ───────────── CLIPS (flux + filtres + tri) ───────────── */
function ClipsFeed({ data, catalog }: { data: AdminData; catalog: Catalog }) {
  const [plat, setPlat] = useState("all");
  const [camp, setCamp] = useState("all");
  const [stat, setStat] = useState("all");
  const [sort, setSort] = useState("date");

  let list = data.clips.filter((c) =>
    (plat === "all" || c.platform === plat) &&
    (camp === "all" || c.campaign_id === camp) &&
    (stat === "all" || c.status === stat || (stat === "hold" && c.status === "rejected"))
  );
  list = [...list].sort((a, b) =>
    sort === "vues" ? b.vues - a.vues : new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
  );

  return (
    <>
      <div className="eyebrow" style={{ marginTop: 14 }}>Flux des publications</div>
      <h2 className="display" style={{ fontSize: 22, margin: "4px 0 6px" }}>Clips</h2>
      <div className="adm-filters">
        <select value={plat} onChange={(e) => setPlat(e.target.value)}>
          <option value="all">Toutes plateformes</option><option value="tiktok">TikTok</option><option value="instagram">Instagram</option><option value="youtube">YouTube</option>
        </select>
        <select value={camp} onChange={(e) => setCamp(e.target.value)}>
          <option value="all">Toutes campagnes</option>{catalog.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={stat} onChange={(e) => setStat(e.target.value)}>
          <option value="all">Tous statuts</option><option value="track">En suivi</option><option value="paid">Payé</option><option value="hold">Gelé</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="date">Trier : récent</option><option value="vues">Trier : vues</option>
        </select>
      </div>
      <div style={{ fontSize: 12, color: "var(--mut)", margin: "2px 2px 8px" }}>{list.length} clip{list.length > 1 ? "s" : ""}</div>
      <div className="card">
        {data.loading ? <div className="empty">Chargement…</div>
          : list.length ? list.map((c) => <ClipRowLink key={c.id} c={c} showClipper />) : <div className="empty">Aucun clip pour ces filtres.</div>}
      </div>
    </>
  );
}

/* ───────────── DASHBOARD ───────────── */
function PepiteRow({ a, catalog }: { a: AdmAsset; catalog: Catalog }) {
  const ratio = a.downloads ? Math.round(a.vues / a.downloads) : 0;
  const pct = Math.min(100, (ratio / 8000) * 100);
  const name = campNameOf(catalog.campaigns, a.campaign_id) || "Asset";
  return (
    <div className="row" style={{ alignItems: "flex-start" }}>
      <div className="thumb" style={{ background: campGradOf(catalog.campaigns, a.campaign_id) }}>{name[0]}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="t" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.title}</div>
        <div className="s">{fmt(a.vues)} vues · {a.clips} clips · ↓ {fmt(a.downloads)}</div>
        <div className="meter"><i style={{ width: pct + "%", background: "var(--grad)" }} /></div>
      </div>
      <div className="end"><div className="vue mono">{a.downloads ? fmt(ratio) : "—"}</div><div className="delta flat">vues / dl</div></div>
    </div>
  );
}

function Dash({ data, catalog, actions }: { data: AdminData; catalog: Catalog; actions: AdmActions }) {
  const pepites = [...data.assets].filter((a) => a.downloads > 0).sort((a, b) => b.vues / b.downloads - a.vues / a.downloads).slice(0, 3);
  const topClippers = [...data.clippers].sort((a, b) => b.vues_7 - a.vues_7).slice(0, 3);
  const viewsData = data.views7.map((v) => v.net);
  const viewsLabels = data.views7.length ? data.views7.map((v) => wdOf(v.day)) : last7Labels();
  const topAlert = data.fraud[0];

  return (
    <>
      <div className="adm-kpis">
        <div className="adm-kpi"><div className="v gr">{data.dash.vues_7 >= 1e6 ? (Math.round(data.dash.vues_7 / 1e5) / 10) + "M" : fmt(data.dash.vues_7)}</div><div className="l">vues nettes · 7 j</div></div>
        <div className="adm-kpi"><div className="v">{euro(data.dash.a_verser)}</div><div className="l">à verser (est.)</div></div>
        <div className="adm-kpi"><div className="v">{data.dash.clippers_actifs}</div><div className="l">clippers actifs</div></div>
        <div className="adm-kpi"><div className="v">{data.dash.pubs_7}</div><div className="l">pubs · 7 j</div></div>
      </div>

      <div className="sec-h"><h2>Vues nettes · 7 derniers jours</h2></div>
      <div className="card">
        {viewsData.some((v) => v > 0) ? <Bars data={viewsData} labels={viewsLabels} />
          : <div className="empty" style={{ padding: "20px 10px" }}>Pas encore de relevés. Le cron mesure les vues plusieurs fois par jour.</div>}
      </div>

      <div className="sec-h"><h2>Alertes anti-triche</h2><span className="more" onClick={() => actions.go("fraud")}>Tout voir</span></div>
      {topAlert ? (
        <div className="alert"><div className="ic">{fraudIcon[topAlert.kind] || "!"}</div><div>
          <div className="at">{fraudLabel[topAlert.kind] || "Alerte"}{topAlert.clipper_name ? " — " + topAlert.clipper_name : ""}</div>
          <div className="as">{topAlert.detail || "Signal détecté sur un clip."}</div></div></div>
      ) : <div className="card"><div className="empty">Aucune alerte. Le bouclier veille.</div></div>}

      <div className="sec-h"><h2>Top clippers</h2><span className="more" onClick={() => actions.go("clippers")}>Voir tout</span></div>
      <div className="card">
        {data.loading ? <div className="empty">Chargement…</div>
          : topClippers.length ? topClippers.map((c, i) => (
            <div className="row" key={c.id} style={{ cursor: "pointer" }} onClick={() => actions.openClipper(c.id)}>
              <div className="thumb" style={{ width: 32, height: 32, fontSize: 12, background: i === 0 ? "var(--grad-coral)" : "var(--surf2)", color: i === 0 ? "#0a0610" : "var(--mut)" }}>{i + 1}</div>
              <div style={{ flex: 1 }}><div className="t">{c.name}</div><div className="s">{c.rank} · {c.clips} clips</div></div>
              <div className="end"><div className="vue mono">{fmt(c.vues_7)}</div><div className="delta up">{euro(c.gain)}</div></div>
            </div>
          )) : <div className="empty">Aucun clipper inscrit pour l&apos;instant.</div>}
      </div>

      <div className="sec-h"><h2>Tes pépites</h2><span className="more" onClick={() => actions.go("assets")}>Tous les assets</span></div>
      <div className="card">{pepites.length ? pepites.map((a) => <PepiteRow a={a} catalog={catalog} key={a.id} />) : <div className="empty">Les pépites apparaîtront dès que des assets seront téléchargés et clippés.</div>}</div>
    </>
  );
}

/* ───────────── CLIPPERS (liste) ───────────── */
function Clippers({ data, actions }: { data: AdminData; actions: AdmActions }) {
  const sorted = [...data.clippers].sort((a, b) => b.vues_7 - a.vues_7);
  return (
    <>
      <div className="eyebrow" style={{ marginTop: 14 }}>{data.clippers.length} clipper{data.clippers.length > 1 ? "s" : ""}</div>
      <h2 className="display" style={{ fontSize: 22, margin: "4px 0 12px" }}>Tes clippers</h2>
      <div className="card">
        {data.loading ? <div className="empty">Chargement…</div>
          : sorted.length ? sorted.map((c, i) => (
            <div className="row" key={c.id} style={{ cursor: "pointer" }} onClick={() => actions.openClipper(c.id)}>
              <div className="thumb" style={{ background: i === 0 ? "var(--grad-coral)" : "var(--surf2)", color: i === 0 ? "#0a0610" : "var(--mut)" }}>{initialsOf(c.name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t">{c.name} {c.is_minor && <span className="adm-minor">mineur</span>}</div>
                <div className="s">{c.rank}{c.country ? " · " + c.country : ""} · {c.clips} clips</div>
              </div>
              <div className="end"><div className="vue mono">{fmt(c.vues_7)}</div><div className="delta up">{euro(c.gain)} à verser</div></div>
            </div>
          )) : <div className="empty">Aucun clipper inscrit. Partage le lien d&apos;inscription à ton équipe.</div>}
      </div>
    </>
  );
}

/* ───────────── CLIPPER (fiche détaillée) ───────────── */
function ClipperDetail({ c, data, actions }: { c: AdmClipper; data: AdminData; actions: AdmActions }) {
  const his = data.clips.filter((k) => k.clipper_id === c.id);
  const pubs = pubsLast7(his.map((k) => k.submitted_at));
  const totalPubs = pubs.reduce((a, b) => a + b, 0);
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
        <button className="btn btn-gh" style={{ width: "auto", padding: "8px 12px" }} onClick={() => actions.go("clippers")}>← Clippers</button>
      </div>
      <div className="card" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 13 }}>
        <div className="thumb" style={{ width: 52, height: 52, fontSize: 17, background: "var(--grad)" }}>{initialsOf(c.name)}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 17 }} className="display">{c.name}</div>
          <div className="s">{c.rank}{c.country ? " · " + c.country : ""}</div>
        </div>
        {c.is_minor ? <span className="adm-minor">mineur</span> : <span className="adm-major">majeur</span>}
      </div>

      <div style={{ marginTop: 12 }}>
        {c.tiktok && <span className="adm-chip"><span className="h">TikTok</span> {c.tiktok}</span>}
        {c.instagram && <span className="adm-chip"><span className="h">Insta</span> {c.instagram}</span>}
        {c.youtube && <span className="adm-chip"><span className="h">YouTube</span> {c.youtube}</span>}
      </div>

      <div className="adm-kpis">
        <div className="adm-kpi"><div className="v gr">{fmt(c.vues_7)}</div><div className="l">vues · 7 j</div></div>
        <div className="adm-kpi"><div className="v">{fmt(c.vues_total)}</div><div className="l">vues totales</div></div>
        <div className="adm-kpi"><div className="v">{c.clips}</div><div className="l">clips</div></div>
        <div className="adm-kpi"><div className="v">{euro(c.gain)}</div><div className="l">à verser</div></div>
      </div>

      <div className="sec-h"><h2>Publications · 7 derniers jours</h2></div>
      <div className="card"><Bars data={pubs} labels={last7Labels()} />
        <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 10 }}>{totalPubs} publication{totalPubs > 1 ? "s" : ""} cette semaine · {(totalPubs / 7).toFixed(1)} / jour</div>
      </div>

      <div className="sec-h"><h2>Ses clips</h2></div>
      <div className="card">
        {his.length ? [...his].sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()).map((k) => <ClipRowLink key={k.id} c={k} />)
          : <div className="empty">Aucun clip soumis.</div>}
      </div>

      <div className="sec-h"><h2>Paiement</h2></div>
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div className="t">{c.payout_method ? (c.payout_method === "iban" ? "Virement (IBAN)" : c.payout_method === "paypal" ? "PayPal" : "Autre") : "Non renseigné"}</div>
          <div className="s">{c.payout_detail || "—"}</div>
        </div>
        <button className="btn btn-pri" style={{ width: "auto", padding: "10px 14px" }} onClick={() => actions.openPayVerify(c.id)}>Vérifier &amp; payer</button>
      </div>
    </>
  );
}

/* ───────────── CAMPAGNES (catalogue réel — tranche 1) ───────────── */
function Campaigns({ catalog, actions }: { catalog: Catalog; actions: AdmActions }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
        <div><div className="eyebrow">Contenus</div><h2 className="display" style={{ fontSize: 22, marginTop: 4 }}>Campagnes</h2></div>
        <button className="btn btn-pri adm-actionbtn" onClick={actions.openNewCampaign}>+ Nouvelle</button>
      </div>
      {catalog.loading && <div className="card" style={{ marginTop: 12 }}><div className="empty">Chargement…</div></div>}
      {!catalog.loading && catalog.campaigns.length === 0 && (
        <div className="card" style={{ marginTop: 12 }}><div className="empty">Aucune campagne. Crée la première avec « + Nouvelle ».</div></div>
      )}
      {catalog.campaigns.map((c) => (
        <div className="card" key={c.id} style={{ marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div className="thumb" style={{ background: c.accent }}>{initialsOf(c.name)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{c.name}</div>
              <div className="s">{c.assetCount} asset{c.assetCount > 1 ? "s" : ""} · {String(c.rate).replace(".", ",")} € / 1000 vues</div>
            </div>
            <span className={"pill " + (c.is_active ? "p-paid" : "p-hold")}>{c.is_active ? "Active" : "Inactive"}</span>
          </div>
          <div className="adm-kpis" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
            <div className="adm-kpi"><div className="v">{c.assetCount}</div><div className="l">assets</div></div>
            <div className="adm-kpi"><div className="v">{c.clipCount}</div><div className="l">clips soumis</div></div>
          </div>
        </div>
      ))}
    </>
  );
}

/* ───────────── CHALLENGES (cartes maquette · classement réel) ───────────── */
function Challenges({ data, actions }: { data: AdminData; actions: AdmActions }) {
  const top = [...data.clippers].sort((a, b) => b.vues_7 - a.vues_7).slice(0, 4);
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
        <div><div className="eyebrow">Surcouches temporaires</div><h2 className="display" style={{ fontSize: 22, marginTop: 4 }}>Challenges</h2></div>
        <button className="btn btn-pri adm-actionbtn" onClick={actions.openNewChallenge}>+ Nouveau</button>
      </div>
      <p style={{ color: "var(--mut)", fontSize: 12, margin: "4px 2px 0" }}>Cartes de démonstration — branchement réel des challenges en tranche 4.</p>
      {challenges.map((c, i) => (
        <div className={"chal " + c.c} key={i} style={{ minWidth: 0, marginTop: 12 }}>
          <span className="badge"><span className="dot" />{c.sub}</span>
          <h3>{c.t}</h3>
          <div className="meta">{c.reward.includes("vues") ? "Objectif collectif" : "Sprint individuel"}</div>
          <div className="bar"><i style={{ width: c.prog + "%" }} /></div>
          <div className="reward">{c.reward}</div>
        </div>
      ))}
      <div className="sec-h"><h2>Classement (vues nettes · 7 j)</h2></div>
      <div className="card">
        {top.length ? top.map((c, i) => (
          <div className="row" key={c.id}>
            <div className="thumb" style={{ width: 30, height: 30, fontSize: 12, background: i === 0 ? "var(--grad-coral)" : "var(--surf2)", color: i === 0 ? "#0a0610" : "var(--mut)" }}>{i + 1}</div>
            <div style={{ flex: 1 }}><div className="t" style={{ fontSize: 13 }}>{c.name}</div></div>
            <div className="vue mono" style={{ fontSize: 13 }}>{fmt(c.vues_7)}</div>
          </div>
        )) : <div className="empty">Aucun clipper classé.</div>}
      </div>
    </>
  );
}

/* ───────────── ASSETS (catalogue réel — tranche 1) ───────────── */
function CatalogAssetRow({ a, camps }: { a: AssetReal; camps: Catalog["campaigns"] }) {
  const name = campNameOf(camps, a.campaign_id) || "Sans campagne";
  return (
    <div className="row" style={{ alignItems: "flex-start" }}>
      <div className="thumb" style={{ background: campGradOf(camps, a.campaign_id) }}>{name[0]}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="t" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.title}</div>
        <div className="s">{name}{a.duration ? " · " + a.duration : ""} · {a.source === "r2" ? "R2" : "Drive"}</div>
      </div>
      <div className="end"><div className="vue mono">↓ {fmt(a.downloads)}</div><div className="delta flat">{a.clips} clips</div></div>
    </div>
  );
}
function AssetsScreen({ catalog, actions }: { catalog: Catalog; actions: AdmActions }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
        <div><div className="eyebrow">Catalogue</div><h2 className="display" style={{ fontSize: 22, marginTop: 4 }}>Assets</h2></div>
        <button className="btn btn-pri adm-actionbtn" onClick={actions.openImport}>+ Importer</button>
      </div>
      <p style={{ color: "var(--mut)", fontSize: 12.5, margin: "4px 0 6px" }}>Le fichier vit sur R2 / Drive — l&apos;app garde la fiche et trace chaque téléchargement.</p>
      {catalog.loading && <div className="card" style={{ marginTop: 8 }}><div className="empty">Chargement…</div></div>}
      {!catalog.loading && catalog.assets.length === 0 && (
        <div className="card" style={{ marginTop: 8 }}><div className="empty">Aucun asset. Importe le premier avec « + Importer ».</div></div>
      )}
      {catalog.assets.length > 0 && (
        <div className="card" style={{ marginTop: 8 }}>{catalog.assets.map((a) => <CatalogAssetRow key={a.id} a={a} camps={catalog.campaigns} />)}</div>
      )}
    </>
  );
}

/* ───────────── ANTI-TRICHE ───────────── */
function Fraud({ data }: { data: AdminData }) {
  const rules = [
    ["Hold avant versement", "Délai de gel + re-contrôle existence du clip"],
    ["Progression négative", "Chute de vues = gel automatique"],
    ["Anti-doublon", "Même lien / ré-upload sur une même plateforme"],
    ["Clip vivant", "Vérifie que le clip existe encore au paiement"],
  ];
  return (
    <>
      <div className="eyebrow" style={{ marginTop: 14 }}>Bouclier</div>
      <h2 className="display" style={{ fontSize: 22, margin: "4px 0 4px" }}>Anti-triche</h2>
      <p style={{ color: "var(--mut)", fontSize: 12.5, marginBottom: 12 }}>On ne compte que les vues encore vivantes. Tout signal gèle le paiement avant vérification.</p>
      {data.loading ? <div className="card"><div className="empty">Chargement…</div></div>
        : data.fraud.length ? data.fraud.map((a) => (
          <div className="alert" key={a.id}><div className="ic">{fraudIcon[a.kind] || "!"}</div><div>
            <div className="at">{fraudLabel[a.kind] || "Alerte"}{a.clipper_name ? " — " + a.clipper_name : ""}{a.platform ? " · " + (platLabel[a.platform] || a.platform) : ""}</div>
            <div className="as">{a.detail || "Signal détecté sur un clip."}</div></div></div>
        )) : <div className="card"><div className="empty">Aucune alerte. Tout est sain pour l&apos;instant.</div></div>}
      <div className="sec-h"><h2>Règles actives</h2></div>
      <div className="card">
        {rules.map((r, i) => (
          <div className="row" key={i}><div><div className="t">{r[0]}</div><div className="s">{r[1]}</div></div><span className="pill p-paid end">ON</span></div>
        ))}
      </div>
    </>
  );
}

/* ───────────── PAIEMENTS ───────────── */
function Payments({ data, actions }: { data: AdminData; actions: AdmActions }) {
  const due = [...data.clippers].filter((c) => c.gain > 0).sort((a, b) => b.gain - a.gain);
  return (
    <>
      <div className="eyebrow" style={{ marginTop: 14 }}>Versements</div>
      <h2 className="display" style={{ fontSize: 22, margin: "4px 0 4px" }}>Paiements</h2>
      <div className="card" style={{ background: "linear-gradient(150deg,rgba(53,230,161,.12),rgba(45,226,230,.04)),var(--surf)", borderColor: "rgba(53,230,161,.25)", marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "var(--mut)", fontWeight: 600 }}>Total à verser cette fenêtre (est.)</div>
        <div className="display" style={{ fontSize: 34, fontWeight: 700, margin: "4px 0" }}>{euro(data.dash.a_verser)}</div>
        <div style={{ fontSize: 12, color: "var(--mut)" }}>{due.length} clipper{due.length > 1 ? "s" : ""} · seuil 50 €</div>
      </div>
      <div className="card">
        {data.loading ? <div className="empty">Chargement…</div>
          : due.length ? due.map((c) => (
            <div className="row" key={c.id}>
              <div className="thumb" style={{ background: "var(--surf2)", color: "var(--mut)" }}>{initialsOf(c.name)}</div>
              <div style={{ flex: 1 }}><div className="t">{c.name}</div><div className="s">{c.payout_method || "—"} · {fmt(c.vues_7)} vues · 7 j</div></div>
              <div className="end" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="vue mono" style={{ color: "var(--mint)" }}>{euro(c.gain)}</div>
                <button className="btn btn-pri" style={{ width: "auto", padding: "8px 12px" }} onClick={() => actions.openPayVerify(c.id)}>Vérifier</button>
              </div>
            </div>
          )) : <div className="empty">Personne au-dessus du seuil pour l&apos;instant.</div>}
      </div>
    </>
  );
}

/* ───────────── VÉRIFICATION AVANT PAIEMENT ───────────── */
function subtotal(k: AdmClip) { return (Math.max(0, k.net_7d) / 1000) * (k.rate || 1); }
function PayClipRow({ k, excluded, reason }: { k: AdmClip; excluded?: boolean; reason?: string }) {
  const sub = subtotal(k);
  return (
    <a className="row cliprow" href={k.url} target="_blank" rel="noopener noreferrer">
      <div className="thumb" style={{ background: "var(--surf2)", color: "var(--mut)" }}>{(platLabel[k.platform] || k.platform)[0]}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="t" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.asset_title || "(contenu original)"} <span className="ext">↗</span></div>
        <div className="s">{platLabel[k.platform] || k.platform} · {fmt(Math.max(0, k.net_7d))} vues nettes {reason && <span className="pill p-hold" style={{ marginLeft: 4 }}>{reason}</span>}</div>
      </div>
      <div className="end">
        <div className="vue" style={{ color: excluded ? "var(--mut2)" : "var(--mint)", textDecoration: excluded ? "line-through" : "none" }}>{euro(sub)}</div>
      </div>
    </a>
  );
}
function PayVerify({ c, data, actions }: { c: AdmClipper; data: AdminData; actions: AdmActions }) {
  const clips = data.clips.filter((k) => k.clipper_id === c.id);
  const sains = clips.filter((k) => k.status === "track" && k.net_7d > 0);
  const exclus = clips.filter((k) => !(k.status === "track" && k.net_7d > 0));
  const total = sains.reduce((s, k) => s + subtotal(k), 0);
  const exclusTotal = exclus.reduce((s, k) => s + subtotal(k), 0);
  const geles = exclus.filter((k) => k.status === "hold" || k.status === "rejected").length;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
        <button className="btn btn-gh" style={{ width: "auto", padding: "8px 12px" }} onClick={() => actions.go("pay")}>← Paiements</button>
      </div>
      <div className="eyebrow" style={{ marginTop: 14 }}>Vérification avant paiement</div>
      <h2 className="display" style={{ fontSize: 22, margin: "4px 0 10px" }}>{c.name}</h2>

      <div className="card">
        <div className="row" style={{ paddingTop: 0 }}><div className="ck" style={{ color: "var(--mint)", fontWeight: 700 }}>✓</div><div style={{ flex: 1 }}><div className="t">{sains.length} clip{sains.length > 1 ? "s" : ""} compté{sains.length > 1 ? "s" : ""}</div><div className="s">Progression positive, vues vivantes</div></div></div>
        <div className="row"><div style={{ color: geles ? "var(--amber)" : "var(--mut2)", fontWeight: 700 }}>{geles ? "!" : "✓"}</div><div style={{ flex: 1 }}><div className="t">{geles} clip{geles > 1 ? "s" : ""} gelé{geles > 1 ? "s" : ""}</div><div className="s">Exclus du versement (progression négative)</div></div></div>
        <div className="row"><div style={{ color: "var(--mint)", fontWeight: 700 }}>✓</div><div style={{ flex: 1 }}><div className="t">Aucun doublon détecté</div><div className="s">Liens vérifiés sur chaque plateforme</div></div></div>
        <div style={{ fontSize: 11.5, color: "var(--mut2)", marginTop: 6 }}>Ouvre chaque vidéo (↗) pour la contrôler avant de valider.</div>
      </div>

      <div className="sec-h"><h2>Clips comptés</h2></div>
      <div className="card">{sains.length ? sains.map((k) => <PayClipRow key={k.id} k={k} />) : <div className="empty">Aucun clip à payer cette fenêtre.</div>}</div>

      {exclus.length > 0 && (
        <>
          <div className="sec-h"><h2>Exclus du paiement</h2></div>
          <div className="card">{exclus.map((k) => <PayClipRow key={k.id} k={k} excluded reason={k.status === "hold" || k.status === "rejected" ? "gelé" : "pas de progression"} />)}</div>
        </>
      )}

      <div className="card" style={{ marginTop: 14, background: "linear-gradient(150deg,rgba(53,230,161,.12),rgba(45,226,230,.04)),var(--surf)", borderColor: "rgba(53,230,161,.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: 12, color: "var(--mut)", fontWeight: 600 }}>À verser à {c.name}</div>
          <div className="display" style={{ fontSize: 30, fontWeight: 700 }}>{euro(total)}</div>
        </div>
        <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 4 }}>{sains.length} clips sains comptés · {euro(exclusTotal)} gelés exclus</div>
        <div style={{ fontSize: 11.5, color: "var(--mut2)", marginTop: 8 }}>Le versement définitif (figer la preuve, marquer payé) arrive en tranche 3.</div>
        <button className="btn btn-pri" style={{ marginTop: 14, padding: 14 }} onClick={() => { actions.showToast(`${euro(total)} — moteur de paiement en tranche 3`); actions.go("pay"); }}>Verser {euro(total)} · figer la preuve</button>
      </div>
    </>
  );
}

/* ───────────── RACINE ───────────── */
export default function Admin({ tab, actions, catalog, userName, clipperId, payClipper }: {
  tab: string; actions: AdmActions; catalog: Catalog; userName?: string | null; clipperId?: string | null; payClipper?: string | null;
}) {
  const data = useAdminData(true);

  let screen: React.ReactNode;
  const payTarget = payClipper ? data.clippers.find((x) => x.id === payClipper) : null;
  if (payTarget) {
    screen = <PayVerify c={payTarget} data={data} actions={actions} />;
  } else if (tab === "clippers") {
    const c = clipperId ? data.clippers.find((x) => x.id === clipperId) : null;
    screen = c ? <ClipperDetail c={c} data={data} actions={actions} /> : <Clippers data={data} actions={actions} />;
  } else if (tab === "campaigns") screen = <Campaigns catalog={catalog} actions={actions} />;
  else if (tab === "clips") screen = <ClipsFeed data={data} catalog={catalog} />;
  else if (tab === "challenges") screen = <Challenges data={data} actions={actions} />;
  else if (tab === "assets") screen = <AssetsScreen catalog={catalog} actions={actions} />;
  else if (tab === "fraud") screen = <Fraud data={data} />;
  else if (tab === "pay") screen = <Payments data={data} actions={actions} />;
  else screen = <Dash data={data} catalog={catalog} actions={actions} />;

  return (
    <>
      <Hud name={userName || "Keyan"} sub="Admin · War Room" rank={`⚡ ${data.dash.clippers_actifs} clipper${data.dash.clippers_actifs > 1 ? "s" : ""} actif${data.dash.clippers_actifs > 1 ? "s" : ""}`} />
      <div className="wrap">{screen}</div>
    </>
  );
}
