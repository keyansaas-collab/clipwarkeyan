"use client";

import React, { useState, useEffect } from "react";
import { Hud, Avatar } from "./ui";
import { getSupabase } from "@/lib/supabase/client";
import { celebrate } from "@/lib/confetti";
import { REF_BONUS } from "@/lib/referral";
import { fmt, euro, platLabel, agoLabel } from "@/lib/data";
import { Catalog, AssetReal, campNameOf, campGradOf, initialsOf } from "@/lib/catalog";
import { Arena, ArenaChallenge, endsLabel, rewardText, metricLabel, kindLabel, fetchChallengeBoard, awardChallenge } from "@/lib/arena";
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
  openEditCampaign: (c: import("@/lib/catalog").CampaignReal) => void;
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

/* ───────────── CLIPS (flux + filtres + tri + modération en masse) ───────────── */
function ClipsFeed({ data, catalog, actions }: { data: AdminData; catalog: Catalog; actions: AdmActions }) {
  const [plat, setPlat] = useState("all");
  const [camp, setCamp] = useState("all");
  const [stat, setStat] = useState("all");
  const [sort, setSort] = useState("date");
  const [selMode, setSelMode] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  let list = data.clips.filter((c) =>
    (plat === "all" || c.platform === plat) &&
    (camp === "all" || c.campaign_id === camp) &&
    (stat === "all" || c.status === stat || (stat === "hold" && c.status === "rejected"))
  );
  list = [...list].sort((a, b) =>
    sort === "vues" ? b.vues - a.vues : new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
  );

  function toggle(id: string) {
    setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function exitSel() { setSelMode(false); setSel(new Set()); }
  async function bulk(status: "track" | "hold" | "rejected") {
    if (!sel.size) return;
    setBusy(true);
    const { error } = await getSupabase().rpc("set_clips_status", { p_ids: Array.from(sel), p_status: status });
    setBusy(false);
    if (error) { actions.showToast("Action impossible"); return; }
    const verb = status === "hold" ? "gelé" : status === "rejected" ? "refusé" : "réactivé";
    actions.showToast(`${sel.size} clip${sel.size > 1 ? "s" : ""} ${verb}${status === "track" ? "" : "s"}`);
    exitSel(); data.reload();
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
        <div><div className="eyebrow">Flux des publications</div><h2 className="display" style={{ fontSize: 22, margin: "4px 0 0" }}>Clips</h2></div>
        <button className="btn btn-gh adm-actionbtn" onClick={() => (selMode ? exitSel() : setSelMode(true))}>{selMode ? "Annuler" : "Sélectionner"}</button>
      </div>
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
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--mut)", margin: "2px 2px 8px" }}>
        <span>{list.length} clip{list.length > 1 ? "s" : ""}</span>
        {selMode && <span onClick={() => setSel(new Set(list.map((c) => c.id)))} style={{ color: "var(--cyan)", cursor: "pointer" }}>Tout sélectionner</span>}
      </div>
      <div className="card" style={{ paddingBottom: selMode && sel.size ? 70 : undefined }}>
        {data.loading ? <div className="empty">Chargement…</div>
          : list.length ? list.map((c) => selMode ? (
            <div key={c.id} className="row cliprow" onClick={() => toggle(c.id)} style={{ cursor: "pointer", background: sel.has(c.id) ? "rgba(45,226,230,.10)" : undefined, borderRadius: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, border: "2px solid " + (sel.has(c.id) ? "var(--cyan)" : "var(--line)"), background: sel.has(c.id) ? "var(--cyan)" : "transparent", color: "#0a0610", display: "grid", placeItems: "center", fontSize: 13, flexShrink: 0 }}>{sel.has(c.id) ? "✓" : ""}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.asset_title || "(contenu original)"}</div>
                <div className="s">{c.clipper_name} · {platLabel[c.platform] || c.platform} <span className={"pill " + pillOf(c.status)[0]} style={{ marginLeft: 4 }}>{pillOf(c.status)[1]}</span></div>
              </div>
              <div className="end"><div className="vue">{fmt(c.vues)}</div></div>
            </div>
          ) : <ClipRowLink key={c.id} c={c} showClipper />) : <div className="empty">Aucun clip pour ces filtres.</div>}
      </div>

      {selMode && sel.size > 0 && (
        <div className="bulkbar">
          <span className="bulkbar-n">{sel.size} sélectionné{sel.size > 1 ? "s" : ""}</span>
          <button className="btn btn-gh" disabled={busy} onClick={() => bulk("track")}>Réactiver</button>
          <button className="btn btn-gh" disabled={busy} onClick={() => bulk("hold")}>Geler</button>
          <button className="btn btn-gh" style={{ color: "var(--coral)" }} disabled={busy} onClick={() => bulk("rejected")}>Refuser</button>
        </div>
      )}
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

function RefreshViewsButton({ actions }: { actions: AdmActions }) {
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const { data: s } = await getSupabase().auth.getSession();
      const token = s.session?.access_token;
      const res = await fetch("/api/admin/refresh-views", { method: "POST", headers: { authorization: `Bearer ${token}` } });
      const j = await res.json();
      if (!res.ok) { actions.showToast(j.error === "forbidden" ? "Réservé au staff" : "Échec du relevé"); }
      else actions.showToast(`Relevé : ${j.inserted} maj · ${j.flagged} gelés · ${j.skipped} ignorés`);
    } catch { actions.showToast("Erreur réseau"); }
    setBusy(false);
  }
  return (
    <button className="btn btn-gh" style={{ marginTop: 12, padding: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }} onClick={run} disabled={busy}>
      {busy ? "Relevé en cours…" : "↻ Rafraîchir les vues maintenant"}
    </button>
  );
}

