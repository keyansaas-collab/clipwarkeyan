"use client";

import React, { useEffect, useState } from "react";
import { Icon } from "./ui";
import { fmt } from "@/lib/data";
import { getSupabase } from "@/lib/supabase/client";

type LB = { name: string; vues: number };

export default function Landing() {
  const [authed, setAuthed] = useState(false);
  const [vues, setVues] = useState(6742300);
  const [clips, setClips] = useState(128);
  const [euros, setEuros] = useState(9480);
  const [board, setBoard] = useState<LB[]>([
    { name: "Theo R.", vues: 1240000 },
    { name: "Léa M.", vues: 312000 },
    { name: "Sofia B.", vues: 288000 },
    { name: "Nael K.", vues: 164000 },
  ]);

  useEffect(() => {
    getSupabase().auth.getSession().then(({ data }) => setAuthed(!!data.session));
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion:reduce)").matches) return;
    const id = setInterval(() => {
      setVues((v) => v + Math.floor(Math.random() * 900) + 100);
      setEuros((e) => e + (Math.random() > 0.6 ? 1 : 0));
      setClips((c) => Math.max(120, c + (Math.random() > 0.85 ? (Math.random() > 0.5 ? 1 : -1) : 0)));
      setBoard((b) => [...b.map((x) => ({ ...x, vues: x.vues + Math.floor(Math.random() * 2500) }))].sort((a, z) => z.vues - a.vues));
    }, 1500);
    return () => clearInterval(id);
  }, []);

  const max = Math.max(...board.map((b) => b.vues));
  const cta = authed ? "Entrer dans la War Room" : "Rejoindre la War Room";

  const steps = [
    ["01", "Prends un asset", "Les clippers piochent dans tes vidéos sources, directement dans l'app. Chaque téléchargement est tracé."],
    ["02", "Poste & soumets", "Ils montent, postent sur TikTok, Instagram ou YouTube, puis collent le lien. Le suivi des vues démarre tout seul."],
    ["03", "Sois payé aux vues", "Paiement sur les vues nettes réelles, en fenêtre 7 jours glissants. Une vidéo qui explose à J+15 paie ce jour-là."],
  ];
  const feats = [
    ["chart", "Vues réelles, multi-plateformes", "YouTube en API officielle, TikTok et Instagram relevés automatiquement. Pas d'estimation : du vrai."],
    ["alert", "Anti-triche intégré", "Gel automatique des paiements si les vues chutent, détection des doublons, contrôle que le clip existe toujours."],
    ["user", "Challenges, rangs & streaks", "Des sprints à cagnotte, un classement qui grimpe, des grades. De quoi faire revenir tes clippers."],
    ["clip", "Pilotage centralisé", "Tes campagnes, tes assets, tes pépites (ratio vues/téléchargement), tes versements — tout dans une seule War Room."],
  ];

  return (
    <div className="lp">
      <nav className="lp-nav">
        <img className="logo-img" src="/clipwar-logo.png" alt="ClipWar" />
        <a className="lp-btn ghost sm" href="/app">{authed ? "Ouvrir l'app" : "Se connecter"}</a>
      </nav>

      <header className="lp-hero">
        <img className="lp-herologo" src="/clipwar-logo.png" alt="ClipWar" />
        <div className="lp-eyebrow"><span className="dot" /> La plateforme des armées de clippers</div>
        <h1 className="lp-h1">L'armée de clippers qui fait <span className="g">exploser tes vues</span>.</h1>
        <p className="lp-lead">
          ClipWar arme tes clippers : ils prennent tes assets, postent partout, et sont payés aux vues réelles.
          Toi, tu pilotes la War Room.
        </p>
        <div className="lp-actions">
          <a className="lp-btn pri" href="/app">{cta}</a>
          <a className="lp-btn ghost" href="#how">Comment ça marche</a>
        </div>
      </header>

      <section className="lp-live">
        <div className="lp-live-top">
          <div className="ttl"><span className="dot" /> En direct dans la War Room</div>
          <span className="pill p-track">lecture seule</span>
        </div>
        <div className="lp-kpis">
          <div className="lp-kpi"><div className="v gr">{fmt(vues)}</div><div className="l">vues générées · 7 j</div></div>
          <div className="lp-kpi"><div className="v">{clips}</div><div className="l">clips en suivi</div></div>
          <div className="lp-kpi"><div className="v">{fmt(euros)} €</div><div className="l">distribués cette semaine</div></div>
        </div>
        <div className="card" style={{ background: "var(--bg2)" }}>
          {board.map((b, i) => (
            <div className="row" key={b.name}>
              <div className="thumb" style={{ width: 30, height: 30, fontSize: 12, background: i === 0 ? "var(--grad-coral)" : "var(--surf2)", color: i === 0 ? "#0a0610" : "var(--mut)" }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div className="t" style={{ fontSize: 13 }}>{b.name}</div>
                <div className="bar" style={{ marginTop: 6, background: "rgba(0,0,0,.3)" }}><i style={{ width: (b.vues / max) * 100 + "%" }} /></div>
              </div>
              <div className="vue mono" style={{ fontSize: 13 }}>{fmt(b.vues)}</div>
            </div>
          ))}
        </div>
        <div className="lp-lock"><Icon name="alert" /> Connecte-toi pour soumettre un clip et suivre tes gains.</div>
      </section>

      <section className="lp-section" id="how">
        <h2>Comment ça marche</h2>
        <p className="sub">Trois étapes, de l'asset au paiement.</p>
        <div className="lp-steps">
          {steps.map((s) => (
            <div className="lp-step" key={s[0]}>
              <div className="n">{s[0]}</div>
              <h3>{s[1]}</h3>
              <p>{s[2]}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <h2>Pensé pour le clipping à grande échelle</h2>
        <p className="sub">Tout ce qu'il faut pour que « vues = argent » tienne sans faille.</p>
        <div className="lp-feats">
          {feats.map((f) => (
            <div className="lp-feat" key={f[1]}>
              <div className="fi"><Icon name={f[0]} /></div>
              <div><h3>{f[1]}</h3><p>{f[2]}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-foot">
        <h2>Prête à lancer ta War Room ?</h2>
        <p>Crée ton compte en 10 secondes — lien magique ou Google. Tes clippers te rejoignent juste après.</p>
        <a className="lp-btn pri" href="/app">{cta}</a>
      </section>

      <div className="lp-copy">ClipWar · War Room — © 2026</div>
    </div>
  );
}
