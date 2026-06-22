import React from "react";
import { Hud } from "./ui";
import {
  campaigns, assets, challenges, clippers, alerts,
  campName, campGrad, initials, fmt, euro, Asset,
} from "@/lib/data";

export type AdmActions = {
  go: (tab: string) => void;
  openImport: () => void;
};

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

function Dash({ actions }: { actions: AdmActions }) {
  const pepites = [...assets].sort((a, b) => b.vues / b.dl - a.vues / a.dl).slice(0, 3);
  return (
    <>
      <div className="stats">
        <div className="stat"><div className="v gr mono">6,7M</div><div className="l">vues · 7 j</div></div>
        <div className="stat"><div className="v mono">1 493 €</div><div className="l">à verser</div></div>
        <div className="stat"><div className="v mono">24</div><div className="l">clippers actifs</div></div>
      </div>

      <div className="sec-h"><h2>Alertes anti-triche</h2><span className="more" onClick={() => actions.go("fraud")}>Tout voir</span></div>
      {alerts.slice(0, 1).map((a, i) => (
        <div className="alert" key={i}><div className="ic">{a.ic}</div><div><div className="at">{a.t}</div><div className="as">{a.s}</div></div></div>
      ))}

      <div className="sec-h"><h2>Tes pépites</h2><span className="more" onClick={() => actions.go("assets")}>Tous les assets</span></div>
      <div className="card">{pepites.map((a) => <PepiteRow a={a} key={a.id} />)}</div>

      <div className="sec-h"><h2>Campagnes</h2></div>
      {campaigns.map((c) => (
        <div className="card" key={c.id} style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 13 }}>
          <div className="thumb" style={{ background: c.grad }}>{initials(c.name)}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
            <div className="s">{c.assets} assets · {String(c.rate).replace(".", ",")} € / 1000 vues</div>
          </div>
        </div>
      ))}
    </>
  );
}

function Assets({ actions }: { actions: AdmActions }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
        <div><div className="eyebrow">Catalogue</div><h2 className="display" style={{ fontSize: 22, marginTop: 4 }}>Assets</h2></div>
        <button className="btn btn-pri" style={{ width: "auto", padding: "10px 14px" }} onClick={actions.openImport}>+ Importer</button>
      </div>
      <p style={{ color: "var(--mut)", fontSize: 12.5, margin: "4px 0 6px" }}>Le fichier vit sur R2 / Drive — l&apos;app garde la fiche et trace chaque téléchargement.</p>
      <div className="card" style={{ marginTop: 8 }}>{assets.map((a) => <PepiteRow a={a} key={a.id} />)}</div>
    </>
  );
}

function Clippers() {
  const sorted = [...clippers].sort((a, b) => b.vues - a.vues);
  return (
    <>
      <div className="eyebrow" style={{ marginTop: 14 }}>Classement</div>
      <h2 className="display" style={{ fontSize: 22, margin: "4px 0 12px" }}>Clippers</h2>
      <div className="card">
        {sorted.map((c, i) => (
          <div className="row" key={c.n}>
            <div className="thumb" style={{ background: i === 0 ? "var(--grad-coral)" : "var(--surf2)", color: i === 0 ? "#0a0610" : "var(--mut)" }}>{i + 1}</div>
            <div style={{ flex: 1 }}><div className="t">{c.n}</div><div className="s">{c.rk} · {c.clips} clips</div></div>
            <div className="end"><div className="vue mono">{fmt(c.vues)}</div><div className="delta up">{euro(c.gain)} à verser</div></div>
          </div>
        ))}
      </div>
    </>
  );
}

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
          <div className="row" key={i}>
            <div><div className="t">{r[0]}</div><div className="s">{r[1]}</div></div>
            <span className="pill p-paid end">ON</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default function Admin({ tab, actions, userName }: { tab: string; actions: AdmActions; userName?: string | null }) {
  let screen: React.ReactNode;
  if (tab === "assets") screen = <Assets actions={actions} />;
  else if (tab === "clippers") screen = <Clippers />;
  else if (tab === "fraud") screen = <Fraud />;
  else screen = <Dash actions={actions} />;

  return (
    <>
      <Hud name={userName || "Keyan"} sub="Admin · War Room" rank="⚡ 24 clippers actifs" />
      <div className="wrap">{screen}</div>
    </>
  );
}