function Dash({ data, catalog, isOwner, actions }: { data: AdminData; catalog: Catalog; isOwner?: boolean; actions: AdmActions }) {
  const pepites = [...data.assets].filter((a) => a.downloads > 0).sort((a, b) => b.vues / b.downloads - a.vues / a.downloads).slice(0, 3);
  const topClippers = [...data.clippers].sort((a, b) => b.vues_7 - a.vues_7).slice(0, 3);
  const viewsData = data.views7.map((v) => v.net);
  const viewsLabels = data.views7.length ? data.views7.map((v) => wdOf(v.day)) : last7Labels();
  const topAlert = data.fraud[0];

  return (
    <>
      {isOwner && (
        <div className="card" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => actions.go("team")}>
          <div className="thumb" style={{ width: 38, height: 38, background: "var(--grad)" }}>⚙</div>
          <div style={{ flex: 1 }}><div className="t">Gérer l&apos;équipe &amp; les accès admin</div><div className="s">Ajoute ou retire des associés</div></div>
          <span style={{ color: "var(--mut)" }}>→</span>
        </div>
      )}
      <RefreshViewsButton actions={actions} />
      <div className="adm-kpis">
        <div className="adm-kpi"><div className="v gr">{data.dash.vues_7 >= 1e6 ? (Math.round(data.dash.vues_7 / 1e5) / 10) + "M" : fmt(data.dash.vues_7)}</div><div className="l">vues nettes · 7 j</div></div>
        <div className="adm-kpi"><div className="v">{euro(data.dash.a_verser)}</div><div className="l">dû en attente</div></div>
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
              <Avatar url={c.avatar_url} name={c.name} size={40} />
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
        <Avatar url={c.avatar_url} name={c.name} size={52} square />
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
        <div className="card" key={c.id} style={{ marginTop: 12, cursor: "pointer" }} onClick={() => actions.openEditCampaign(c)}>
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
          <div style={{ fontSize: 11, color: "var(--mut2)", marginTop: 8, textAlign: "right" }}>Touche pour modifier ›</div>
        </div>
      ))}
    </>
  );
}

