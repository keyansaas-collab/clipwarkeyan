import React from "react";
import { Hud } from "./ui";
import {
  campaigns, assets, challenges, campName, campGrad, initials,
  fmt, euro, MyClip,
} from "@/lib/data";

export type ClipActions = {
  go: (tab: string) => void;
  openCamp: (id: string) => void;
  openSubmit: () => void;
  openDownload: (name: string) => void;
};

function deltaClass(d: number) { return d > 0 ? "up" : d < 0 ? "down" : "flat"; }
function deltaText(d: number) { return (d > 0 ? "+" : "") + fmt(d); }

function ClipRow({ c }: { c: MyClip }) {
  return (
    <div className="row">
      <div className="thumb" style={{ background: "var(--surf2)", color: "var(--mut)" }}>{c.plat[0]}</div>
      <div><div className="t">{c.asset}</div><div className="s">{c.plat}</div></div>
      <div className="end">
        <div className="vue">{fmt(c.vues)}</div>
        <div className={"delta " + deltaClass(c.d7)}>{deltaText(c.d7)} · 7 j</div>
      </div>
    </div>
  );
}

function AssetCard({ a, onDownload }: { a: typeof assets[number]; onDownload: () => void }) {
  return (
    <div className="asset">
      <div className="cov" style={{ background: campGrad(a.camp) }}>
        <div className="play">▶</div><div className="dur">{a.dur}</div>
      </div>
      <div className="b">
        <div className="ti">{a.t}</div>
        <div className="mt">↓ {fmt(a.dl)} · {a.clips} clips</div>
        <button className="btn btn-pri" onClick={onDownload}>Télécharger</button>
      </div>
    </div>
  );
}

function Home({ clips, actions }: { clips: MyClip[]; actions: ClipActions }) {
  const vues7 = clips.reduce((s, c) => s + Math.max(0, c.d7), 0);
  const feu = [...clips].filter((c) => c.d7 > 0).sort((a, b) => b.d7 - a.d7).slice(0, 3);
  return (
    <>
      <div className="stats">
        <div className="stat"><div className="v gr mono">{fmt(Math.round(vues7 / 1000))}k</div><div className="l">vues · 7 j</div></div>
        <div className="stat"><div className="v mono">248 €</div><div className="l">gain du mois</div></div>
        <div className="stat"><div className="v mono">{clips.length}</div><div className="l">clips en suivi</div></div>
      </div>

      <div className="sec-h"><h2>Challenges en cours</h2><span className="more" onClick={() => actions.go("camp")}>Voir tout</span></div>
      <div className="rail">
        {challenges.map((c, i) => (
          <div className={"chal " + c.c} key={i}>
            <span className="badge"><span className="dot" />{c.sub}</span>
            <h3>{c.t}</h3>
            <div className="meta">{c.reward.includes("vues") ? "Objectif collectif" : "Sprint individuel"}</div>
            <div className="bar"><i style={{ width: c.prog + "%" }} /></div>
            <div className="reward">{c.reward}</div>
          </div>
        ))}
      </div>

      <div className="sec-h"><h2>Tes clips en feu</h2><span className="more" onClick={() => actions.go("clips")}>Mes clips</span></div>
      <div className="card">{feu.map((c) => <ClipRow c={c} key={c.id} />)}</div>

      <div className="sec-h"><h2>Reprendre où tu en étais</h2></div>
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 13 }}>
        <div className="thumb" style={{ background: campGrad("biz") }}>BP</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Le Business Paie</div>
          <div style={{ fontSize: 12, color: "var(--mut)" }}>21 assets · 1,5 € / 1000 vues</div>
        </div>
        <button className="btn btn-pri" style={{ width: "auto", padding: "9px 14px", marginLeft: "auto" }} onClick={() => actions.openCamp("biz")}>Ouvrir</button>
      </div>
    </>
  );
}

