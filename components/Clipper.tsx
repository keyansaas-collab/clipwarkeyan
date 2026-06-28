"use client";

import React, { useEffect, useState } from "react";
import { Icon, Avatar } from "./ui";
import { getSupabase } from "@/lib/supabase/client";
import { celebrate } from "@/lib/confetti";
import RankSeal from "./RankSeal";
import RankUp from "./RankUp";
import CountUp from "./CountUp";
import { KeyanBanner } from "./KeyanArt";
import {
  platLabel, fmt, euro, MyClip,
} from "@/lib/data";
import { Catalog, AssetReal, initialsOf } from "@/lib/catalog";
import { Arena, BoardRow, endsLabel, rewardText, kindLabel } from "@/lib/arena";
import { getMyCode, getMyReferrals, refLink, Filleul } from "@/lib/referral";
import { useSettings } from "@/lib/settings";

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
  const tiers: [string, number][] = [["Recrue", 0], ["Ambitieux", 10000], ["Hustler", 25000], ["Closer", 50000], ["Boss", 120000], ["Mogul", 300000], ["Légende Dubai", 750000]];
  let idx = 0;
  tiers.forEach((t, i) => { if (total >= t[1]) idx = i; });
  const next = tiers[idx + 1] || null;
  return { rank: tiers[idx][0], base: tiers[idx][1], level: idx + 1, next: next ? { label: next[0], at: next[1] } : null };
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
        <div className="s">{c.plat} · {agoTxt(c.ago)} <span className={"pill " + pill[0]} style={{ marginLeft: 4 }}>{pill[1]}</span>
          {c.st === "track" && (c.due || 0) > 0 && !c.eligible && (
            <span style={{ marginLeft: 6, fontSize: 10, color: "var(--amber)", fontWeight: 700 }}>· éligible à 1000 vues</span>
          )}
        </div>
      </div>
      <div className="end"><div className="vue">{fmt(c.vues)}</div><div className={"delta " + dcl(c.d7)}>{dtx(c.d7)} · 7 j</div></div>
    </div>
  );
}