/* ───────────── CHALLENGES (réels v2) ───────────── */
function AdminChallengeCard({ ch, onChanged, actions }: { ch: ArenaChallenge; onChanged: () => void; actions: AdmActions }) {
  const [mode, setMode] = useState<"idle" | "confirmDel" | "close">("idle");
  const [busy, setBusy] = useState(false);
  const [board, setBoard] = useState<{ clipper_id: string; name: string; score: number }[] | null>(null);
  const pct = ch.goal_views ? Math.min(100, Math.round((ch.progress / ch.goal_views) * 100)) : 0;
  const unit = ch.metric === "clips" ? "clips" : "vues";

  async function openClose() {
    setMode("close"); setBoard(null);
    setBoard(await fetchChallengeBoard(ch.id));
  }
  async function award(winner: string | null) {
    setBusy(true);
    await awardChallenge(ch.id, winner);
    setBusy(false); setMode("idle"); onChanged();
    actions.showToast(winner ? "Gagnant désigné · prime à remettre" : "Challenge clôturé");
  }
  async function del() {
    setBusy(true);
    await getSupabase().from("challenges").delete().eq("id", ch.id);
    setBusy(false); onChanged();
  }

  return (
    <div className={"chal " + (ch.kind === "collectif" ? "c2" : "")} style={{ minWidth: 0, marginTop: 12, opacity: ch.active ? 1 : 0.72 }}>
      <span className="badge"><span className="dot" />{ch.awarded_at ? "Clôturé" : ch.active ? endsLabel(ch.ends_at) : "Terminé"}</span>
      <h3>{ch.title}</h3>
      <div className="meta">{kindLabel[ch.kind]} · {metricLabel[ch.metric]}{ch.campaign_name ? " · " + ch.campaign_name : " · toutes campagnes"} · {ch.participants} clipper{ch.participants > 1 ? "s" : ""}</div>

      <div style={{ margin: "8px 0 4px" }}><span className="pill p-paid">🎁 {rewardText(ch)}</span></div>

      {ch.metric !== "manual" && ch.goal_views ? (
        <>
          <div className="bar"><i style={{ width: pct + "%" }} /></div>
          <div className="reward">{fmt(ch.progress)} / {fmt(ch.goal_views)} {unit} ({pct}%)</div>
        </>
      ) : (
        <div className="reward">{ch.metric === "manual" ? "Jugé manuellement" : `${fmt(ch.progress)} ${unit} cumulés`}</div>
      )}

      {ch.awarded_at ? (
        <div style={{ marginTop: 8, fontSize: 12.5 }}>
          {ch.winner_name ? <>🏆 Gagnant : <b>{ch.winner_name}</b> — <span style={{ color: "var(--mint)" }}>prime à remettre ({rewardText(ch)})</span></> : "Clôturé sans gagnant unique."}
        </div>
      ) : mode === "close" ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "var(--mut)", marginBottom: 6 }}>Désigne le gagnant :</div>
          {board === null ? <div className="empty" style={{ padding: 8 }}>Chargement…</div>
            : board.length ? board.slice(0, 6).map((b, i) => (
              <button key={b.clipper_id} className="btn btn-gh" style={{ padding: 10, marginBottom: 6, display: "flex", justifyContent: "space-between" }} disabled={busy} onClick={() => award(b.clipper_id)}>
                <span>{i + 1}. {b.name}</span><span className="mono">{fmt(b.score)} {unit}</span>
              </button>
            )) : <div className="empty" style={{ padding: 8 }}>Aucun participant mesuré.</div>}
          <button className="btn btn-gh" style={{ padding: 10, marginTop: 4 }} disabled={busy} onClick={() => award(null)}>Clôturer sans gagnant unique</button>
          <button className="btn btn-gh" style={{ padding: 8, marginTop: 6, fontSize: 12 }} onClick={() => setMode("idle")}>Annuler</button>
        </div>
      ) : mode === "confirmDel" ? (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="btn btn-pri" style={{ padding: 8, background: "var(--coral)" }} disabled={busy} onClick={del}>Supprimer</button>
          <button className="btn btn-gh" style={{ padding: 8 }} onClick={() => setMode("idle")}>Annuler</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 14, justifyContent: "flex-end", marginTop: 10 }}>
          <span style={{ fontSize: 12, color: "var(--cyan)", cursor: "pointer", fontWeight: 600 }} onClick={openClose}>Clôturer &amp; primer</span>
          <span style={{ fontSize: 12, color: "var(--mut2)", cursor: "pointer" }} onClick={() => setMode("confirmDel")}>Supprimer</span>
        </div>
      )}
    </div>
  );
}