function Campaigns({ camp, actions }: { camp: string | null; actions: ClipActions }) {
  if (camp) {
    const c = campaigns.find((x) => x.id === camp)!;
    const list = assets.filter((a) => a.camp === camp);
    return (
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <button className="btn btn-gh" style={{ width: "auto", padding: "8px 12px" }} onClick={() => actions.go("camp")}>← Retour</button>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{c.name}</div>
            <div style={{ fontSize: 12, color: "var(--mut)" }}>{String(c.rate).replace(".", ",")} € / 1000 vues</div>
          </div>
        </div>
        <div className="grid">
          {list.map((a) => <AssetCard a={a} key={a.id} onDownload={() => actions.openDownload(a.t)} />)}
        </div>
      </>
    );
  }
  return (
    <>
      <div className="eyebrow" style={{ marginTop: 14 }}>Campagnes de Keyan</div>
      <h2 className="display" style={{ fontSize: 22, margin: "4px 0 4px" }}>Choisis ton terrain</h2>
      <p style={{ color: "var(--mut)", fontSize: 13, marginBottom: 6 }}>Chaque campagne = ses assets et son tarif aux vues.</p>
      {campaigns.map((c) => (
        <div className="card" key={c.id} style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }} onClick={() => actions.openCamp(c.id)}>
          <div className="thumb" style={{ width: 54, height: 54, background: c.grad }}>{initials(c.name)}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{c.name}</div>
            <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 2 }}>{c.desc}</div>
            <div style={{ marginTop: 7 }}>
              <span className={"tag " + c.tag}>{c.assets} assets</span>
              <span className={"tag " + c.tag}>{String(c.rate).replace(".", ",")} € / 1000 vues</span>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function MineRow({ c }: { c: MyClip }) {
  const pill = { track: ["p-track", "En suivi"], paid: ["p-paid", "Payé"], hold: ["p-hold", "Gelé"] }[c.st];
  return (
    <div className="row">
      <div className="thumb" style={{ background: "var(--surf2)", color: "var(--mut)" }}>{c.plat[0]}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="t" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.asset}</div>
        <div className="s">{c.plat} · <span className={deltaClass(c.d7)}>{deltaText(c.d7)} · 7 j</span></div>
      </div>
      <div className="end">
        <div className="vue">{fmt(c.vues)}</div>
        <span className={"pill " + pill[0]} style={{ marginTop: 4, display: "inline-block" }}>{pill[1]}</span>
      </div>
    </div>
  );
}

function Mine({ clips }: { clips: MyClip[] }) {
  return (
    <>
      <div className="eyebrow" style={{ marginTop: 14 }}>Suivi en direct</div>
      <h2 className="display" style={{ fontSize: 22, margin: "4px 0 12px" }}>Mes clips</h2>
      <div className="card">{clips.map((c) => <MineRow c={c} key={c.id} />)}</div>
    </>
  );
}

function Bilan({ clips }: { clips: MyClip[] }) {
  const net = clips.filter((c) => c.st !== "hold").reduce((s, c) => s + Math.max(0, c.d7), 0);
  const gain = (net / 1000) * 1.2;
  return (
    <>
      <div className="eyebrow" style={{ marginTop: 14 }}>Fenêtre 7 jours glissants</div>
      <h2 className="display" style={{ fontSize: 22, margin: "4px 0 12px" }}>Ton bilan</h2>
      <div className="card" style={{ background: "linear-gradient(150deg,rgba(53,230,161,.14),rgba(45,226,230,.05)),var(--surf)", borderColor: "rgba(53,230,161,.25)" }}>
        <div style={{ fontSize: 12, color: "var(--mut)", fontWeight: 600 }}>Gain estimé · vues nettes nouvelles</div>
        <div className="display" style={{ fontSize: 40, fontWeight: 700, margin: "6px 0", letterSpacing: "-1px" }}>{euro(gain)}</div>
        <div style={{ fontSize: 12.5, color: "var(--mut)" }}>{fmt(net)} vues nettes comptées cette fenêtre</div>
        <div className="meter"><i style={{ width: "72%", background: "var(--mint)" }} /></div>
        <div style={{ fontSize: 11.5, color: "var(--mut)", marginTop: 8 }}>Seuil de paiement : 50 € — atteint ✓</div>
      </div>
      <div className="sec-h"><h2>Comment c&apos;est calculé</h2></div>
      <div className="card" style={{ fontSize: 13, color: "var(--mut)", lineHeight: 1.7 }}>
        On relève les vues de chaque clip plusieurs fois par jour. On ne paie que les{" "}
        <b style={{ color: "var(--text)" }}>vues nettes nouvelles</b> de la fenêtre — pas le total. Un clip qui pète à J+15 paie ce jour-là. Un clip dont les vues chutent passe en <span className="pill p-hold">Gelé</span> le temps de vérifier.
      </div>
      <div className="sec-h"><h2>Derniers paiements</h2></div>
      <div className="card">
        {[["09 juin", "142 €"], ["02 juin", "98 €"], ["26 mai", "176 €"]].map((p, i) => (
          <div className="row" key={i}><div className="t">{p[0]}</div><div className="end vue" style={{ color: "var(--mint)" }}>{p[1]}</div></div>
        ))}
      </div>
    </>
  );
}

export default function Clipper({ tab, camp, clips, actions, userName }: {
  tab: string; camp: string | null; clips: MyClip[]; actions: ClipActions; userName?: string | null;
}) {
  let screen: React.ReactNode;
  if (tab === "camp") screen = <Campaigns camp={camp} actions={actions} />;
  else if (tab === "clips") screen = <Mine clips={clips} />;
  else if (tab === "bilan") screen = <Bilan clips={clips} />;
  else screen = <Home clips={clips} actions={actions} />;

  return (
    <>
      <Hud name={userName || "Clipper"} sub="Sergent · Niveau 7" rank="🔥 12 j de série" />
      <div className="wrap">{screen}</div>
    </>
  );
}
