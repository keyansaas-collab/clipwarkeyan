"use client";

import React, { useEffect, useState } from "react";
import { Icon } from "./ui";
import { getSupabase } from "@/lib/supabase/client";
import {
  platLabel, fmt, euro, MyClip,
} from "@/lib/data";
import { Catalog, AssetReal, initialsOf } from "@/lib/catalog";
import { Arena, BoardRow, endsLabel, rewardText, kindLabel } from "@/lib/arena";

export type ClipActions = {
  go: (tab: string) => void;
  openCamp: (id: string) => void;
  openSubmit: () => void;
  openDownload: (asset: AssetReal) => void;
  openClip: (id: string) => void;
  showToast: (m: string) => void;
};

const SEUIL = 50; // seuil de paiement
function dcl(d: number) { return d > 0 ? "up" : d < 0 ? "down" : "flat"; }
function dtx(d: number) { return (d > 0 ? "+" : "") + fmt(d); }

function rankInfo(total: number) {
  const tiers: [string, number][] = [["Recrue", 0], ["Sergent", 100000], ["Lieutenant", 500000], ["Capitaine", 2000000], ["Général", 10000000]];
  let idx = 0;
  tiers.forEach((t, i) => { if (total >= t[1]) idx = i; });
  const next = tiers[idx + 1] || null;
  return { rank: tiers[idx][0], base: tiers[idx][1], level: Math.max(1, Math.floor(total / 100000) + 1), next: next ? { label: next[0], at: next[1] } : null };
}
function agoTxt(d?: number) { return d == null ? "" : d === 0 ? "aujourd'hui" : d === 1 ? "hier" : `il y a ${d} j`; }

/* ---------- petite ligne de clip ---------- */
function MineRow({ c, onClick }: { c: MyClip; onClick: () => void }) {
  const pill = { track: ["p-track", "En suivi"], paid: ["p-paid", "Payé"], hold: ["p-hold", "Gelé"] }[c.st];
  return (
    <div className="row" style={{ cursor: "pointer" }} onClick={onClick}>
      <div className="thumb" style={{ background: "var(--surf2)", color: "var(--mut)" }}>{c.plat[0]}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="t" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.asset}</div>
        <div className="s">{c.plat} · {agoTxt(c.ago)} <span className={"pill " + pill[0]} style={{ marginLeft: 4 }}>{pill[1]}</span></div>
      </div>
      <div className="end"><div className="vue">{fmt(c.vues)}</div><div className={"delta " + dcl(c.d7)}>{dtx(c.d7)} · 7 j</div></div>
    </div>
  );
}

