import React from "react";
import { Hud, Icon } from "./ui";
import {
  campaigns, assets, challenges, clippersFull, alerts, views7days, dayLabels, aVerserTotal,
  campName, campGrad, initials, fmt, euro, Asset, ClipperRow,
} from "@/lib/data";

export type AdmActions = {
  go: (tab: string) => void;
  openImport: () => void;
  openClipper: (id: string) => void;
  openNewChallenge: () => void;
  openNewCampaign: () => void;
  showToast: (m: string) => void;
};

function Bars({ data, labels }: { data: number[]; labels?: string[] }) {
  const max = Math.max(...data, 1);
  return (
    <>
      <div className="adm-bars">{data.map((v, i) => <div key={i} className="adm-bar" style={{ height: Math.max(6, (v / max) * 100) + "%" }} />)}</div>
      {labels && <div className="adm-daylabels">{labels.map((l, i) => <span key={i}>{l}</span>)}</div>}
    </>
  );
}

function deltaClass(d: number) { return d > 0 ? "up" : d < 0 ? "down" : "flat"; }
function PepiteRow({ a }: { a: Asset }) {
  const ratio = Math.round(a.vues / a.dl);
  const pct = Math.min(100, (ratio / 8000) * 100);
  return (
    <div className="row" style={{ alignItems: "flex-start" }}>
      <div className="thumb" style={{ background: campGrad(a.camp) }}>{campName(a.camp)[0]}</div>
      <div style={{ flex: 1 }}>
        <div className="t">{a.t}</div>
        <div className="s">{fmt(a.vues)} vues · {a.clips} clips</div>
        <div className="meter"><i style={{ width: pct + "%", background: "var(--grad)" }} /></div>
      </div>
      <div className="end"><div className="vue mono">{fmt(ratio)}</div><div className="delta flat">vues / dl</div></div>
    </div>
  );
}

/* ---------- DASHBOARD ---------- */
function Dash({ actions }: { actions: AdmActions }) {
  const pepites = [...assets].sort((a, b) => b.vues / b.dl - a.vues / a.dl).slice(0, 3);
  const totalVues7 = clippersFull.reduce((s, c) => s + c.vues7, 0);
  const totalPubs = clippersFull.reduce((s, c) => s + c.pubs7.reduce((x, y) => x + y, 0), 0);
  return (
    <>
      <div className="adm-kpis">
        <div className="adm-kpi"><div className="v gr">{fmt(Math.round(totalVues7 / 1e6 * 10) / 10)}M</div><div className="l">vues · 7 j</div></div>
        <div className="adm-kpi"><div className="v">{euro(aVerserTotal)}</div><div className="l">à verser</div></div>
        <div className="adm-kpi"><div className="v">{clippersFull.length}</div><div className="l">clippers actifs</div></div>
        <div className="adm-kpi"><div className="v">{totalPubs}</div><div className="l">pubs · 7 j</div></div>
      </div>

      <div className="sec-h"><h2>Vues · 7 derniers jours</h2></div>
      <div className="card"><Bars data={views7days} labels={dayLabels} /></div>

      <div className="sec-h"><h2>Alertes anti-triche</h2><span className="more" onClick={() => actions.go("fraud")}>Tout voir</span></div>
      {alerts.slice(0, 1).map((a, i) => (
        <div className="alert" key={i}><div className="ic">{a.ic}</div><div><div className="at">{a.t}</div><div className="as">{a.s}</div></div></div>
      ))}

      <div className="sec-h"><h2>Top clippers</h2><span className="more" onClick={() => actions.go("clippers")}>Voir tout</span></div>
      <div className="card">
        {[...clippersFull].sort((a, b) => b.vues7 - a.vues7).slice(0, 3).map((c, i) => (
          <div className="row" key={c.id} style={{ cursor: "pointer" }} onClick={() => actions.openClipper(c.id)}>
            <div className="thumb" style={{ width: 32, height: 32, fontSize: 12, background: i === 0 ? "var(--grad-coral)" : "var(--surf2)", color: i === 0 ? "#0a0610" : "var(--mut)" }}>{i + 1}</div>
            <div style={{ flex: 1 }}><div className="t">{c.name}</div><div className="s">{c.rank} · {c.clips} clips</div></div>
            <div className="end"><div className="vue mono">{fmt(c.vues7)}</div><div className="delta up">{euro(c.gain)}</div></div>
          </div>
        ))}
      </div>

      <div className="sec-h"><h2>Tes pépites</h2><span className="more" onClick={() => actions.go("assets")}>Tous les assets</span></div>
      <div className="card">{pepites.map((a) => <PepiteRow a={a} key={a.id} />)}</div>
    </>
  );
}