function Challenges({ arena, actions }: { arena: Arena; actions: AdmActions }) {
  const top = [...arena.board].slice(0, 4);
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
        <div><div className="eyebrow">Courses & primes</div><h2 className="display" style={{ fontSize: 22, marginTop: 4 }}>Challenges</h2></div>
        <button className="btn btn-pri adm-actionbtn" onClick={actions.openNewChallenge}>+ Nouveau</button>
      </div>
      {arena.loading && <div className="card" style={{ marginTop: 12 }}><div className="empty">Chargement…</div></div>}
      {!arena.loading && arena.challenges.length === 0 && (
        <div className="card" style={{ marginTop: 12 }}><div className="empty">Aucun challenge. Lance le premier avec « + Nouveau » — vues, clips, ou jugé à la main, avec une prime à la clé.</div></div>
      )}
      {arena.challenges.map((ch) => <AdminChallengeCard key={ch.id} ch={ch} actions={actions} onChanged={arena.reload} />)}

      <div className="sec-h"><h2>Classement général (vues nettes · 7 j)</h2></div>
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
  const totalPaid = data.payments.reduce((s, p) => s + p.amount, 0);

  function dl(filename: string, header: string[], rows: (string | number)[][]) {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = "\uFEFF" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    actions.showToast("Export téléchargé");
  }
  function exportDue() {
    const today = new Date().toISOString().slice(0, 10);
    dl(`clipwar_a-verser_${today}.csv`, ["Clipper", "Méthode", "Détail paiement", "Vues 7j", "Vues totales", "Montant dû (€)"],
      due.map((c) => [c.name, c.payout_method || "", c.payout_detail || "", c.vues_7, c.vues_total, c.gain.toFixed(2).replace(".", ",")]));
  }
  function exportHistory() {
    dl(`clipwar_versements.csv`, ["Date", "Clipper", "Vues payées", "Montant (€)", "Statut"],
      data.payments.map((p) => [p.created_at.slice(0, 10), p.clipper_name || "Clipper", p.net_views, p.amount.toFixed(2).replace(".", ","), p.status]));
  }

  return (
    <>
      <div className="eyebrow" style={{ marginTop: 14 }}>Versements</div>
      <h2 className="display" style={{ fontSize: 22, margin: "4px 0 4px" }}>Paiements</h2>
      <div className="card" style={{ background: "linear-gradient(150deg,rgba(53,230,161,.12),rgba(45,226,230,.04)),var(--surf)", borderColor: "rgba(53,230,161,.25)", marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "var(--mut)", fontWeight: 600 }}>Dû en attente (cumulatif réel)</div>
        <div className="display" style={{ fontSize: 34, fontWeight: 700, margin: "4px 0" }}>{euro(data.dash.a_verser)}</div>
        <div style={{ fontSize: 12, color: "var(--mut)" }}>{due.length} clipper{due.length > 1 ? "s" : ""} avec un solde · {euro(totalPaid)} déjà versés au total</div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
        <button className="btn btn-gh" style={{ padding: 10, fontSize: 12.5 }} onClick={exportDue} disabled={!due.length}>⬇︎ Export « à verser »</button>
        <button className="btn btn-gh" style={{ padding: 10, fontSize: 12.5 }} onClick={exportHistory} disabled={!data.payments.length}>⬇︎ Export versements</button>
      </div>
      <div className="sec-h"><h2>À verser</h2></div>
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
          )) : <div className="empty">Aucun solde à verser pour l&apos;instant.</div>}
      </div>

      <div className="sec-h"><h2>Historique des versements</h2></div>
      <div className="card">
        {data.payments.length ? data.payments.map((p) => (
          <div className="row" key={p.id}>
            <div className="thumb" style={{ background: "var(--surf2)", color: "var(--mut)" }}>{initialsOf(p.clipper_name || "?")}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t">{p.clipper_name || "Clipper"}</div>
              <div className="s">{fmt(p.net_views)} vues payées · {agoLabel(Math.max(0, Math.floor((Date.now() - new Date(p.created_at).getTime()) / 864e5)))}</div>
            </div>
            <div className="end"><div className="vue mono" style={{ color: "var(--mint)" }}>{euro(p.amount)}</div><div className="delta flat">payé</div></div>
          </div>
        )) : <div className="empty">Aucun versement enregistré pour l&apos;instant.</div>}
      </div>

      <ReferralPayouts />
    </>
  );
}

