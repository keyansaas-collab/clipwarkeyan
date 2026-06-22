"use client";

import React, { useEffect, useState } from "react";
import { Icon } from "./ui";
import Clipper, { ClipActions } from "./Clipper";
import Admin, { AdmActions } from "./Admin";
import Login from "./Login";
import Onboarding from "./Onboarding";
import SubmitSheet from "./SubmitSheet";
import { getSupabase } from "@/lib/supabase/client";
import { campaigns, platLabel, MyClip } from "@/lib/data";

type Role = "clip" | "adm";
type NavLink = { id: string; label: string; icon: string };
type Profile = { display_name: string | null; role: string; rank: string | null; onboarded?: boolean };

export default function AppShell() {
  // ── auth ──
  const [session, setSession] = useState<any>(undefined); // undefined = chargement
  const [profile, setProfile] = useState<Profile | null>(null);

  // ── app ──
  const [role, setRole] = useState<Role>("clip");
  const [tab, setTab] = useState("home");
  const [camp, setCamp] = useState<string | null>(null);
  const [admClipper, setAdmClipper] = useState<string | null>(null);
  const [clips, setClips] = useState<MyClip[]>([]);
  const [sheet, setSheet] = useState<React.ReactNode>(null);
  const [toast, setToast] = useState<string | null>(null);

  // récupère la session + écoute les changements (login / logout)
  useEffect(() => {
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  // charge le profil (rôle + onboarding) ; réutilisable après la fiche
  const loadProfile = React.useCallback(() => {
    if (!session) { setProfile(null); return; }
    getSupabase()
      .from("profiles")
      .select("display_name, role, rank, onboarded")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setProfile((data as Profile) ?? { display_name: null, role: "clipper", rank: null, onboarded: false }));
  }, [session]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const isStaff = profile?.role === "admin" || profile?.role === "owner";

  // l'espace par défaut suit le rôle réel
  useEffect(() => {
    if (!profile) return;
    setRole(isStaff ? "adm" : "clip");
    setTab(isStaff ? "dash" : "home");
    setCamp(null);
  }, [profile?.role]);

  // charge les vrais clips du clipper (+ vues depuis les snapshots du cron)
  const loadClips = React.useCallback(async () => {
    if (!session) { setClips([]); return; }
    const sb = getSupabase();
    const { data: rows } = await sb
      .from("clips")
      .select("id, platform, url, status, asset_id, assets(title)")
      .eq("clipper_id", session.user.id)
      .order("submitted_at", { ascending: false });
    const ids = (rows || []).map((r: any) => r.id);
    let snaps: any[] = [];
    if (ids.length) {
      const { data } = await sb
        .from("view_snapshots")
        .select("clip_id, views, captured_at")
        .in("clip_id", ids)
        .order("captured_at", { ascending: false });
      snaps = data || [];
    }
    const weekAgo = Date.now() - 7 * 864e5;
    const mapped: MyClip[] = (rows || []).map((r: any) => {
      const s = snaps.filter((x) => x.clip_id === r.id);
      const cur = s[0] ? s[0].views : 0;
      const base = s.find((x) => new Date(x.captured_at).getTime() <= weekAgo);
      const net = Math.max(0, cur - (base ? base.views : 0));
      const a = Array.isArray(r.assets) ? r.assets[0] : r.assets;
      return { id: r.id, asset: a?.title || "(contenu original)", plat: platLabel[r.platform] || r.platform, vues: cur, d7: net, st: (r.status === "rejected" ? "hold" : r.status) };
    });
    setClips(mapped);
  }, [session]);

  useEffect(() => { loadClips(); }, [loadClips]);

  function showToast(msg: string) { setToast(msg); window.setTimeout(() => setToast(null), 2400); }
  function go(t: string) { setTab(t); setCamp(null); setAdmClipper(null); window.scrollTo(0, 0); }
  function openCamp(id: string) { setTab("camp"); setCamp(id); window.scrollTo(0, 0); }
  function previewRole(r: Role) { setRole(r); setTab(r === "adm" ? "dash" : "home"); setCamp(null); window.scrollTo(0, 0); }
  async function logout() { await getSupabase().auth.signOut(); }
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
    if (!session) return;
    setSheet(<SubmitSheet clipperId={session.user.id} onDone={() => { closeSheet(); showToast("Clip soumis · suivi lancé"); loadClips(); go("clips"); }} />);
  }
  function openClipper(id: string) { setTab("clippers"); setAdmClipper(id); window.scrollTo(0, 0); }
  function openNewChallenge() {
    setSheet(
      <>
        <h3>Nouveau challenge</h3>
        <p style={{ color: "var(--mut)", fontSize: 13 }}>Une surcouche temporaire posée sur une campagne.</p>
        <div className="field"><label>Nom</label><input placeholder="Ex. Sprint Lifestyle 48h" /></div>
        <div className="field"><label>Campagne</label><select>{campaigns.map((c) => <option key={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label>Type</label><select><option>Sprint individuel</option><option>Objectif collectif</option></select></div>
        <div className="field"><label>Durée</label><select><option>24 h</option><option>48 h</option><option>7 jours</option></select></div>
        <div className="field"><label>Cagnotte / objectif</label><input placeholder="Ex. 400 € ou 1 000 000 vues" /></div>
        <button className="btn btn-pri" style={{ marginTop: 18, padding: 14 }} onClick={() => { closeSheet(); showToast("Challenge créé"); }}>Créer le challenge</button>
      </>
    );
  }
  function openNewCampaign() {
    setSheet(
      <>
        <h3>Nouvelle campagne</h3>
        <p style={{ color: "var(--mut)", fontSize: 13 }}>Un axe de contenu permanent (lifestyle, coaching…).</p>
        <div className="field"><label>Nom</label><input placeholder="Ex. Lifestyle" /></div>
        <div className="field"><label>Description</label><input placeholder="Quotidien, voyages…" /></div>
        <div className="field"><label>Tarif (€ / 1000 vues)</label><input placeholder="Ex. 1,2" /></div>
        <button className="btn btn-pri" style={{ marginTop: 18, padding: 14 }} onClick={() => { closeSheet(); showToast("Campagne créée"); }}>Créer la campagne</button>
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

  // ── gating auth ──
  if (session === undefined) {
    return (
      <div className="shell">
        <div className="auth-wrap">
          <img className="logo-img big" src="/clipwar-logo.png" alt="ClipWar" style={{ margin: "0 auto" }} />
          <div className="auth-sub" style={{ marginTop: 12 }}>Chargement…</div>
        </div>
      </div>
    );
  }
  if (!session) return <Login />;

  if (!profile) {
    return (
      <div className="shell">
        <div className="auth-wrap">
          <img className="logo-img big" src="/clipwar-logo.png" alt="ClipWar" style={{ margin: "0 auto" }} />
          <div className="auth-sub" style={{ marginTop: 12 }}>Chargement…</div>
        </div>
      </div>
    );
  }
  if (!profile.onboarded && !isStaff) {
    return <Onboarding userId={session.user.id} email={session.user.email ?? ""} initialName={profile.display_name} onDone={loadProfile} />;
  }

  // ── app connectée ──
  const clipActions: ClipActions = { go, openCamp, openSubmit, openDownload };
  const admActions: AdmActions = { go, openImport, openClipper, openNewChallenge, openNewCampaign, showToast };
  const adm = role === "adm";

  const navLinks: NavLink[] = adm
    ? [
        { id: "dash", label: "Dashboard", icon: "home" },
        { id: "clippers", label: "Clippers", icon: "user" },
        { id: "clips", label: "Clips", icon: "clip" },
        { id: "campaigns", label: "Campagnes", icon: "folder" },
        { id: "challenges", label: "Challenges", icon: "trophy" },
        { id: "assets", label: "Assets", icon: "grid" },
        { id: "fraud", label: "Anti-triche", icon: "alert" },
        { id: "pay", label: "Paiements", icon: "wallet" },
      ]
    : [{ id: "home", label: "Accueil", icon: "home" }, { id: "camp", label: "Campagnes", icon: "grid" }, { id: "clips", label: "Mes clips", icon: "clip" }, { id: "bilan", label: "Bilan", icon: "chart" }];
  const mobileLinks: NavLink[] = adm ? [navLinks[0], navLinks[1], navLinks[2], navLinks[7]] : navLinks;
  const fabLabel = adm ? "Importer un asset" : "Soumettre un clip";
  const fabAction = adm ? openImport : openSubmit;

  // sélecteur d'aperçu : visible uniquement pour le staff
  const PreviewSwitch = () => (
    <div className="role">
      <button className={role === "clip" ? "on" : ""} onClick={() => previewRole("clip")}>Vue clipper</button>
      <button className={role === "adm" ? "on adm" : ""} onClick={() => previewRole("adm")}>Vue admin</button>
    </div>
  );

  return (
    <div className="shell">
      {/* ── barre latérale (desktop) ── */}
      <aside className="side">
        <img className="logo-img" src="/clipwar-logo.png" alt="ClipWar" style={{ marginBottom: 10 }} />
        {isStaff && <PreviewSwitch />}
        <button className="btn btn-pri side-action" onClick={fabAction}>+ {fabLabel}</button>
        <nav className="side-nav">
          {navLinks.map((it) => (
            <a key={it.id} className={"side-link " + (tab === it.id ? "on " + (adm ? "adm" : "") : "")} onClick={() => go(it.id)}>
              <Icon name={it.icon} /><span>{it.label}</span>
            </a>
          ))}
        </nav>
        <div className="side-foot">
          <div className="side-user">{profile?.display_name || session.user.email}</div>
          <button className="logout" onClick={logout}>Se déconnecter</button>
        </div>
      </aside>

      {/* ── contenu ── */}
      <div className="main">
        <div className="mobtop mobile-only">
          {isStaff ? <PreviewSwitch /> : <div style={{ flex: 1, fontSize: 12, color: "var(--mut)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.display_name || session.user.email}</div>}
          <button className="logout" onClick={logout}>Quitter</button>
        </div>
        {role === "clip"
          ? <Clipper tab={tab} camp={camp} clips={clips} actions={clipActions} userName={profile.display_name || session.user.email} />
          : <Admin tab={tab} actions={admActions} userName={profile.display_name || session.user.email} clipperId={admClipper} />}
      </div>

      {/* ── nav du bas (mobile) ── */}
      <div className="nav mobile-only">
        {mobileLinks.map((it, i) => (
          <React.Fragment key={it.id}>
            {i === 2 && (
              <div className="mid">
                <div className={"fab " + (adm ? "adm" : "")} onClick={fabAction}><Icon name="plus" /></div>
              </div>
            )}
            <a className={tab === it.id ? "on " + (adm ? "adm" : "") : ""} onClick={() => go(it.id)}>
              <Icon name={it.icon} /><span>{it.label}</span>
            </a>
          </React.Fragment>
        ))}
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
