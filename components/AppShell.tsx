"use client";

import React, { useEffect, useState } from "react";
import { Icon } from "./ui";
import Clipper, { ClipActions } from "./Clipper";
import Admin, { AdmActions } from "./Admin";
import Login from "./Login";
import Onboarding from "./Onboarding";
import SubmitSheet, { SubmitPrefill } from "./SubmitSheet";
import { getSupabase } from "@/lib/supabase/client";
import { platLabel, MyClip } from "@/lib/data";
import { useCatalog, AssetReal } from "@/lib/catalog";

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
  const [payClipper, setPayClipper] = useState<string | null>(null);
  const [clipDetail, setClipDetail] = useState<string | null>(null);
  const [clips, setClips] = useState<MyClip[]>([]);
  const [sheet, setSheet] = useState<React.ReactNode>(null);
  const [toast, setToast] = useState<string | null>(null);

  // ── catalogue RÉEL (campagnes + assets), partagé clipper + admin ──
  const catalog = useCatalog(!!session);

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
      .select("id, platform, url, status, asset_id, submitted_at, assets(title)")
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
      const ago = r.submitted_at ? Math.floor((Date.now() - new Date(r.submitted_at).getTime()) / 864e5) : 0;
      return { id: r.id, asset: a?.title || "(contenu original)", plat: platLabel[r.platform] || r.platform, vues: cur, d7: net, st: (r.status === "rejected" ? "hold" : r.status), url: r.url, ago };
    });
    setClips(mapped);
  }, [session]);

  useEffect(() => { loadClips(); }, [loadClips]);

  function showToast(msg: string) { setToast(msg); window.setTimeout(() => setToast(null), 2400); }
  function go(t: string) { setTab(t); setCamp(null); setAdmClipper(null); setPayClipper(null); setClipDetail(null); window.scrollTo(0, 0); }
  function openCamp(id: string) { setTab("camp"); setCamp(id); window.scrollTo(0, 0); }
  function openClip(id: string) { setTab("clips"); setClipDetail(id); window.scrollTo(0, 0); }
  function previewRole(r: Role) { setRole(r); setTab(r === "adm" ? "dash" : "home"); setCamp(null); window.scrollTo(0, 0); }
  async function logout() { await getSupabase().auth.signOut(); }
  const closeSheet = () => setSheet(null);

  // Téléchargement TRACÉ : on écrit l'événement (asset, clipper, date),
  // on ouvre le fichier source, puis on propose la soumission pré-remplie.
  async function trackDownload(asset: AssetReal) {
    if (!session) return;
    await getSupabase().from("asset_downloads").insert({ asset_id: asset.id, clipper_id: session.user.id });
    if (asset.storage_url) window.open(asset.storage_url, "_blank", "noopener,noreferrer");
    catalog.reload(); // le compteur ↓ se met à jour
  }
  function openDownload(asset: AssetReal) {
    if (!session) return;
    setSheet(
      <>
        <h3>Télécharger l&apos;asset</h3>
        <p style={{ color: "var(--mut)", fontSize: 13, marginBottom: 6 }}>{asset.title}</p>
        <div className="prefill">↓ Le téléchargement est tracé — il pré-remplit ta soumission et alimente les stats par asset.</div>
        <button
          className="btn btn-pri"
          style={{ marginTop: 16, padding: 13 }}
          onClick={async () => {
            await trackDownload(asset);
            closeSheet();
            showToast("Asset téléchargé · prêt à clipper");
            openSubmit({ assetId: asset.id, campaignId: asset.campaign_id });
          }}
        >
          {asset.storage_url ? "Télécharger & soumettre mon clip" : "Marquer téléchargé & soumettre"}
        </button>
        <button className="btn btn-gh" style={{ marginTop: 9, padding: 12 }} onClick={closeSheet}>Annuler</button>
      </>
    );
  }
  function openSubmit(prefill?: SubmitPrefill) {
    if (!session) return;
    setSheet(
      <SubmitSheet
        clipperId={session.user.id}
        campaigns={catalog.campaigns}
        assets={catalog.assets}
        prefill={prefill ?? null}
        onDone={() => { closeSheet(); showToast("Clip soumis · suivi lancé"); loadClips(); catalog.reload(); go("clips"); }}
      />
    );
  }
  function openClipper(id: string) { setTab("clippers"); setAdmClipper(id); window.scrollTo(0, 0); }
  function openPayVerify(id: string) { setPayClipper(id); window.scrollTo(0, 0); }
  function openNewChallenge() {
    // NOTE : la création de challenge reste maquette — tranche 4 (challenges réels).
    setSheet(
      <>
        <h3>Nouveau challenge</h3>
        <p style={{ color: "var(--mut)", fontSize: 13 }}>Une surcouche temporaire posée sur une campagne. <i>(Branchement réel : tranche 4.)</i></p>
        <div className="field"><label>Nom</label><input placeholder="Ex. Sprint Lifestyle 48h" /></div>
        <div className="field"><label>Campagne</label><select>{catalog.campaigns.map((c) => <option key={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label>Type</label><select><option>Sprint individuel</option><option>Objectif collectif</option></select></div>
        <div className="field"><label>Durée</label><select><option>24 h</option><option>48 h</option><option>7 jours</option></select></div>
        <div className="field"><label>Cagnotte / objectif</label><input placeholder="Ex. 400 € ou 1 000 000 vues" /></div>
        <button className="btn btn-pri" style={{ marginTop: 18, padding: 14 }} onClick={() => { closeSheet(); showToast("Challenge créé"); }}>Créer le challenge</button>
      </>
    );
  }
  function openNewCampaign() {
    setSheet(<NewCampaignForm onCancel={closeSheet} onCreated={() => { closeSheet(); showToast("Campagne créée"); catalog.reload(); }} />);
  }
  function openImport() {
    setSheet(<ImportAssetForm campaigns={catalog.campaigns} onCancel={closeSheet} onCreated={() => { closeSheet(); showToast("Asset ajouté au catalogue"); catalog.reload(); }} />);
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
  const clipActions: ClipActions = { go, openCamp, openSubmit, openDownload, openClip, showToast };
  const admActions: AdmActions = { go, openImport, openClipper, openNewChallenge, openNewCampaign, openPayVerify, showToast };
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
    : [
        { id: "home", label: "Accueil", icon: "home" },
        { id: "camp", label: "Campagnes", icon: "folder" },
        { id: "clips", label: "Mes clips", icon: "clip" },
        { id: "bilan", label: "Bilan", icon: "chart" },
        { id: "classement", label: "Classement", icon: "trophy" },
        { id: "profil", label: "Profil", icon: "user" },
      ];
  const mobileLinks: NavLink[] = adm ? [navLinks[0], navLinks[1], navLinks[2], navLinks[7]] : navLinks.slice(0, 4);
  const fabLabel = adm ? "Importer un asset" : "Soumettre un clip";
  const fabAction = adm ? () => openImport() : () => openSubmit();

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
          ? <Clipper tab={tab} camp={camp} clipDetail={clipDetail} clips={clips} catalog={catalog} userName={profile.display_name || session.user.email} userEmail={session.user.email} userId={session.user.id} reloadProfile={loadProfile} actions={clipActions} />
          : <Admin tab={tab} actions={admActions} catalog={catalog} userName={profile.display_name || session.user.email} clipperId={admClipper} payClipper={payClipper} />}
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

/* ─────────── Formulaire : nouvelle campagne (écriture réelle) ─────────── */
const GRADS = [
  "linear-gradient(135deg,#2DE2E6,#8B6CFF)",
  "linear-gradient(135deg,#8B6CFF,#AB8DFF)",
  "linear-gradient(135deg,#FF6A45,#FFB23E)",
  "linear-gradient(135deg,#35E6A1,#2DE2E6)",
  "linear-gradient(135deg,#FF5C8A,#FF6A45)",
];

function NewCampaignForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [rate, setRate] = useState("1,2");
  const [accent, setAccent] = useState(GRADS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) { setErr("Donne un nom à la campagne."); return; }
    const rateNum = parseFloat(rate.replace(",", "."));
    if (!isFinite(rateNum) || rateNum <= 0) { setErr("Tarif invalide (ex. 1,2)."); return; }
    setBusy(true); setErr(null);
    const { error } = await getSupabase().from("campaigns").insert({
      name: name.trim(), description: desc.trim() || null, rate_per_1000: rateNum, accent,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onCreated();
  }

  return (
    <>
      <h3>Nouvelle campagne</h3>
      <p style={{ color: "var(--mut)", fontSize: 13 }}>Un axe de contenu permanent (lifestyle, coaching…).</p>
      <div className="field"><label>Nom</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Lifestyle" /></div>
      <div className="field"><label>Description</label><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Quotidien, voyages…" /></div>
      <div className="field"><label>Tarif (€ / 1000 vues)</label><input value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Ex. 1,2" /></div>
      <div className="field"><label>Couleur</label>
        <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
          {GRADS.map((g) => (
            <button key={g} onClick={() => setAccent(g)} aria-label="couleur"
              style={{ width: 34, height: 34, borderRadius: 9, background: g, cursor: "pointer",
                border: accent === g ? "2px solid var(--text)" : "2px solid transparent" }} />
          ))}
        </div>
      </div>
      <button className="btn btn-pri" style={{ marginTop: 18, padding: 14 }} onClick={create} disabled={busy}>{busy ? "Création…" : "Créer la campagne"}</button>
      <button className="btn btn-gh" style={{ marginTop: 9, padding: 12 }} onClick={onCancel}>Annuler</button>
      {err && <div className="auth-err">{err}</div>}
    </>
  );
}

/* ─────────── Formulaire : importer un asset (écriture réelle) ─────────── */
function ImportAssetForm({ campaigns, onCancel, onCreated }: { campaigns: import("@/lib/catalog").CampaignReal[]; onCancel: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [source, setSource] = useState<"drive" | "r2">("drive");
  const [storageUrl, setStorageUrl] = useState("");
  const [duration, setDuration] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    if (!title.trim()) { setErr("Donne un titre à l'asset."); return; }
    if (!campaignId) { setErr("Choisis une campagne (crées-en une d'abord si besoin)."); return; }
    if (!storageUrl.trim()) { setErr("Colle le lien de la vidéo source (Drive ou R2)."); return; }
    setBusy(true); setErr(null);
    const { error } = await getSupabase().from("assets").insert({
      campaign_id: campaignId, title: title.trim(), duration: duration.trim() || null,
      storage_url: storageUrl.trim(), source,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onCreated();
  }

  return (
    <>
      <h3>Importer un asset</h3>
      <p style={{ color: "var(--mut)", fontSize: 13 }}>Le fichier vit sur R2 (egress gratuit) ou reste pointé sur le Drive. Jamais dans GitHub.</p>
      <div className="field"><label>Titre</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Routine du matin" /></div>
      <div className="field"><label>Campagne</label>
        <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
          {campaigns.length === 0 && <option value="">Aucune campagne — crées-en une d'abord</option>}
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></div>
      <div className="field"><label>Source</label>
        <select value={source} onChange={(e) => setSource(e.target.value as "drive" | "r2")}>
          <option value="drive">Lien Google Drive (catalogue)</option>
          <option value="r2">Lien Cloudflare R2</option>
        </select></div>
      <div className="field"><label>Lien de la vidéo source</label><input value={storageUrl} onChange={(e) => setStorageUrl(e.target.value)} placeholder="Colle ton lien Google Drive (ou R2)" /></div>
      <div className="field"><label>Durée (optionnel)</label><input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Ex. 1:32" /></div>
      <button className="btn btn-pri" style={{ marginTop: 18, padding: 14 }} onClick={create} disabled={busy}>{busy ? "Ajout…" : "Ajouter au catalogue"}</button>
      <button className="btn btn-gh" style={{ marginTop: 9, padding: 12 }} onClick={onCancel}>Annuler</button>
      {err && <div className="auth-err">{err}</div>}
    </>
  );
}