/* ====================== ACCUEIL ====================== */
function Home({ clips, name, place, arena, actions }: { clips: MyClip[]; name: string; place: number; arena: Arena; actions: ClipActions }) {
  const [decl, setDecl] = useState(false);
  const dueViews = clips.reduce((s, c) => s + (c.eligible ? (c.due || 0) : 0), 0);
  const gain = clips.reduce((s, c) => s + (c.eligible ? (c.gain || 0) : 0), 0);
  const vues7 = clips.reduce((s, c) => s + Math.max(0, c.d7), 0);
  const total = clips.reduce((s, c) => s + c.vues, 0);
  const r = rankInfo(total);
  const prog = r.next ? Math.min(100, ((total - r.base) / (r.next.at - r.base)) * 100) : 100;
  const feu = [...clips].filter((c) => c.d7 > 0).sort((a, b) => b.d7 - a.d7).slice(0, 3);
  const liveChallenges = arena.challenges.filter((c) => c.active);

  // encart "tip" qui pousse à l'action (le plus pertinent)
  const tip = (() => {
    if (clips.length === 0) return { ic: "🎬", t: "Poste ton premier clip", s: "Récupère un contenu sur le Drive et lance-toi.", go: "camp" };
    const soonChallenge = liveChallenges.find((c) => c.ends_at && new Date(c.ends_at).getTime() - Date.now() < 864e5);
    if (gain >= SEUIL) return { ic: "💰", t: "Seuil atteint — tu peux être payé !", s: `${euro(gain)} en attente. Continue sur ta lancée.`, go: "bilan" };
    if (gain >= SEUIL * 0.5) return { ic: "🔥", t: `Plus que ${euro(SEUIL - gain)} pour le seuil`, s: "Tu y es presque — un clip de plus peut suffire.", go: "camp" };
    if (vues7 === 0) return { ic: "⏰", t: "Tes clips dorment", s: "Poste un nouveau clip pour relancer tes vues.", go: "camp" };
    if (soonChallenge) return { ic: "🏆", t: "Un challenge se termine bientôt", s: `${soonChallenge.title} — tente la prime.`, go: "home" };
    return { ic: "🚀", t: "Continue à poster", s: "Plus tu clippes, plus tu montes au classement.", go: "camp" };
  })();

  return (
    <>
      <RankUp views={total} />
      <div style={{ position: "relative", marginBottom: 12 }}>
        <KeyanBanner src="/keyan-cash.jpg" height={130} caption="Transforme tes vues en cash 💸" />
        <span className="sticker" style={{ position: "absolute", top: 10, right: 10 }}>NO RISK NO STORY</span>
      </div>

      <div className="card press" onClick={() => setDecl(true)} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", background: "linear-gradient(150deg,rgba(255,106,69,.12),rgba(245,196,81,.05)),var(--surf)", borderColor: "rgba(255,106,69,.25)", marginBottom: 12 }}>
        <div style={{ fontSize: 22 }}>🔥</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontStyle: "italic", fontSize: 14 }}>J&apos;ai un prospect chaud</div>
          <div style={{ fontSize: 12, color: "var(--mut)" }}>Quelqu&apos;un d&apos;intéressé en DM ? Déclare-le, ton setter le récupère.</div>
        </div>
        <span style={{ color: "var(--coral)", fontWeight: 800 }}>→</span>
      </div>
      <div className="tip" onClick={() => actions.go(tip.go)} style={{ cursor: "pointer" }}>
        <div className="tip-ic">{tip.ic}</div>
        <div style={{ flex: 1 }}><div className="tip-t">{tip.t}</div><div className="tip-s">{tip.s}</div></div>
        <span style={{ color: "var(--mut)" }}>→</span>
      </div>

      <div className="card" style={{ background: "linear-gradient(150deg,rgba(139,108,255,.2),rgba(45,226,230,.06)),var(--surf)", borderColor: "var(--line2)" }}>
        <div style={{ fontSize: 12, color: "var(--mut)", fontWeight: 600 }}>À recevoir</div>
        <div className="display gold" style={{ fontSize: 38, fontWeight: 700, margin: "4px 0", letterSpacing: "-1px" }}><CountUp value={gain} format={euro} /></div>
        <div style={{ fontSize: 12.5, color: "var(--mut)" }}>{fmt(dueViews)} vues à payer · {clips.length} clips</div>
        <div className="meter"><i style={{ width: Math.min(100, (gain / SEUIL) * 100) + "%" }} /></div>
        <div style={{ fontSize: 11.5, color: "var(--mut)", marginTop: 7 }}>Seuil de paiement : {SEUIL} € {gain >= SEUIL ? "— atteint ✓" : `· encore ${euro(SEUIL - gain)}`}</div>
      </div>

      <div className="sec-h"><h2>Ta progression</h2></div>
      <div className="card" style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <RankSeal views={total} size={76} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
            <span>{r.rank}</span>{r.next && <span style={{ color: "var(--mut)", fontWeight: 600 }}>{r.next.label}</span>}
          </div>
          <div className="bar" style={{ background: "var(--bg2)" }}><i style={{ width: prog + "%" }} /></div>
          {r.next
            ? <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 8 }}>Encore <b style={{ color: "var(--text)" }}>{fmt(r.next.at - total)}</b> vues pour passer <b style={{ color: "var(--text)" }}>{r.next.label}</b>.</div>
            : <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 8 }}>Rang maximum atteint 👑 Légende Dubai.</div>}
        </div>
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
      <div className="card press" style={{ display: "flex", alignItems: "center", gap: 14, cursor: "pointer", background: place ? "linear-gradient(150deg,rgba(245,196,81,.10),rgba(255,106,69,.05)),rgba(22,17,38,.6)" : undefined }} onClick={() => actions.go("classement")}>
        <div className="podium"><i /><i /><i /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontStyle: "italic", fontSize: 15 }}>{place ? `#${place} cette semaine` : "Pas encore classé"}</div>
          <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 2 }}>{place ? `${fmt(vues7)} vues nettes · 7 j` : "Poste un clip pour entrer dans la course"}</div>
        </div>
        <span style={{ color: "var(--coral)", fontSize: 18, fontWeight: 800 }}>→</span>
      </div>
      {decl && <DeclareModal onClose={() => setDecl(false)} onDone={() => { setDecl(false); actions.showToast("Prospect transmis à ton setter ✨"); }} />}
    </>
  );
}

function DeclareModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [handle, setHandle] = useState("");
  const [need, setNeed] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!handle.trim()) return;
    setBusy(true);
    await getSupabase().rpc("add_prospect", { p_handle: handle, p_clipper: null, p_need: need });
    setBusy(false); onDone();
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(6,5,12,.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, background: "var(--surf)", border: "1px solid var(--line2)", borderRadius: "20px 20px 0 0", padding: 18 }}>
        <h3 style={{ margin: "0 0 4px", fontStyle: "italic" }}>Déclarer un prospect chaud 🔥</h3>
        <div style={{ fontSize: 12, color: "var(--mut)", marginBottom: 14 }}>Ton setter prend le relais pour le convertir.</div>
        <label className="fld-l">Son pseudo Instagram</label>
        <input className="fld" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@marco_b" autoFocus />
        <label className="fld-l">Ce qu&apos;il veut (optionnel)</label>
        <input className="fld" value={need} onChange={(e) => setNeed(e.target.value)} placeholder="lancer un business…" />
        <button className="btn btn-pri" style={{ width: "100%", marginTop: 14, padding: 13 }} disabled={busy || !handle.trim()} onClick={save}>{busy ? "…" : "Transmettre 🚀"}</button>
      </div>
    </div>
  );
}

/* ====================== CAMPAGNES (catalogue réel) ====================== */
function Campaigns({ camp, catalog, actions }: { camp: string | null; catalog: Catalog; actions: ClipActions }) {
  const { driveUrl } = useSettings();
  if (camp) {
    const c = catalog.campaigns.find((x) => x.id === camp);
    if (!c) return <div className="empty" style={{ marginTop: 20 }}>Campagne introuvable.</div>;
    return (
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <button className="btn btn-gh" style={{ width: "auto", padding: "8px 12px" }} onClick={() => actions.go("camp")}>← Retour</button>
          <div><div style={{ fontWeight: 600, fontSize: 15 }}>{c.name}</div>
            <div style={{ fontSize: 12, color: "var(--mut)" }}>{String(c.rate).replace(".", ",")} € / 1000 vues</div></div>
        </div>
        {c.description && <p style={{ color: "var(--mut)", fontSize: 13, margin: "12px 2px 0" }}>{c.description}</p>}

        <div className="card" style={{ marginTop: 14, background: "linear-gradient(150deg,rgba(45,226,230,.12),rgba(139,108,255,.06)),var(--surf)", borderColor: "var(--line2)" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>📁 Tous les contenus sont sur le Drive</div>
          <div style={{ fontSize: 12.5, color: "var(--mut)", marginTop: 4 }}>Pioche ce que tu veux, mélange les intros et les séquences, monte ta vidéo, puis soumets ton clip ici.</div>
          <a className="btn btn-pri" style={{ marginTop: 12, padding: 13, display: "block", textAlign: "center", textDecoration: "none" }} href={driveUrl} target="_blank" rel="noopener noreferrer">Ouvrir le Drive ↗</a>
          <button className="btn btn-gh" style={{ marginTop: 9, padding: 12 }} onClick={() => actions.openSubmit()}>J&apos;ai mon clip — le soumettre</button>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="eyebrow" style={{ marginTop: 14 }}>Campagnes</div>
      <h2 className="display" style={{ fontSize: 22, margin: "4px 0 4px" }}>Choisis ton terrain</h2>
      <p style={{ color: "var(--mut)", fontSize: 13, marginBottom: 6 }}>Chaque campagne = son tarif aux vues. Les contenus sont sur le Drive commun.</p>

      <a className="card" style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 13, textDecoration: "none", background: "linear-gradient(150deg,rgba(45,226,230,.14),rgba(139,108,255,.06)),var(--surf)", borderColor: "var(--line2)" }} href={driveUrl} target="_blank" rel="noopener noreferrer">
        <div className="thumb" style={{ width: 48, height: 48, background: "var(--grad)", fontSize: 22 }}>📁</div>
        <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 15 }}>Accéder au Drive</div><div style={{ fontSize: 12, color: "var(--mut)", marginTop: 2 }}>Tous les contenus à clipper, au même endroit ↗</div></div>
      </a>

      {catalog.loading && <div className="card" style={{ marginTop: 12 }}><div className="empty">Chargement du catalogue…</div></div>}
      {!catalog.loading && catalog.campaigns.filter((c) => c.is_active).length === 0 && (
        <div className="card" style={{ marginTop: 12 }}><div className="empty">Aucune campagne active pour l&apos;instant. Reviens bientôt.</div></div>
      )}
      {catalog.campaigns.filter((c) => c.is_active).map((c) => (
        <div className="card" key={c.id} style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }} onClick={() => actions.openCamp(c.id)}>
          <div className="thumb" style={{ width: 54, height: 54, background: c.accent }}>{initialsOf(c.name)}</div>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 15 }}>{c.name}</div>
            <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 2 }}>{c.description}</div>
            <div style={{ marginTop: 7 }}><span className="tag">{String(c.rate).replace(".", ",")} € / 1000 vues</span></div></div>
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
      <div style={{ background: "var(--bg2)", border: "1px solid var(--line2)", borderRadius: 12, padding: "11px 13px", fontSize: 12, color: "var(--mut)", lineHeight: 1.5, marginBottom: 10 }}>
        ℹ️ On compte les <b style={{ color: "var(--text)" }}>vues publiques</b>, mises à jour plusieurs fois par jour. Sur <b style={{ color: "var(--text)" }}>Instagram</b>, ton appli affiche en plus les vues <b style={{ color: "var(--text)" }}>Facebook</b> (les Reels y sont partagés automatiquement) : ces vues-là sont invisibles publiquement, donc ton total Instagram paraît plus élevé. C'est normal — on paie sur les vues vérifiables.
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

      {/instagram/i.test(clip.plat) && (
        <div style={{ background: "var(--bg2)", border: "1px solid var(--line2)", borderRadius: 12, padding: "11px 13px", fontSize: 12, color: "var(--mut)", lineHeight: 1.5, marginTop: 10 }}>
          ℹ️ Le chiffre que tu vois dans l&apos;appli Instagram inclut les vues <b style={{ color: "var(--text)" }}>Facebook</b> (ton Reel y est partagé automatiquement). Ces vues ne sont pas publiques, donc ClipWar ne compte que les <b style={{ color: "var(--text)" }}>vues Instagram publiques</b> — un peu plus basses, mais vérifiables par tous.
        </div>
      )}

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
function Bilan({ clips, actions }: { clips: MyClip[]; actions: ClipActions }) {
  const { payWindowDays: win } = useSettings();
  const dueViews = clips.reduce((s, c) => s + (c.eligible ? (c.due || 0) : 0), 0);
  const gain = clips.reduce((s, c) => s + (c.eligible ? (c.gain || 0) : 0), 0);
  const [pending, setPending] = useState<{ amount: number; created_at: string } | null>(null);
  const [busyReq, setBusyReq] = useState(false);
  const [busyRef, setBusyRef] = useState(false);
  useEffect(() => {
    if (gain >= SEUIL) {
      try {
        if (!sessionStorage.getItem("cw_seuil_celebrated")) {
          sessionStorage.setItem("cw_seuil_celebrated", "1");
          celebrate({ emojis: ["💰", "🎉", "🔥"] });
        }
      } catch {}
    }
  }, [gain]);
  const [pays, setPays] = useState<PayRow[]>([]);
  const [paid, setPaid] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    getSupabase().from("payments").select("id, amount, net_views, created_at").eq("status", "paid").order("created_at", { ascending: false })
      .then(({ data }) => {
        const rows = (data as PayRow[]) || [];
        setPays(rows); setPaid(rows.reduce((s, p) => s + Number(p.amount), 0)); setLoaded(true);
      });
    getSupabase().from("payout_requests").select("amount, created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(1)
      .then(({ data }) => { if (data && data[0]) setPending({ amount: Number(data[0].amount), created_at: data[0].created_at }); });
  }, []);

  async function refreshMyViews() {
    setBusyRef(true);
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 60000);
    try {
      const { data: s } = await getSupabase().auth.getSession();
      const res = await fetch("/api/clipper/refresh-views", { method: "POST", headers: { authorization: `Bearer ${s.session?.access_token}` }, signal: ctrl.signal });
      clearTimeout(to);
      const j = await res.json();
      if (res.status === 429) actions.showToast(`Patiente encore ${Math.ceil((j.retryInSec || 60) / 60)} min`);
      else if (!res.ok) actions.showToast("Échec du relevé");
      else actions.showToast("Vues mises à jour ✨ — recharge dans un instant");
    } catch (e: any) {
      clearTimeout(to);
      actions.showToast(e?.name === "AbortError" ? "Ça continue en arrière-plan — recharge dans 1 min" : "Erreur réseau");
    }
    setBusyRef(false);
  }
  async function askPayout() {
    setBusyReq(true);
    const { data, error } = await getSupabase().rpc("request_payout");
    setBusyReq(false);
    if (error) { actions.showToast(error.message.includes("Rien") ? "Rien à demander pour l'instant" : "Demande impossible"); return; }
    const row = Array.isArray(data) ? data[0] : data;
    setPending({ amount: Number(row?.amount) || gain, created_at: new Date().toISOString() });
    actions.showToast("Demande envoyée 💸 — le staff va valider");
  }

  return (
    <>
      <div className="eyebrow" style={{ marginTop: 14 }}>Dû cumulatif · depuis ton dernier versement</div>
      <h2 className="display" style={{ fontSize: 22, margin: "4px 0 12px" }}>Ton bilan</h2>
      <div className="card" style={{ background: "linear-gradient(150deg,rgba(53,230,161,.14),rgba(45,226,230,.05)),var(--surf)", borderColor: "rgba(53,230,161,.25)" }}>
        <div style={{ fontSize: 12, color: "var(--mut)", fontWeight: 600 }}>À recevoir · vues non encore payées</div>
        <div className="display gold" style={{ fontSize: 40, fontWeight: 700, margin: "6px 0", letterSpacing: "-1px" }}><CountUp value={gain} format={euro} /></div>
        <div style={{ fontSize: 12.5, color: "var(--mut)" }}>{fmt(dueViews)} vues à payer · {euro(paid)} déjà reçus</div>
        <div className="meter"><i style={{ width: Math.min(100, (gain / SEUIL) * 100) + "%", background: "var(--mint)" }} /></div>
        <div style={{ fontSize: 11.5, color: "var(--mut)", marginTop: 8 }}>Seuil de paiement : {SEUIL} € {gain >= SEUIL ? "— atteint ✓" : `· encore ${euro(SEUIL - gain)}`}</div>

        <button className="btn btn-gh" style={{ marginTop: 12, padding: 11 }} onClick={refreshMyViews} disabled={busyRef}>{busyRef ? "Relevé en cours…" : "↻ Mettre à jour mes vues"}</button>
        {pending ? (
          <div style={{ marginTop: 9, textAlign: "center", fontSize: 12.5, color: "var(--mint)", background: "var(--bg2)", border: "1px solid var(--line2)", borderRadius: 10, padding: "11px 12px" }}>
            ✓ Demande de paiement envoyée ({euro(pending.amount)}) — en attente de validation du staff.
          </div>
        ) : (
          <button className={"btn btn-pri" + (gain >= SEUIL ? " pulse-gold" : "")} style={{ marginTop: 9, padding: 13 }} onClick={askPayout} disabled={busyReq || gain <= 0}>{busyReq ? "Envoi…" : "Demander mon paiement 💸"}</button>
        )}
      </div>
      <div className="sec-h"><h2>Comment c&apos;est calculé</h2></div>
      <div className="card" style={{ fontSize: 13, color: "var(--mut)", lineHeight: 1.7 }}>
        On relève tes vues plusieurs fois par jour. À chaque versement, on te paie les <b style={{ color: "var(--text)" }}>nouvelles vues</b> depuis la dernière fois (vues actuelles − déjà payées) — jamais deux fois les mêmes. {win > 0 && <>Une vidéo rapporte pendant ses <b style={{ color: "var(--text)" }}>{win} premiers jours</b> après le post (sauf pendant un challenge), puis son compteur payable se fige. </>}Un clip dont les vues chutent passe en <span className="pill p-hold">Gelé</span> le temps de vérifier.
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
                  <div style={{ position: "relative" }}>
                    <Avatar url={c.avatar_url} name={c.name} size={40} />
                    <div style={{ position: "absolute", top: -4, left: -4, width: 18, height: 18, borderRadius: "50%", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", background: i === 0 ? "var(--grad-coral)" : "var(--surf2)", color: i === 0 ? "#0a0610" : "var(--mut)", border: "2px solid var(--surf)" }}>{i + 1}</div>
                  </div>
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

  const [uploading, setUploading] = useState(false);
  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { actions.showToast("Photo trop lourde (max 5 Mo)"); return; }
    setUploading(true);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${userId}/avatar.${ext}`;
    const sb = getSupabase();
    const { error } = await sb.storage.from("avatars").upload(path, file, { upsert: true, cacheControl: "3600" });
    if (error) { setUploading(false); actions.showToast("Échec de l'upload"); return; }
    const url = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl + "?t=" + Date.now();
    await sb.from("profiles").update({ avatar_url: url }).eq("id", userId);
    setP((o: any) => ({ ...o, avatar_url: url }));
    setUploading(false); reloadProfile(); actions.showToast("Photo mise à jour ✨");
  }

  const r = rankInfo(vuesTotal);
  if (!p) return <div className="wrap"><div className="empty">Chargement…</div></div>;

  return (
    <>
      <div className="eyebrow" style={{ marginTop: 14 }}>Ton profil</div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "8px 0 12px" }}>
        <Avatar url={p.avatar_url} name={p.display_name || "C"} size={68} />
        <div style={{ flex: 1 }}>
          <h2 className="display" style={{ fontSize: 22, margin: 0 }}>{p.display_name || "Clipper"}</h2>
          <label className="btn btn-gh" style={{ width: "auto", padding: "7px 12px", fontSize: 12.5, marginTop: 6, display: "inline-block", cursor: "pointer" }}>
            {uploading ? "Envoi…" : p.avatar_url ? "Changer la photo" : "Ajouter une photo"}
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={uploadAvatar} disabled={uploading} />
          </label>
        </div>
      </div>
      <div className="card" style={{ display: "flex", gap: 16, alignItems: "center", background: "linear-gradient(150deg,rgba(245,196,81,.10),rgba(139,108,255,.05)),var(--surf)" }}>
        <RankSeal views={vuesTotal} size={92} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "var(--mut)", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Ton rang</div>
          <div className="display" style={{ fontSize: 22, margin: "2px 0 4px" }}>{r.rank}</div>
          {r.next
            ? <div style={{ fontSize: 12, color: "var(--mut)" }}>Encore <b style={{ color: "var(--text)" }}>{fmt(r.next.at - vuesTotal)}</b> vues → <b style={{ color: "var(--text)" }}>{r.next.label}</b></div>
            : <div style={{ fontSize: 12, color: "var(--mut)" }}>Rang ultime 👑</div>}
        </div>
      </div>
      <div className="stats">
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

      <ReferralCard actions={actions} />

      <button className="btn btn-pri" style={{ marginTop: 16, padding: 14 }} onClick={save} disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
      <button className="btn btn-gh" style={{ marginTop: 9, padding: 12 }} onClick={logout}>Se déconnecter</button>
      <div style={{ fontSize: 11.5, color: "var(--mut2)", textAlign: "center", marginTop: 12 }}>Connecté en tant que {email}</div>
    </>
  );
}

/* ───────────── PARRAINAGE ───────────── */
function ReferralCard({ actions }: { actions: ClipActions }) {
  const { refBonus: REF_BONUS, refMilestone: REF_MILESTONE } = useSettings();
  const [code, setCode] = useState<string | null>(null);
  const [filleuls, setFilleuls] = useState<Filleul[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [c, f] = await Promise.all([getMyCode(), getMyReferrals()]);
      setCode(c); setFilleuls(f); setLoading(false);
    })();
  }, []);

  const valides = filleuls.filter((f) => f.reached).length;
  const bonus = valides * REF_BONUS;
  const link = code ? refLink(code) : "";

  async function copy() {
    try { await navigator.clipboard.writeText(link); actions.showToast("Lien copié ✨"); }
    catch { actions.showToast("Copie impossible"); }
  }
  async function share() {
    if (navigator.share) {
      try { await navigator.share({ title: "Rejoins ClipWar", text: "Gagne de l'argent en clippant 🎬", url: link }); } catch {}
    } else copy();
  }

  return (
    <>
      <div className="sec-h" style={{ marginTop: 22 }}><h2>Parrainage</h2></div>
      <div className="card" style={{ background: "linear-gradient(150deg,rgba(139,108,255,.14),rgba(45,226,230,.05)),var(--surf)", borderColor: "var(--line2)" }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Invite tes amis, gagne {REF_BONUS} € par filleul 🎁</div>
        <div style={{ fontSize: 12.5, color: "var(--mut)", marginTop: 3 }}>
          Tu touches {REF_BONUS} € dès qu&apos;un filleul atteint {fmt(REF_MILESTONE)} vues. Ton lien :
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <div className="mono" style={{ flex: 1, minWidth: 0, background: "var(--bg2)", border: "1px solid var(--line2)", borderRadius: 10, padding: "10px 12px", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{loading ? "…" : link}</div>
          <button className="btn btn-gh" style={{ width: "auto", padding: "0 14px" }} onClick={copy} disabled={!code}>Copier</button>
        </div>
        <button className="btn btn-pri" style={{ marginTop: 9, padding: 12 }} onClick={share} disabled={!code}>Partager mon lien</button>

        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <div style={{ flex: 1, textAlign: "center", background: "var(--bg2)", borderRadius: 12, padding: "10px 6px" }}>
            <div className="display" style={{ fontSize: 20 }}>{filleuls.length}</div><div style={{ fontSize: 11, color: "var(--mut)" }}>filleuls</div></div>
          <div style={{ flex: 1, textAlign: "center", background: "var(--bg2)", borderRadius: 12, padding: "10px 6px" }}>
            <div className="display" style={{ fontSize: 20 }}>{valides}</div><div style={{ fontSize: 11, color: "var(--mut)" }}>validés</div></div>
          <div style={{ flex: 1, textAlign: "center", background: "var(--bg2)", borderRadius: 12, padding: "10px 6px" }}>
            <div className="display" style={{ fontSize: 20, color: "var(--mint)" }}>{euro(bonus)}</div><div style={{ fontSize: 11, color: "var(--mut)" }}>bonus</div></div>
        </div>
      </div>

      {filleuls.length > 0 && (
        <div className="card" style={{ marginTop: 8 }}>
          {filleuls.map((f) => {
            const pct = Math.min(100, Math.round((f.vues_total / REF_MILESTONE) * 100));
            return (
              <div className="row" key={f.id}>
                <Avatar url={f.avatar_url} name={f.name} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="t">{f.name} {f.reached && <span className="pill p-paid" style={{ marginLeft: 4 }}>validé · +{REF_BONUS}€</span>}</div>
                  <div className="meter" style={{ marginTop: 6 }}><i style={{ width: pct + "%", background: f.reached ? "var(--mint)" : "var(--grad)" }} /></div>
                </div>
                <div className="end"><div className="vue mono" style={{ fontSize: 12.5 }}>{fmt(f.vues_total)}</div><div className="delta flat">/ {fmt(REF_MILESTONE)}</div></div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ====================== RACINE ====================== */
export default function Clipper({ tab, camp, clipDetail, clips, catalog, arena, userName, userEmail, userId, userAvatar, reloadProfile, actions }: {
  tab: string; camp: string | null; clipDetail: string | null; clips: MyClip[]; catalog: Catalog; arena: Arena;
  userName?: string | null; userEmail?: string | null; userId: string; userAvatar?: string | null;
  reloadProfile: () => void; actions: ClipActions;
}) {
  const vuesTotal = clips.reduce((s, c) => s + c.vues, 0);
  const vues7 = clips.reduce((s, c) => s + Math.max(0, c.d7), 0);
  const r = rankInfo(vuesTotal);

  // place réelle au classement (0 = pas encore classé)
  const place = arena.board.findIndex((b) => b.id === userId) + 1;

  // pop-up de bienvenue (1re visite)
  const [welcome, setWelcome] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem("cw_welcome_seen")) setWelcome(true);
    } catch {}
  }, []);
  function closeWelcome() {
    try { localStorage.setItem("cw_welcome_seen", "1"); } catch {}
    setWelcome(false);
  }

  let screen: React.ReactNode;
  if (tab === "camp") screen = <Campaigns camp={camp} catalog={catalog} actions={actions} />;
  else if (tab === "clips") {
    const c = clipDetail ? clips.find((x) => x.id === clipDetail) : null;
    screen = c ? <ClipDetail clip={c} actions={actions} /> : <Mine clips={clips} actions={actions} />;
  } else if (tab === "bilan") screen = <Bilan clips={clips} actions={actions} />;
  else if (tab === "classement") screen = <Classement arena={arena} userId={userId} />;
  else if (tab === "profil") screen = <Profil userId={userId} email={userEmail || ""} vuesTotal={vuesTotal} reloadProfile={reloadProfile} actions={actions} />;
  else screen = <Home clips={clips} name={userName || "Clipper"} place={place} arena={arena} actions={actions} />;

  return (
    <>
      <div className="hud" onClick={() => actions.go("profil")} style={{ cursor: "pointer" }}>
        <div className="hud-top">
          <Avatar url={userAvatar} name={userName || "C"} size={42} />
          <div><div className="hud-name">{userName || "Clipper"}</div><div className="hud-sub">{r.rank} · Niveau {r.level}</div></div>
          <div className="rank-pill"><span className="dot" />{place ? `#${place} cette semaine` : "Pas encore classé"}</div>
        </div>
      </div>
      <div className="wrap">{screen}</div>
      {welcome && (
        <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) closeWelcome(); }}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grab" />
            <div style={{ textAlign: "center", fontSize: 34, marginTop: 4 }}>🎬🔥</div>
            <h3 style={{ textAlign: "center" }}>Bienvenue dans la War Room</h3>
            <p style={{ color: "var(--mut)", fontSize: 13.5, textAlign: "center", marginBottom: 14 }}>Gagne de l&apos;argent en clippant. 3 étapes :</p>
            <div className="card" style={{ marginBottom: 8 }}><div className="row" style={{ paddingTop: 0 }}><div className="thumb" style={{ background: "var(--grad)" }}>1</div><div><div className="t">Récupère un contenu</div><div className="s">Onglet Campagnes → ouvre le Drive commun</div></div></div></div>
            <div className="card" style={{ marginBottom: 8 }}><div className="row" style={{ paddingTop: 0 }}><div className="thumb" style={{ background: "var(--grad)" }}>2</div><div><div className="t">Poste & soumets ton clip</div><div className="s">Le bouton + → on suit tes vues automatiquement</div></div></div></div>
            <div className="card" style={{ marginBottom: 14 }}><div className="row" style={{ paddingTop: 0 }}><div className="thumb" style={{ background: "var(--grad)" }}>3</div><div><div className="t">Tu es payé aux vues</div><div className="s">Plus tu fais de vues, plus tu gagnes. Vise le seuil !</div></div></div></div>
            <button className="btn btn-pri" style={{ padding: 14 }} onClick={() => { closeWelcome(); celebrate({ emojis: ["🎬", "🔥", "💰"] }); }}>C&apos;est parti 🚀</button>
          </div>
        </div>
      )}
    </>
  );
}