/* ---------- CLIPPERS (liste) ---------- */
function Clippers({ actions }: { actions: AdmActions }) {
  const sorted = [...clippersFull].sort((a, b) => b.vues7 - a.vues7);
  return (
    <>
      <div className="eyebrow" style={{ marginTop: 14 }}>{clippersFull.length} clippers</div>
      <h2 className="display" style={{ fontSize: 22, margin: "4px 0 12px" }}>Tes clippers</h2>
      <div className="card">
        {sorted.map((c, i) => (
          <div className="row" key={c.id} style={{ cursor: "pointer" }} onClick={() => actions.openClipper(c.id)}>
            <div className="thumb" style={{ background: i === 0 ? "var(--grad-coral)" : "var(--surf2)", color: i === 0 ? "#0a0610" : "var(--mut)" }}>{initials(c.name)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t">{c.name} {c.minor && <span className="adm-minor">mineur</span>}</div>
              <div className="s">{c.rank} · {c.country} · {c.clips} clips</div>
            </div>
            <div className="end"><div className="vue mono">{fmt(c.vues7)}</div><div className="delta up">{euro(c.gain)} à verser</div></div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- CLIPPER (fiche détaillée) ---------- */
function ClipperDetail({ c, actions }: { c: ClipperRow; actions: AdmActions }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
        <button className="btn btn-gh" style={{ width: "auto", padding: "8px 12px" }} onClick={() => actions.go("clippers")}>← Clippers</button>
      </div>
      <div className="card" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 13 }}>
        <div className="thumb" style={{ width: 52, height: 52, fontSize: 17, background: "var(--grad)" }}>{initials(c.name)}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 17 }} className="display">{c.name}</div>
          <div className="s">{c.rank} · {c.country}</div>
        </div>
        {c.minor ? <span className="adm-minor">mineur</span> : <span className="adm-major">majeur</span>}
      </div>

      <div style={{ marginTop: 12 }}>
        {c.tiktok && <span className="adm-chip"><span className="h">TikTok</span> {c.tiktok}</span>}
        {c.instagram && <span className="adm-chip"><span className="h">Insta</span> {c.instagram}</span>}
        {c.youtube && <span className="adm-chip"><span className="h">YouTube</span> {c.youtube}</span>}
      </div>

      <div className="adm-kpis">
        <div className="adm-kpi"><div className="v gr">{fmt(c.vues7)}</div><div className="l">vues · 7 j</div></div>
        <div className="adm-kpi"><div className="v">{fmt(c.vuesTotal)}</div><div className="l">vues totales</div></div>
        <div className="adm-kpi"><div className="v">{c.clips}</div><div className="l">clips</div></div>
        <div className="adm-kpi"><div className="v">{euro(c.gain)}</div><div className="l">à verser</div></div>
      </div>

      <div className="sec-h"><h2>Publications · 7 derniers jours</h2></div>
      <div className="card"><Bars data={c.pubs7} labels={dayLabels} />
        <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 10 }}>{c.pubs7.reduce((a, b) => a + b, 0)} publications cette semaine · {(c.pubs7.reduce((a, b) => a + b, 0) / 7).toFixed(1)} / jour</div>
      </div>

      <div className="sec-h"><h2>Ses clips</h2></div>
      <div className="card">
        {c.recent.map((r, i) => {
          const pill = { track: ["p-track", "En suivi"], paid: ["p-paid", "Payé"], hold: ["p-hold", "Gelé"] }[r.st];
          return (
            <div className="row" key={i}>
              <div className="thumb" style={{ background: "var(--surf2)", color: "var(--mut)" }}>{r.plat[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.asset}</div>
                <div className="s">{r.plat} · <span className={deltaClass(r.d7)}>{(r.d7 > 0 ? "+" : "") + fmt(r.d7)} · 7 j</span></div>
              </div>
              <div className="end"><div className="vue">{fmt(r.vues)}</div><span className={"pill " + pill[0]} style={{ marginTop: 4, display: "inline-block" }}>{pill[1]}</span></div>
            </div>
          );
        })}
      </div>

      <div className="sec-h"><h2>Paiement</h2></div>
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div className="t">{c.payout}</div>
          <div className="s">{c.payoutDetail}</div>
        </div>
        <button className="btn btn-pri" style={{ width: "auto", padding: "10px 14px" }} onClick={() => actions.showToast(`${euro(c.gain)} marqués comme versés à ${c.name}`)}>Marquer payé · {euro(c.gain)}</button>
      </div>
    </>
  );
}