/* ───────────── BONUS DE PARRAINAGE (admin) ───────────── */
function ReferralPayouts() {
  const [rows, setRows] = useState<{ parrain_id: string; parrain: string; filleuls: number; valides: number }[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    getSupabase().rpc("admin_referrals").then(({ data }) => {
      setRows((data || []).map((r: any) => ({ parrain_id: r.parrain_id, parrain: r.parrain, filleuls: Number(r.filleuls) || 0, valides: Number(r.valides) || 0 })));
      setLoaded(true);
    });
  }, []);
  const withBonus = rows.filter((r) => r.valides > 0);
  if (!loaded || rows.length === 0) return null;
  return (
    <>
      <div className="sec-h"><h2>Bonus de parrainage</h2></div>
      <div className="card">
        {rows.map((r) => (
          <div className="row" key={r.parrain_id}>
            <div className="thumb" style={{ background: "var(--surf2)", color: "var(--mut)" }}>{initialsOf(r.parrain)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t">{r.parrain}</div>
              <div className="s">{r.filleuls} filleul{r.filleuls > 1 ? "s" : ""} · {r.valides} validé{r.valides > 1 ? "s" : ""}</div>
            </div>
            <div className="end"><div className="vue mono" style={{ color: r.valides ? "var(--mint)" : "var(--mut2)" }}>{euro(r.valides * REF_BONUS)}</div><div className="delta flat">bonus</div></div>
          </div>
        ))}
        {withBonus.length === 0 && <div style={{ fontSize: 11.5, color: "var(--mut2)", padding: "4px 2px 0" }}>Aucun bonus débloqué pour l&apos;instant (palier non atteint).</div>}
      </div>
    </>
  );
}

