"use client";

import React, { useEffect, useState } from "react";
import { Icon } from "./ui";
import Clipper, { ClipActions } from "./Clipper";
import Admin, { AdmActions } from "./Admin";
import { assets, campaigns, initialClips, MyClip } from "@/lib/data";

type Role = "clip" | "adm";

export default function AppShell() {
  const [role, setRole] = useState<Role>("clip");
  const [tab, setTab] = useState("home");
  const [camp, setCamp] = useState<string | null>(null);
  const [clips, setClips] = useState<MyClip[]>(initialClips);
  const [sheet, setSheet] = useState<React.ReactNode>(null);
  const [toast, setToast] = useState<string | null>(null);

  // compteurs de vues "en direct" (War Room)
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion:reduce)").matches) return;
    const id = setInterval(() => {
      setClips((prev) => prev.map((c) =>
        c.st === "track" && c.d7 >= 0 && Math.random() > 0.45
          ? { ...c, vues: c.vues + Math.floor(Math.random() * 120) }
          : c
      ));
    }, 2200);
    return () => clearInterval(id);
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  }
  function go(t: string) { setTab(t); setCamp(null); window.scrollTo(0, 0); }
  function openCamp(id: string) { setTab("camp"); setCamp(id); window.scrollTo(0, 0); }
  function switchRole(r: Role) { setRole(r); setTab(r === "adm" ? "dash" : "home"); setCamp(null); window.scrollTo(0, 0); }
  const closeSheet = () => setSheet(null);

  function openDownload(name: string) {
    setSheet(
      <>
        <h3>Télécharger l&apos;asset</h3>
        <p style={{ color: "var(--mut)", fontSize: 13, marginBottom: 6 }}>{name}</p>
        <div className="prefill">↓ Le téléchargement est tracé — il pré-remplira ta soumission.</div>
        <button className="btn btn-pri" style={{ marginTop: 16, padding: 13 }} onClick={() => { closeSheet(); showToast("Asset téléchargé · prêt à clipper"); }}>Lancer le téléchargement</button>
        <button className="btn btn-gh" style={{ marginTop: 9, padding: 12 }} onClick={closeSheet}>Annuler</button>
      </>
    );
  }
  function openSubmit() {
    setSheet(
      <>
        <h3>Soumettre un clip</h3>
        <p style={{ color: "var(--mut)", fontSize: 13 }}>On suit ses vues automatiquement dès l&apos;ajout.</p>
        <div className="field"><label>Lien du clip</label><input placeholder="https://tiktok.com/@..." /></div>
        <div className="field"><label>Plateforme</label><select><option>TikTok</option><option>Instagram</option><option>YouTube</option></select></div>
        <div className="field">
          <label>Asset utilisé</label>
          <select>
            <option>Pourquoi 99% échouent</option>
            {assets.map((a) => <option key={a.id}>{a.t}</option>)}
            <option>Aucun / contenu original</option>
          </select>
          <div className="prefill">✓ Pré-rempli avec ton dernier téléchargement — change si besoin.</div>
        </div>
        <button className="btn btn-pri" style={{ marginTop: 18, padding: 14 }} onClick={addClip}>Soumettre le clip</button>
      </>
    );
  }
  function openImport() {
    setSheet(
      <>
        <h3>Importer un asset</h3>
        <p style={{ color: "var(--mut)", fontSize: 13 }}>Le fichier va sur R2 (egress gratuit) ou reste pointé sur le Drive. Jamais dans GitHub.</p>
        <div className="field"><label>Titre</label><input placeholder="Ex. Routine du matin" /></div>
        <div className="field"><label>Campagne</label><select>{campaigns.map((c) => <option key={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label>Source</label><select><option>Lien Google Drive (catalogue)</option><option>Upload vers Cloudflare R2</option></select></div>
        <button className="btn btn-pri" style={{ marginTop: 18, padding: 14 }} onClick={() => { closeSheet(); showToast("Asset ajouté au catalogue"); }}>Ajouter au catalogue</button>
      </>
    );
  }
  function addClip() {
    setClips((prev) => [{ id: "n" + Date.now(), asset: "Pourquoi 99% échouent", plat: "TikTok", vues: 0, d7: 0, st: "track" }, ...prev]);
    closeSheet(); showToast("Clip ajouté · suivi des vues lancé"); go("clips");
  }

  const clipActions: ClipActions = { go, openCamp, openSubmit, openDownload };
  const admActions: AdmActions = { go, openImport };

  const navItems = role === "adm"
    ? [["dash", "Dashboard", "home"], ["assets", "Assets", "grid"], ["__fab", "", "plus"], ["clippers", "Clippers", "user"], ["fraud", "Anti-triche", "alert"]]
    : [["home", "Accueil", "home"], ["camp", "Campagnes", "grid"], ["__fab", "", "plus"], ["clips", "Mes clips", "clip"], ["bilan", "Bilan", "chart"]];
  const adm = role === "adm";

  return (
    <div className="shell">
      <div className="role">
        <button className={role === "clip" ? "on" : ""} onClick={() => switchRole("clip")}>Clipper</button>
        <button className={role === "adm" ? "on adm" : ""} onClick={() => switchRole("adm")}>Keyan · Admin</button>
      </div>

      {role === "clip"
        ? <Clipper tab={tab} camp={camp} clips={clips} actions={clipActions} />
        : <Admin tab={tab} actions={admActions} />}

      <div className="nav">
        {navItems.map((it) => {
          if (it[0] === "__fab") {
            return (
              <div className="nav mid" key="fab" style={{ background: "none", border: "none", position: "static" }}>
                <div className={"fab " + (adm ? "adm" : "")} onClick={adm ? openImport : openSubmit}><Icon name="plus" /></div>
              </div>
            );
          }
          const on = tab === it[0] ? "on " + (adm ? "adm" : "") : "";
          return (
            <a className={on} key={it[0]} onClick={() => go(it[0])}>
              <Icon name={it[2]} /><span>{it[1]}</span>
            </a>
          );
        })}
      </div>

      {sheet && (
        <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) closeSheet(); }}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grab" />
            {sheet}
          </div>
        </div>
      )}

      {toast && <div className="toast"><span className="ck">✓</span>{toast}</div>}
    </div>
  );
}