/* ---------- CAMPAGNES ---------- */
function Campaigns({ actions }: { actions: AdmActions }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
        <div><div className="eyebrow">Contenus</div><h2 className="display" style={{ fontSize: 22, marginTop: 4 }}>Campagnes</h2></div>
        <button className="btn btn-pri adm-actionbtn" onClick={actions.openNewCampaign}>+ Nouvelle</button>
      </div>
      {campaigns.map((c) => {
        const camAssets = assets.filter((a) => a.camp === c.id);
        const vues = camAssets.reduce((s, a) => s + a.vues, 0);
        return (
          <div className="card" key={c.id} style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
              <div className="thumb" style={{ background: c.grad }}>{initials(c.name)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{c.name}</div>
                <div className="s">{c.assets} assets · {String(c.rate).replace(".", ",")} € / 1000 vues</div>
              </div>
              <span className="pill p-paid">Active</span>
            </div>
            <div className="adm-kpis" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
              <div className="adm-kpi"><div className="v">{fmt(vues)}</div><div className="l">vues générées</div></div>
              <div className="adm-kpi"><div className="v">{camAssets.reduce((s, a) => s + a.clips, 0)}</div><div className="l">clips</div></div>
              <div className="adm-kpi"><div className="v">{c.assets}</div><div className="l">assets</div></div>
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ---------- CHALLENGES ---------- */
function Challenges({ actions }: { actions: AdmActions }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
        <div><div className="eyebrow">Surcouches temporaires</div><h2 className="display" style={{ fontSize: 22, marginTop: 4 }}>Challenges</h2></div>
        <button className="btn btn-pri adm-actionbtn" onClick={actions.openNewChallenge}>+ Nouveau</button>
      </div>
      {challenges.map((c, i) => (
        <div className={"chal " + c.c} key={i} style={{ minWidth: 0, marginTop: 12 }}>
          <span className="badge"><span className="dot" />{c.sub}</span>
          <h3>{c.t}</h3>
          <div className="meta">{c.reward.includes("vues") ? "Objectif collectif" : "Sprint individuel"}</div>
          <div className="bar"><i style={{ width: c.prog + "%" }} /></div>
          <div className="reward">{c.reward}</div>
        </div>
      ))}
      <div className="sec-h"><h2>Classement du challenge</h2></div>
      <div className="card">
        {[...clippersFull].sort((a, b) => b.vues7 - a.vues7).slice(0, 4).map((c, i) => (
          <div className="row" key={c.id}>
            <div className="thumb" style={{ width: 30, height: 30, fontSize: 12, background: i === 0 ? "var(--grad-coral)" : "var(--surf2)", color: i === 0 ? "#0a0610" : "var(--mut)" }}>{i + 1}</div>
            <div style={{ flex: 1 }}><div className="t" style={{ fontSize: 13 }}>{c.name}</div></div>
            <div className="vue mono" style={{ fontSize: 13 }}>{fmt(c.vues7)}</div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- ASSETS ---------- */
function AssetsScreen({ actions }: { actions: AdmActions }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
        <div><div className="eyebrow">Catalogue</div><h2 className="display" style={{ fontSize: 22, marginTop: 4 }}>Assets</h2></div>
        <button className="btn btn-pri adm-actionbtn" onClick={actions.openImport}>+ Importer</button>
      </div>
      <p style={{ color: "var(--mut)", fontSize: 12.5, margin: "4px 0 6px" }}>Le fichier vit sur R2 / Drive — l&apos;app garde la fiche et trace chaque téléchargement.</p>
      <div className="card" style={{ marginTop: 8 }}>{assets.map((a) => <PepiteRow a={a} key={a.id} />)}</div>
    </>
  );
}

/* ---------- ANTI-TRICHE ---------- */
function Fraud() {
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
      {alerts.map((a, i) => (
        <div className="alert" key={i}><div className="ic">{a.ic}</div><div><div className="at">{a.t}</div><div className="as">{a.s}</div></div></div>
      ))}
      <div className="sec-h"><h2>Règles actives</h2></div>
      <div className="card">
        {rules.map((r, i) => (
          <div className="row" key={i}><div><div className="t">{r[0]}</div><div className="s">{r[1]}</div></div><span className="pill p-paid end">ON</span></div>
        ))}
      </div>
    </>
  );
}

/* ---------- PAIEMENTS ---------- */
function Payments({ actions }: { actions: AdmActions }) {
  const due = [...clippersFull].filter((c) => c.gain > 0).sort((a, b) => b.gain - a.gain);
  return (
    <>
      <div className="eyebrow" style={{ marginTop: 14 }}>Versements</div>
      <h2 className="display" style={{ fontSize: 22, margin: "4px 0 4px" }}>Paiements</h2>
      <div className="card" style={{ background: "linear-gradient(150deg,rgba(53,230,161,.12),rgba(45,226,230,.04)),var(--surf)", borderColor: "rgba(53,230,161,.25)", marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "var(--mut)", fontWeight: 600 }}>Total à verser cette semaine</div>
        <div className="display" style={{ fontSize: 34, fontWeight: 700, margin: "4px 0" }}>{euro(aVerserTotal)}</div>
        <div style={{ fontSize: 12, color: "var(--mut)" }}>{due.length} clippers · seuil 50 €</div>
      </div>
      <div className="card">
        {due.map((c) => (
          <div className="row" key={c.id}>
            <div className="thumb" style={{ background: "var(--surf2)", color: "var(--mut)" }}>{initials(c.name)}</div>
            <div style={{ flex: 1 }}><div className="t">{c.name}</div><div className="s">{c.payout} · {fmt(c.vues7)} vues · 7 j</div></div>
            <div className="end" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="vue mono" style={{ color: "var(--mint)" }}>{euro(c.gain)}</div>
              <button className="btn btn-pri" style={{ width: "auto", padding: "8px 12px" }} onClick={() => actions.showToast(`${euro(c.gain)} versés à ${c.name}`)}>Payer</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default function Admin({ tab, actions, userName, clipperId }: {
  tab: string; actions: AdmActions; userName?: string | null; clipperId?: string | null;
}) {
  let screen: React.ReactNode;
  if (tab === "clippers") {
    const c = clipperId ? clippersFull.find((x) => x.id === clipperId) : null;
    screen = c ? <ClipperDetail c={c} actions={actions} /> : <Clippers actions={actions} />;
  } else if (tab === "campaigns") screen = <Campaigns actions={actions} />;
  else if (tab === "challenges") screen = <Challenges actions={actions} />;
  else if (tab === "assets") screen = <AssetsScreen actions={actions} />;
  else if (tab === "fraud") screen = <Fraud />;
  else if (tab === "pay") screen = <Payments actions={actions} />;
  else screen = <Dash actions={actions} />;

  return (
    <>
      <Hud name={userName || "Keyan"} sub="Admin · War Room" rank="⚡ 24 clippers actifs" />
      <div className="wrap">{screen}</div>
    </>
  );
}