/* ───────────── VÉRIFICATION AVANT PAIEMENT ───────────── */
function PayClipRow({ k, excluded, reason }: { k: AdmClip; excluded?: boolean; reason?: string }) {
  return (
    <a className="row cliprow" href={k.url} target="_blank" rel="noopener noreferrer">
      <div className="thumb" style={{ background: "var(--surf2)", color: "var(--mut)" }}>{(platLabel[k.platform] || k.platform)[0]}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="t" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.asset_title || "(contenu original)"} <span className="ext">↗</span></div>
        <div className="s">{platLabel[k.platform] || k.platform} · {fmt(k.due)} vues à payer {reason && <span className="pill p-hold" style={{ marginLeft: 4 }}>{reason}</span>}</div>
      </div>
      <div className="end">
        <div className="vue" style={{ color: excluded ? "var(--mut2)" : "var(--mint)", textDecoration: excluded ? "line-through" : "none" }}>{euro(k.gain)}</div>
      </div>
    </a>
  );
}
function PayVerify({ c, data, actions }: { c: AdmClipper; data: AdminData; actions: AdmActions }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const clips = data.clips.filter((k) => k.clipper_id === c.id);
  const sains = clips.filter((k) => k.status === "track" && k.due > 0);
  const exclus = clips.filter((k) => !(k.status === "track" && k.due > 0));
  const total = sains.reduce((s, k) => s + k.gain, 0);
  const exclusTotal = exclus.reduce((s, k) => s + k.gain, 0);
  const geles = exclus.filter((k) => k.status === "hold" || k.status === "rejected").length;

  async function settle() {
    setBusy(true); setErr(null);
    const { data: res, error } = await getSupabase().rpc("settle_payment", { target_clipper: c.id });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    const row = Array.isArray(res) ? res[0] : res;
    const amt = row ? Number(row.amount) : total;
    celebrate({ emojis: ["💸", "✅", "🎉"] });
    actions.showToast(`${euro(amt)} versés à ${c.name} · preuve figée`);
    await data.reload();
    actions.go("pay");
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
        <button className="btn btn-gh" style={{ width: "auto", padding: "8px 12px" }} onClick={() => actions.go("pay")}>← Paiements</button>
      </div>
      <div className="eyebrow" style={{ marginTop: 14 }}>Vérification avant paiement</div>
      <h2 className="display" style={{ fontSize: 22, margin: "4px 0 10px" }}>{c.name}</h2>

      <div className="card">
        <div className="row" style={{ paddingTop: 0 }}><div className="ck" style={{ color: "var(--mint)", fontWeight: 700 }}>✓</div><div style={{ flex: 1 }}><div className="t">{sains.length} clip{sains.length > 1 ? "s" : ""} compté{sains.length > 1 ? "s" : ""}</div><div className="s">Vues vivantes non encore payées</div></div></div>
        <div className="row"><div style={{ color: geles ? "var(--amber)" : "var(--mut2)", fontWeight: 700 }}>{geles ? "!" : "✓"}</div><div style={{ flex: 1 }}><div className="t">{geles} clip{geles > 1 ? "s" : ""} gelé{geles > 1 ? "s" : ""}</div><div className="s">Exclus du versement (progression négative)</div></div></div>
        <div className="row"><div style={{ color: "var(--mint)", fontWeight: 700 }}>✓</div><div style={{ flex: 1 }}><div className="t">On ne paie que le surplus</div><div className="s">Vues déjà réglées lors des versements précédents non recomptées</div></div></div>
        <div style={{ fontSize: 11.5, color: "var(--mut2)", marginTop: 6 }}>Ouvre chaque vidéo (↗) pour la contrôler avant de valider.</div>
      </div>

      <div className="sec-h"><h2>Clips comptés</h2></div>
      <div className="card">{sains.length ? sains.map((k) => <PayClipRow key={k.id} k={k} />) : <div className="empty">Rien à payer : tout est déjà réglé pour ce clipper.</div>}</div>

      {exclus.length > 0 && (
        <>
          <div className="sec-h"><h2>Exclus du paiement</h2></div>
          <div className="card">{exclus.map((k) => <PayClipRow key={k.id} k={k} excluded reason={k.status === "hold" || k.status === "rejected" ? "gelé" : k.due > 0 ? "déjà payé" : "rien de neuf"} />)}</div>
        </>
      )}

      <div className="card" style={{ marginTop: 14, background: "linear-gradient(150deg,rgba(53,230,161,.12),rgba(45,226,230,.04)),var(--surf)", borderColor: "rgba(53,230,161,.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: 12, color: "var(--mut)", fontWeight: 600 }}>À verser à {c.name}</div>
          <div className="display" style={{ fontSize: 30, fontWeight: 700 }}>{euro(total)}</div>
        </div>
        <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 4 }}>{sains.length} clip{sains.length > 1 ? "s" : ""} compté{sains.length > 1 ? "s" : ""}{geles ? ` · ${euro(exclusTotal)} gelés exclus` : ""}</div>
        <div style={{ fontSize: 11.5, color: "var(--mut2)", marginTop: 8 }}>En validant, les vues actuelles sont figées comme preuve. Le virement (PayPal/IBAN : {c.payout_detail || "non renseigné"}) se fait de ton côté.</div>
        <button className="btn btn-pri" style={{ marginTop: 14, padding: 14 }} disabled={busy || total <= 0} onClick={settle}>
          {busy ? "Validation…" : `Marquer ${euro(total)} versés · figer la preuve`}
        </button>
        {err && <div className="auth-err">{err}</div>}
      </div>
    </>
  );
}