/* ====================== ACCUEIL ====================== */
function Home({ clips, name, place, arena, actions }: { clips: MyClip[]; name: string; place: number; arena: Arena; actions: ClipActions }) {
  const dueViews = clips.reduce((s, c) => s + (c.due || 0), 0);
  const gain = clips.reduce((s, c) => s + (c.gain || 0), 0);
  const vues7 = clips.reduce((s, c) => s + Math.max(0, c.d7), 0);
  const total = clips.reduce((s, c) => s + c.vues, 0);
  const r = rankInfo(total);
  const prog = r.next ? Math.min(100, ((total - r.base) / (r.next.at - r.base)) * 100) : 100;
  const feu = [...clips].filter((c) => c.d7 > 0).sort((a, b) => b.d7 - a.d7).slice(0, 3);
  const liveChallenges = arena.challenges.filter((c) => c.active);

  return (
    <>
      <div className="card" style={{ background: "linear-gradient(150deg,rgba(139,108,255,.2),rgba(45,226,230,.06)),var(--surf)", borderColor: "var(--line2)" }}>
        <div style={{ fontSize: 12, color: "var(--mut)", fontWeight: 600 }}>À recevoir</div>
        <div className="display" style={{ fontSize: 38, fontWeight: 700, margin: "4px 0", letterSpacing: "-1px" }}>{euro(gain)}</div>
        <div style={{ fontSize: 12.5, color: "var(--mut)" }}>{fmt(dueViews)} vues à payer · {clips.length} clips</div>
        <div className="meter"><i style={{ width: Math.min(100, (gain / SEUIL) * 100) + "%" }} /></div>
        <div style={{ fontSize: 11.5, color: "var(--mut)", marginTop: 7 }}>Seuil de paiement : {SEUIL} € {gain >= SEUIL ? "— atteint ✓" : `· encore ${euro(SEUIL - gain)}`}</div>
      </div>

      <div className="sec-h"><h2>Ta progression</h2></div>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
          <span>{r.rank} · Niveau {r.level}</span>{r.next && <span style={{ color: "var(--mut)" }}>{r.next.label}</span>}
        </div>
        <div className="bar" style={{ background: "var(--bg2)" }}><i style={{ width: prog + "%" }} /></div>
        {r.next && <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 8 }}>Encore <b style={{ color: "var(--text)" }}>{fmt(r.next.at - total)}</b> vues pour passer {r.next.label}.</div>}
      </div>

      {liveChallenges.length > 0 && (
        <>
          <div className="sec-h"><h2>Challenges en cours</h2><span className="more" onClick={() => actions.go("camp")}>Campagnes</span></div>
          <div className="rail">
            {liveChallenges.map((c) => {
              const pct = c.goal_views ? Math.min(100, Math.round((c.progress / c.goal_views) * 100)) : 0;
              const unit = c.metric === "clips" ? "clips" : "vues";
              return (
                <div className={"chal " + (c.kind === "collectif" ? "c2" : "")} key={c.id}>
                  <span className="badge"><span className="dot" />{endsLabel(c.ends_at)}</span>
                  <h3>{c.title}</h3>
                  <div className="meta">{kindLabel[c.kind]}{c.campaign_name ? " · " + c.campaign_name : ""}</div>
                  <div style={{ margin: "6px 0" }}><span className="pill p-paid">🎁 {rewardText(c)}</span></div>
                  {c.metric !== "manual" && c.goal_views ? (
                    <><div className="bar"><i style={{ width: pct + "%" }} /></div>
                    <div className="reward">{fmt(c.progress)} / {fmt(c.goal_views)} {unit}</div></>
                  ) : (
                    <div className="reward">{c.metric === "manual" ? "Le meilleur gagne — montre ton talent" : `${fmt(c.progress)} ${unit}`}</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="sec-h"><h2>Tes clips en feu</h2><span className="more" onClick={() => actions.go("clips")}>Mes clips</span></div>
      <div className="card">
        {feu.length ? feu.map((c) => <MineRow key={c.id} c={c} onClick={() => actions.openClip(c.id)} />)
          : <div className="empty">Aucun clip pour l&apos;instant. Soumets ton premier clip avec le bouton +.</div>}
      </div>

      <div className="sec-h"><h2>Classement</h2><span className="more" onClick={() => actions.go("classement")}>Voir tout</span></div>
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 13, cursor: "pointer" }} onClick={() => actions.go("classement")}>
        <div className="thumb" style={{ background: "var(--grad-coral)", color: "#0a0610" }}>{place ? "#" + place : "—"}</div>
        <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{place ? `Tu es ${place}ᵉ cette semaine` : "Pas encore classé"}</div>
          <div style={{ fontSize: 12, color: "var(--mut)" }}>{fmt(vues7)} vues nettes · monte dans le classement</div></div>
        <Icon name="trophy" />
      </div>
    </>
  );
}

/* ====================== CAMPAGNES (catalogue réel) ====================== */
function Campaigns({ camp, catalog, actions }: { camp: string | null; catalog: Catalog; actions: ClipActions }) {
  if (camp) {
    const c = catalog.campaigns.find((x) => x.id === camp);
    const list = catalog.assets.filter((a) => a.campaign_id === camp);
    if (!c) return <div className="empty" style={{ marginTop: 20 }}>Campagne introuvable.</div>;
    return (
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <button className="btn btn-gh" style={{ width: "auto", padding: "8px 12px" }} onClick={() => actions.go("camp")}>← Retour</button>
          <div><div style={{ fontWeight: 600, fontSize: 15 }}>{c.name}</div>
            <div style={{ fontSize: 12, color: "var(--mut)" }}>{String(c.rate).replace(".", ",")} € / 1000 vues</div></div>
        </div>
        {list.length === 0 ? (
          <div className="card" style={{ marginTop: 14 }}><div className="empty">Aucun asset dans cette campagne pour l&apos;instant.</div></div>
        ) : (
          <div className="grid">
            {list.map((a) => (
              <div className="asset" key={a.id}>
                <div className="cov" style={{ background: c.accent }}><div className="play">▶</div>{a.duration && <div className="dur">{a.duration}</div>}</div>
                <div className="b"><div className="ti">{a.title}</div><div className="mt">↓ {fmt(a.downloads)} · {a.clips} clips</div>
                  <button className="btn btn-pri" onClick={() => actions.openDownload(a)}>Télécharger</button></div>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }
  return (
    <>
      <div className="eyebrow" style={{ marginTop: 14 }}>Campagnes</div>
      <h2 className="display" style={{ fontSize: 22, margin: "4px 0 4px" }}>Choisis ton terrain</h2>
      <p style={{ color: "var(--mut)", fontSize: 13, marginBottom: 6 }}>Chaque campagne = ses contenus et son tarif aux vues.</p>
      {catalog.loading && <div className="card" style={{ marginTop: 12 }}><div className="empty">Chargement du catalogue…</div></div>}
      {!catalog.loading && catalog.campaigns.filter((c) => c.is_active).length === 0 && (
        <div className="card" style={{ marginTop: 12 }}><div className="empty">Aucune campagne active pour l&apos;instant. Reviens bientôt.</div></div>
      )}
      {catalog.campaigns.filter((c) => c.is_active).map((c) => (
        <div className="card" key={c.id} style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }} onClick={() => actions.openCamp(c.id)}>
          <div className="thumb" style={{ width: 54, height: 54, background: c.accent }}>{initialsOf(c.name)}</div>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 15 }}>{c.name}</div>
            <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 2 }}>{c.description}</div>
            <div style={{ marginTop: 7 }}><span className="tag">{c.assetCount} contenu{c.assetCount > 1 ? "s" : ""}</span><span className="tag">{String(c.rate).replace(".", ",")} € / 1000 vues</span></div></div>
        </div>
      ))}
    </>
  );
}

/* ====================== MES CLIPS ====================== */
function Mine({ clips, actions }: { clips: MyClip[]; actions: ClipActions }) {
  const [f, setF] = useState("all");
  const list = f === "all" ? clips : clips.filter((c) => c.st === f);
  return (
    <>
      <div className="eyebrow" style={{ marginTop: 14 }}>Suivi en direct</div>
      <h2 className="display" style={{ fontSize: 22, margin: "4px 0 8px" }}>Mes clips</h2>
      <div className="adm-filters">
        <select value={f} onChange={(e) => setF(e.target.value)}>
          <option value="all">Tous</option><option value="track">En suivi</option><option value="paid">Payés</option><option value="hold">Gelés</option>
        </select>
      </div>
      <div className="card">
        {list.length ? list.map((c) => <MineRow key={c.id} c={c} onClick={() => actions.openClip(c.id)} />)
          : <div className="empty">Aucun clip ici. Soumets-en un avec le bouton +.</div>}
      </div>
    </>
  );
}

/* ====================== FICHE CLIP ====================== */
function ClipDetail({ clip, actions }: { clip: MyClip; actions: ClipActions }) {
  const [snaps, setSnaps] = useState<{ views: number; captured_at: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    getSupabase().from("view_snapshots").select("views, captured_at").eq("clip_id", clip.id).order("captured_at", { ascending: true })
      .then(({ data }) => { setSnaps(data || []); setLoaded(true); });
  }, [clip.id]);
  const pill = { track: ["p-track", "En suivi"], paid: ["p-paid", "Payé"], hold: ["p-hold", "Gelé"] }[clip.st];
  const gain = clip.gain || 0;
  const max = Math.max(...snaps.map((s) => s.views), 1);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
        <button className="btn btn-gh" style={{ width: "auto", padding: "8px 12px" }} onClick={() => actions.go("clips")}>← Mes clips</button>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="thumb" style={{ width: 46, height: 46, background: "var(--surf2)", color: "var(--mut)" }}>{clip.plat[0]}</div>
          <div style={{ flex: 1, minWidth: 0 }}><div className="t">{clip.asset}</div><div className="s">{clip.plat} · {agoTxt(clip.ago)}</div></div>
          <span className={"pill " + pill[0]}>{pill[1]}</span>
        </div>
      </div>
      <div className="adm-kpis">
        <div className="adm-kpi"><div className="v gr">{fmt(clip.vues)}</div><div className="l">vues actuelles</div></div>
        <div className="adm-kpi"><div className="v">{dtx(clip.d7)}</div><div className="l">net · 7 j</div></div>
        <div className="adm-kpi"><div className="v">{euro(gain)}</div><div className="l">gain estimé</div></div>
      </div>

      <div className="sec-h"><h2>Évolution des vues</h2></div>
      <div className="card">
        {snaps.length >= 2 ? (
          <div className="adm-bars" style={{ height: 80 }}>{snaps.map((s, i) => <div key={i} className="adm-bar" style={{ height: Math.max(6, (s.views / max) * 100) + "%" }} title={fmt(s.views)} />)}</div>
        ) : (
          <div className="empty" style={{ padding: "22px 10px" }}>{loaded ? "Pas encore assez de relevés. Le cron mesure tes vues plusieurs fois par jour — reviens bientôt." : "Chargement…"}</div>
        )}
      </div>

      {clip.st === "hold" && (
        <div className="alert" style={{ marginTop: 12 }}><div className="ic">!</div><div><div className="at">Clip gelé</div><div className="as">Les vues ont baissé (purge de bots probable). Le paiement est suspendu le temps que ça se stabilise.</div></div></div>
      )}

      {clip.url && <a className="btn btn-pri" style={{ marginTop: 14, padding: 13, textDecoration: "none" }} href={clip.url} target="_blank" rel="noopener noreferrer">Ouvrir la vidéo ↗</a>}
    </>
  );
}

/* ====================== BILAN ====================== */
type PayRow = { id: string; amount: number; net_views: number; created_at: string };
function Bilan({ clips }: { clips: MyClip[] }) {
  const dueViews = clips.reduce((s, c) => s + (c.due || 0), 0);
  const gain = clips.reduce((s, c) => s + (c.gain || 0), 0);
  const [pays, setPays] = useState<PayRow[]>([]);
  const [paid, setPaid] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    getSupabase().from("payments").select("id, amount, net_views, created_at").eq("status", "paid").order("created_at", { ascending: false })
      .then(({ data }) => {
        const rows = (data as PayRow[]) || [];
        setPays(rows); setPaid(rows.reduce((s, p) => s + Number(p.amount), 0)); setLoaded(true);
      });
  }, []);
  return (
    <>
      <div className="eyebrow" style={{ marginTop: 14 }}>Dû cumulatif · depuis ton dernier versement</div>
      <h2 className="display" style={{ fontSize: 22, margin: "4px 0 12px" }}>Ton bilan</h2>
      <div className="card" style={{ background: "linear-gradient(150deg,rgba(53,230,161,.14),rgba(45,226,230,.05)),var(--surf)", borderColor: "rgba(53,230,161,.25)" }}>
        <div style={{ fontSize: 12, color: "var(--mut)", fontWeight: 600 }}>À recevoir · vues non encore payées</div>
        <div className="display" style={{ fontSize: 40, fontWeight: 700, margin: "6px 0", letterSpacing: "-1px" }}>{euro(gain)}</div>
        <div style={{ fontSize: 12.5, color: "var(--mut)" }}>{fmt(dueViews)} vues à payer · {euro(paid)} déjà reçus</div>
        <div className="meter"><i style={{ width: Math.min(100, (gain / SEUIL) * 100) + "%", background: "var(--mint)" }} /></div>
        <div style={{ fontSize: 11.5, color: "var(--mut)", marginTop: 8 }}>Seuil de paiement : {SEUIL} € {gain >= SEUIL ? "— atteint ✓" : `· encore ${euro(SEUIL - gain)}`}</div>
      </div>
      <div className="sec-h"><h2>Comment c&apos;est calculé</h2></div>
      <div className="card" style={{ fontSize: 13, color: "var(--mut)", lineHeight: 1.7 }}>
        On relève tes vues plusieurs fois par jour. À chaque versement, on te paie les <b style={{ color: "var(--text)" }}>nouvelles vues</b> depuis la dernière fois (vues actuelles − déjà payées) — jamais deux fois les mêmes. Un clip qui pète à J+15 te paie ce jour-là. Un clip dont les vues chutent passe en <span className="pill p-hold">Gelé</span> le temps de vérifier.
      </div>
      <div className="sec-h"><h2>Historique des paiements</h2></div>
      <div className="card">
        {!loaded ? <div className="empty">Chargement…</div>
          : pays.length ? pays.map((p) => (
            <div className="row" key={p.id}>
              <div className="thumb" style={{ background: "var(--surf2)", color: "var(--mint)" }}>€</div>
              <div style={{ flex: 1 }}><div className="t">{euro(p.amount)}</div><div className="s">{fmt(p.net_views)} vues payées · {agoTxt(Math.max(0, Math.floor((Date.now() - new Date(p.created_at).getTime()) / 864e5)))}</div></div>
              <span className="pill p-paid">Payé</span>
            </div>
          )) : <div className="empty">Aucun versement pour l&apos;instant. Dès que tu passes le seuil, tes paiements apparaîtront ici.</div>}
      </div>
    </>
  );
}

