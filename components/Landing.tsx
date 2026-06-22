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
  const cta = authed ? "Entrer dans la War Room" : "Rejoindre l'armée";

  const steps = [
    ["01", "Pioche un contenu", "Tu choisis une vidéo source dans l'app et tu la télécharges. Plusieurs angles, plusieurs montages — fais-toi plaisir."],
    ["02", "Poste & colle ton lien", "Tu montes, tu postes sur TikTok, Insta ou YouTube, puis tu colles le lien. Le suivi de tes vues démarre tout seul."],
    ["03", "Encaisse aux vues", "Tu es payé à tes vues nettes réelles, en fenêtre 7 jours glissants. Une vidéo qui explose à J+15 ? Elle te paie ce jour-là."],
  ];
  const feats = [
    ["chart", "Payé à tes vraies vues", "On relève tes vues réelles sur TikTok, Insta et YouTube. Pas d'estimation au doigt mouillé : ce que tu fais, tu le touches."],
    ["alert", "Zéro arnaque", "Comptage transparent, paiement garanti tant que les vues tiennent. Personne ne gonfle ni ne rogne tes gains."],
    ["user", "Monte en grade", "Grimpe au classement, débloque des rangs, enchaîne les séries. Les meilleurs clippers, ça se voit."],
    ["clip", "Challenges & cagnottes", "Des sprints à prix, des objectifs collectifs. De quoi encaisser plus quand tu envoies fort."],
  ];

  return (
    <div className="lp">
      <nav className="lp-nav">
        <img className="logo-img" src="/clipwar-logo.png" alt="ClipWar" />
        <a className="lp-btn ghost sm" href="/app">{authed ? "Ouvrir l'app" : "Se connecter"}</a>
      </nav>

      <header className="lp-hero">
        <img className="lp-herologo" src="/clipwar-logo.png" alt="ClipWar" />
        <div className="lp-eyebrow"><span className="dot" /> Rejoins l&apos;armée de clippers</div>
        <h1 className="lp-h1">Clippe, poste, <span className="g">encaisse</span>.</h1>
        <p className="lp-lead">
          Pioche dans les contenus, poste sur TikTok, Insta et YouTube, et sois payé à tes vues réelles —
          sans arnaque. Plus tu fais de vues, plus tu montes.
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
        <p className="sub">Trois étapes, du contenu au paiement.</p>
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
        <h2>Pourquoi clipper avec ClipWar</h2>
        <p className="sub">Tes vues comptent vraiment — et tu es payé pour.</p>
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
        <h2>Prêt à transformer tes vues en cash ?</h2>
        <p>Crée ton compte en 10 secondes — lien magique ou Google. Pioche ton premier contenu juste après.</p>
        <a className="lp-btn pri" href="/app">{cta}</a>
      </section>

      <div className="lp-org">Tu gères une équipe de clippers ? Le mode organisation arrive bientôt.</div>
      <div className="lp-copy">ClipWar · War Room — © 2026</div>
    </div>
  );
}