/* ───────────── ÉQUIPE (réservé à l'owner) ───────────── */
type TeamMember = { id: string; display_name: string | null; role: string; email: string };
function Team({ actions }: { actions: AdmActions }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("admin");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const { data } = await getSupabase().rpc("team_list");
    setMembers((data as TeamMember[]) || []);
    setLoading(false);
  }, []);
  React.useEffect(() => { load(); }, [load]);

  async function apply(targetEmail: string, newRole: string) {
    setBusy(true); setErr(null);
    const { error } = await getSupabase().rpc("promote_by_email", { target_email: targetEmail, new_role: newRole });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    actions.showToast(newRole === "clipper" ? "Accès admin retiré" : "Associé promu " + newRole);
    setEmail("");
    load();
  }

  return (
    <>
      <div className="eyebrow" style={{ marginTop: 14 }}>Accès & rôles</div>
      <h2 className="display" style={{ fontSize: 22, margin: "4px 0 4px" }}>Équipe</h2>
      <p style={{ color: "var(--mut)", fontSize: 12.5, marginBottom: 12 }}>
        Ajoute un associé en <b>admin</b> (accès complet au cockpit). Il doit s&apos;être inscrit au moins une fois avec son email.
      </p>

      <div className="card">
        <div className="field" style={{ marginTop: 0 }}><label>Email de l&apos;associé</label>
          <input type="email" placeholder="associe@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label>Rôle</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="admin">Admin (gère le cockpit)</option>
            <option value="clipper">Clipper (accès simple)</option>
          </select></div>
        <button className="btn btn-pri" style={{ marginTop: 14, padding: 13 }} disabled={busy || !email}
          onClick={() => apply(email.trim(), role)}>{busy ? "…" : "Appliquer"}</button>
        {err && <div className="auth-err">{err}</div>}
      </div>

      <div className="sec-h"><h2>Staff actuel</h2></div>
      <div className="card">
        {loading ? <div className="empty">Chargement…</div>
          : members.length ? members.map((m) => (
            <div className="row" key={m.id}>
              <div className="thumb" style={{ background: m.role === "owner" ? "var(--grad-coral)" : "var(--grad)", color: m.role === "owner" ? "#0a0610" : "#fff" }}>{initialsOf(m.display_name || m.email)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t">{m.display_name || m.email}</div>
                <div className="s" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.email}</div>
              </div>
              <div className="end" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={"pill " + (m.role === "owner" ? "p-paid" : "p-track")}>{m.role === "owner" ? "Propriétaire" : "Admin"}</span>
                {m.role === "admin" && <button className="btn btn-gh" style={{ width: "auto", padding: "6px 10px", fontSize: 12 }} disabled={busy} onClick={() => apply(m.email, "clipper")}>Retirer</button>}
              </div>
            </div>
          )) : <div className="empty">Aucun membre staff.</div>}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--mut2)", marginTop: 10 }}>Après promotion, l&apos;associé doit rafraîchir l&apos;app (ou se reconnecter) pour que le cockpit s&apos;ouvre.</div>
    </>
  );
}

/* ───────────── RACINE ───────────── */
export default function Admin({ tab, actions, catalog, arena, isOwner, userName, userAvatar, clipperId, payClipper }: {
  tab: string; actions: AdmActions; catalog: Catalog; arena: Arena; isOwner?: boolean; userName?: string | null; userAvatar?: string | null; clipperId?: string | null; payClipper?: string | null;
}) {
  const data = useAdminData(true);

  let screen: React.ReactNode;
  const payTarget = payClipper ? data.clippers.find((x) => x.id === payClipper) : null;
  if (payTarget) {
    screen = <PayVerify c={payTarget} data={data} actions={actions} />;
  } else if (tab === "team" && isOwner) {
    screen = <Team actions={actions} />;
  } else if (tab === "clippers") {
    const c = clipperId ? data.clippers.find((x) => x.id === clipperId) : null;
    screen = c ? <ClipperDetail c={c} data={data} actions={actions} /> : <Clippers data={data} actions={actions} />;
  } else if (tab === "campaigns") screen = <Campaigns catalog={catalog} actions={actions} />;
  else if (tab === "clips") screen = <ClipsFeed data={data} catalog={catalog} actions={actions} />;
  else if (tab === "challenges") screen = <Challenges arena={arena} actions={actions} />;
  else if (tab === "assets") screen = <AssetsScreen catalog={catalog} actions={actions} />;
  else if (tab === "fraud") screen = <Fraud data={data} />;
  else if (tab === "pay") screen = <Payments data={data} actions={actions} />;
  else screen = <Dash data={data} catalog={catalog} isOwner={isOwner} actions={actions} />;

  return (
    <>
      <Hud name={userName || "Keyan"} avatarUrl={userAvatar} sub="Admin · War Room" rank={`⚡ ${data.dash.clippers_actifs} clipper${data.dash.clippers_actifs > 1 ? "s" : ""} actif${data.dash.clippers_actifs > 1 ? "s" : ""}`} />
      <div className="wrap">{screen}</div>
    </>
  );
}