/* ====================== CLASSEMENT ====================== */
function Classement({ arena, userId }: { arena: Arena; userId: string }) {
  const board = arena.board;
  return (
    <>
      <div className="eyebrow" style={{ marginTop: 14 }}>Vues nettes · 7 derniers jours</div>
      <h2 className="display" style={{ fontSize: 22, margin: "4px 0 12px" }}>Classement</h2>
      {arena.loading ? <div className="card"><div className="empty">Chargement…</div></div>
        : board.length ? (
          <div className="card">
            {board.map((c, i) => {
              const me = c.id === userId;
              return (
                <div className="row" key={c.id} style={me ? { background: "rgba(139,108,255,.12)", borderRadius: 10 } : {}}>
                  <div className="thumb" style={{ background: i === 0 ? "var(--grad-coral)" : "var(--surf2)", color: i === 0 ? "#0a0610" : "var(--mut)" }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="t">{c.name}{me ? " (toi)" : ""}</div>
                    <div className="s">{c.rank} · {c.clips} clips</div>
                  </div>
                  <div className="end"><div className="vue mono">{fmt(c.vues_7)}</div><div className="delta flat">{fmt(c.vues_total)} total</div></div>
                </div>
              );
            })}
          </div>
        ) : <div className="card"><div className="empty">Personne au classement pour l&apos;instant. Sois le premier à soumettre des clips.</div></div>}
    </>
  );
}

/* ====================== PROFIL ====================== */
function Profil({ userId, email, vuesTotal, reloadProfile, actions }: { userId: string; email: string; vuesTotal: number; reloadProfile: () => void; actions: ClipActions }) {
  const [p, setP] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getSupabase().from("profiles").select("*").eq("id", userId).maybeSingle().then(({ data }) => setP(data || {}));
  }, [userId]);
  function set(k: string, v: any) { setP((o: any) => ({ ...o, [k]: v })); }
  async function save() {
    setBusy(true);
    await getSupabase().from("profiles").update({
      display_name: p.display_name, tiktok: p.tiktok, instagram: p.instagram, youtube: p.youtube,
      country: p.country, payout_method: p.payout_method, payout_detail: p.payout_detail,
    }).eq("id", userId);
    setBusy(false); reloadProfile(); actions.showToast("Profil enregistré");
  }
  async function logout() { await getSupabase().auth.signOut(); }

  const r = rankInfo(vuesTotal);
  if (!p) return <div className="wrap"><div className="empty">Chargement…</div></div>;

  return (
    <>
      <div className="eyebrow" style={{ marginTop: 14 }}>Ton profil</div>
      <h2 className="display" style={{ fontSize: 22, margin: "4px 0 10px" }}>{p.display_name || "Clipper"}</h2>
      <div className="stats">
        <div className="stat"><div className="v mono">{r.level}</div><div className="l">niveau</div></div>
        <div className="stat"><div className="v mono">{r.rank}</div><div className="l">rang</div></div>
        <div className="stat"><div className="v mono">{fmt(vuesTotal)}</div><div className="l">vues totales</div></div>
      </div>

      <div className="sec-h"><h2>Badges</h2></div>
      <div className="card" style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
        {["🚀 Premier clip", "🔥 En activité", "🎯 Qualité", "⚡ Sprint"].map((b) => <span key={b} className="pill p-track" style={{ padding: "7px 12px" }}>{b}</span>)}
      </div>

      <div className="sec-h"><h2>Mes comptes</h2></div>
      <div className="card">
        <div className="field"><label>Pseudo</label><input value={p.display_name || ""} onChange={(e) => set("display_name", e.target.value)} /></div>
        <div className="field"><label>TikTok</label><input value={p.tiktok || ""} onChange={(e) => set("tiktok", e.target.value)} placeholder="@ton_compte" /></div>
        <div className="field"><label>Instagram</label><input value={p.instagram || ""} onChange={(e) => set("instagram", e.target.value)} placeholder="@ton_compte" /></div>
        <div className="field"><label>YouTube</label><input value={p.youtube || ""} onChange={(e) => set("youtube", e.target.value)} placeholder="chaîne" /></div>
        <div className="field"><label>Pays</label><input value={p.country || ""} onChange={(e) => set("country", e.target.value)} /></div>
      </div>

      <div className="sec-h"><h2>Paiement</h2></div>
      <div className="card">
        <div className="field"><label>Méthode</label>
          <select value={p.payout_method || "paypal"} onChange={(e) => set("payout_method", e.target.value)}>
            <option value="paypal">PayPal</option><option value="iban">Virement (IBAN)</option><option value="autre">Autre</option>
          </select></div>
        <div className="field"><label>{p.payout_method === "iban" ? "IBAN" : "Email PayPal"}</label><input value={p.payout_detail || ""} onChange={(e) => set("payout_detail", e.target.value)} /></div>
      </div>

      <button className="btn btn-pri" style={{ marginTop: 16, padding: 14 }} onClick={save} disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
      <button className="btn btn-gh" style={{ marginTop: 9, padding: 12 }} onClick={logout}>Se déconnecter</button>
      <div style={{ fontSize: 11.5, color: "var(--mut2)", textAlign: "center", marginTop: 12 }}>Connecté en tant que {email}</div>
    </>
  );
}

/* ====================== RACINE ====================== */
export default function Clipper({ tab, camp, clipDetail, clips, catalog, arena, userName, userEmail, userId, reloadProfile, actions }: {
  tab: string; camp: string | null; clipDetail: string | null; clips: MyClip[]; catalog: Catalog; arena: Arena;
  userName?: string | null; userEmail?: string | null; userId: string;
  reloadProfile: () => void; actions: ClipActions;
}) {
  const vuesTotal = clips.reduce((s, c) => s + c.vues, 0);
  const vues7 = clips.reduce((s, c) => s + Math.max(0, c.d7), 0);
  const r = rankInfo(vuesTotal);

  // place réelle au classement (0 = pas encore classé)
  const place = arena.board.findIndex((b) => b.id === userId) + 1;

  let screen: React.ReactNode;
  if (tab === "camp") screen = <Campaigns camp={camp} catalog={catalog} actions={actions} />;
  else if (tab === "clips") {
    const c = clipDetail ? clips.find((x) => x.id === clipDetail) : null;
    screen = c ? <ClipDetail clip={c} actions={actions} /> : <Mine clips={clips} actions={actions} />;
  } else if (tab === "bilan") screen = <Bilan clips={clips} />;
  else if (tab === "classement") screen = <Classement arena={arena} userId={userId} />;
  else if (tab === "profil") screen = <Profil userId={userId} email={userEmail || ""} vuesTotal={vuesTotal} reloadProfile={reloadProfile} actions={actions} />;
  else screen = <Home clips={clips} name={userName || "Clipper"} place={place} arena={arena} actions={actions} />;

  return (
    <>
      <div className="hud" onClick={() => actions.go("profil")} style={{ cursor: "pointer" }}>
        <div className="hud-top">
          <div className="ava">{(userName || "C")[0].toUpperCase()}</div>
          <div><div className="hud-name">{userName || "Clipper"}</div><div className="hud-sub">{r.rank} · Niveau {r.level}</div></div>
          <div className="rank-pill"><span className="dot" />{place ? `#${place} cette semaine` : "Pas encore classé"}</div>
        </div>
      </div>
      <div className="wrap">{screen}</div>
    </>
  );
}
