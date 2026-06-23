"use client";

import React, { useEffect, useState } from "react";
import { Icon } from "./ui";
import Clipper, { ClipActions } from "./Clipper";
import Admin, { AdmActions } from "./Admin";
import Login, { SetNewPassword } from "./Login";
import Onboarding from "./Onboarding";
import SubmitSheet, { SubmitPrefill } from "./SubmitSheet";
import { getSupabase } from "@/lib/supabase/client";
import { platLabel, MyClip } from "@/lib/data";
import { useCatalog, AssetReal } from "@/lib/catalog";
import { useArena } from "@/lib/arena";
import { useNotifications, agoShort, notifEmoji } from "@/lib/notifications";
import { linkReferral } from "@/lib/referral";

type Role = "clip" | "adm";
type NavLink = { id: string; label: string; icon: string };
type Profile = { display_name: string | null; role: string; rank: string | null; onboarded?: boolean; avatar_url?: string | null };

export default function AppShell() {
  // ── auth ──
  const [session, setSession] = useState<any>(undefined); // undefined = chargement
  const [recovery, setRecovery] = useState(false); // arrivée via lien "mot de passe oublié"
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
  // ── arena RÉELLE (challenges + classement), partagée clipper + admin ──
  const arena = useArena(!!session);
  // ── notifications (cloche) ──
  const notifs = useNotifications(!!session);

  // récupère la session + écoute les changements (login / logout / récupération)
  useEffect(() => {
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((e, s) => {
      if (e === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(s ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // capture du code de parrainage présent dans l'URL (?ref=CODE)
  useEffect(() => {
    try {
      const code = new URLSearchParams(window.location.search).get("ref");
      if (code) localStorage.setItem("cw_ref", code.toUpperCase());
    } catch {}
  }, []);
  // une fois le profil chargé, lie le parrain (1 fois)
  const refDoneRef = React.useRef(false);
  useEffect(() => {
    if (refDoneRef.current || !session || !profile) return;
    let code: string | null = null;
    try { code = localStorage.getItem("cw_ref"); } catch {}
    if (!code) return;
    refDoneRef.current = true;
    linkReferral(code).then((ok) => {
      try { localStorage.removeItem("cw_ref"); } catch {}
      if (ok) showToast("Parrain enregistré 👋");
    });
  }, [session, profile]);

  // charge le profil (rôle + onboarding) ; réutilisable après la fiche
  const loadProfile = React.useCallback(() => {
    if (!session) { setProfile(null); return; }
    getSupabase()
      .from("profiles")
      .select("display_name, role, rank, onboarded, avatar_url")
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
      .select("id, platform, url, status, asset_id, campaign_id, paid_views, submitted_at, assets(title), campaigns(rate_per_1000)")
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
      const camp = Array.isArray(r.campaigns) ? r.campaigns[0] : r.campaigns;
      const rate = camp?.rate_per_1000 ? Number(camp.rate_per_1000) : 1;
      const paid = r.paid_views ? Number(r.paid_views) : 0;
      const st = (r.status === "rejected" ? "hold" : r.status);
      const due = st === "track" ? Math.max(0, cur - paid) : 0;
      const gain = (due / 1000) * rate;
      const ago = r.submitted_at ? Math.floor((Date.now() - new Date(r.submitted_at).getTime()) / 864e5) : 0;
      return { id: r.id, asset: a?.title || "(contenu original)", plat: platLabel[r.platform] || r.platform, vues: cur, d7: net, st, url: r.url, ago, rate, paid, due, gain };
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
    setSheet(<ChallengeForm campaigns={catalog.campaigns} onCancel={closeSheet} onDone={() => { closeSheet(); showToast("Challenge créé"); arena.reload(); }} />);
  }
  function openNewCampaign() {
    setSheet(<CampaignForm onCancel={closeSheet} onDone={() => { closeSheet(); showToast("Campagne enregistrée"); catalog.reload(); }} />);
  }
  function openEditCampaign(c: import("@/lib/catalog").CampaignReal) {
    setSheet(<CampaignForm existing={c} onCancel={closeSheet} onDone={() => { closeSheet(); showToast("Campagne mise à jour"); catalog.reload(); }} />);
  }
  function openImport() {
    setSheet(<ImportAssetForm campaigns={catalog.campaigns} onCancel={closeSheet} onCreated={() => { closeSheet(); showToast("Asset ajouté au catalogue"); catalog.reload(); }} />);
  }
  function openCreate() {
    setSheet(
      <>
        <h3>Créer</h3>
        <p style={{ color: "var(--mut)", fontSize: 13 }}>Que veux-tu lancer ?</p>
        <button className="btn btn-pri" style={{ marginTop: 14, padding: 14, display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-start" }} onClick={openNewChallenge}><Icon name="trophy" /><span>Nouveau challenge</span></button>
        <button className="btn btn-gh" style={{ marginTop: 10, padding: 14, display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-start" }} onClick={openNewCampaign}><Icon name="folder" /><span>Nouvelle campagne</span></button>
        <button className="btn btn-gh" style={{ marginTop: 14, padding: 12 }} onClick={closeSheet}>Annuler</button>
      </>
    );
  }

  function openNotifs() {
    notifs.markAllRead();
    setSheet(
      <>
        <h3>Notifications</h3>
        {notifs.loading ? <div className="empty">Chargement…</div>
          : notifs.items.length === 0 ? <div className="empty" style={{ padding: "20px 8px" }}>Rien pour l&apos;instant. Tes alertes (clips, paiements, challenges) apparaîtront ici.</div>
          : <div style={{ marginTop: 6 }}>{notifs.items.map((nf) => (
              <div key={nf.id} className="card" style={{ marginBottom: 8, display: "flex", gap: 11, alignItems: "flex-start", cursor: nf.link_tab ? "pointer" : "default", opacity: nf.read ? 0.7 : 1 }}
                onClick={() => { if (nf.link_tab) { closeSheet(); go(nf.link_tab); } }}>
                <div style={{ fontSize: 20, lineHeight: "24px" }}>{notifEmoji[nf.kind] || "🔔"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{nf.title}</div>
                  {nf.body && <div style={{ fontSize: 12.5, color: "var(--mut)", marginTop: 2 }}>{nf.body}</div>}
                  <div style={{ fontSize: 11, color: "var(--mut2)", marginTop: 4 }}>{agoShort(nf.created_at)}</div>
                </div>
              </div>
            ))}</div>}
      </>
    );
  }

  // toast à l'ouverture s'il y a du nouveau (mode "maximal")
  const toastedRef = React.useRef(false);
  useEffect(() => {
    if (!toastedRef.current && !notifs.loading && notifs.unread > 0) {
      toastedRef.current = true;
      showToast(`🔔 ${notifs.unread} nouveaut\u00e9${notifs.unread > 1 ? "s" : ""}`);
    }
  }, [notifs.loading, notifs.unread]);

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
  if (recovery) return <SetNewPassword onDone={() => setRecovery(false)} />;

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
  const admActions: AdmActions = { go, openImport, openClipper, openNewChallenge, openNewCampaign, openEditCampaign, openPayVerify, showToast };
  const adm = role === "adm";

  const navLinks: NavLink[] = adm
    ? [
        { id: "dash", label: "Dashboard", icon: "home" },
        { id: "clippers", label: "Clippers", icon: "user" },
        { id: "clips", label: "Clips", icon: "clip" },
        { id: "campaigns", label: "Campagnes", icon: "folder" },
        { id: "challenges", label: "Challenges", icon: "trophy" },
        { id: "fraud", label: "Anti-triche", icon: "alert" },
        { id: "pay", label: "Paiements", icon: "wallet" },
        { id: "settings", label: "Réglages", icon: "settings" },
        ...(profile?.role === "owner" ? [{ id: "team", label: "Équipe", icon: "user" }] : []),
      ]
    : [
        { id: "home", label: "Accueil", icon: "home" },
        { id: "camp", label: "Campagnes", icon: "folder" },
        { id: "clips", label: "Mes clips", icon: "clip" },
        { id: "bilan", label: "Bilan", icon: "chart" },
        { id: "classement", label: "Classement", icon: "trophy" },
        { id: "profil", label: "Profil", icon: "user" },
      ];
  const MENU_ITEM: NavLink = { id: "_menu", label: "Plus", icon: "grid" };
  const mobileLinks: NavLink[] = adm
    ? [navLinks[0], navLinks[1], navLinks[2], MENU_ITEM]
    : [navLinks[0], navLinks[1], navLinks[2], MENU_ITEM];
  const fabLabel = adm ? "Créer" : "Soumettre un clip";
  const fabAction = adm ? () => openCreate() : () => openSubmit();

  // menu mobile : toutes les sections (celles qui ne tiennent pas dans la barre du bas)
  function openSections() {
    setSheet(
      <>
        <h3>Sections</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
          {navLinks.map((it) => (
            <button key={it.id} className={"btn " + (tab === it.id ? "btn-pri" : "btn-gh")}
              style={{ padding: 14, display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-start" }}
              onClick={() => { closeSheet(); go(it.id); }}>
              <Icon name={it.icon} /><span>{it.label}</span>
            </button>
          ))}
        </div>
      </>
    );
  }

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
          <button className="bell side-bell" onClick={openNotifs} aria-label="Notifications">
            <Icon name="bell" /><span>Notifications</span>
            {notifs.unread > 0 && <span className="bell-dot">{notifs.unread > 9 ? "9+" : notifs.unread}</span>}
          </button>
          <div className="side-user">{profile?.display_name || session.user.email}</div>
          <button className="logout" onClick={logout}>Se déconnecter</button>
        </div>
      </aside>

      {/* ── contenu ── */}
      <div className="main">
        <div className="mobtop mobile-only">
          {isStaff ? <PreviewSwitch /> : <div style={{ flex: 1, fontSize: 12, color: "var(--mut)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.display_name || session.user.email}</div>}
          <button className="bell" onClick={openNotifs} aria-label="Notifications">
            <Icon name="bell" />
            {notifs.unread > 0 && <span className="bell-dot">{notifs.unread > 9 ? "9+" : notifs.unread}</span>}
          </button>
          <button className="logout" onClick={logout}>Quitter</button>
        </div>
        {role === "clip"
          ? <Clipper tab={tab} camp={camp} clipDetail={clipDetail} clips={clips} catalog={catalog} arena={arena} userName={profile.display_name || session.user.email} userEmail={session.user.email} userId={session.user.id} userAvatar={profile.avatar_url} reloadProfile={loadProfile} actions={clipActions} />
          : <Admin tab={tab} actions={admActions} catalog={catalog} arena={arena} isOwner={profile?.role === "owner"} userName={profile.display_name || session.user.email} userAvatar={profile.avatar_url} clipperId={admClipper} payClipper={payClipper} />}
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
            {it.id === "_menu" ? (
              <a className={mobileLinks.some((m) => m.id === tab) ? "" : "on " + (adm ? "adm" : "")} onClick={openSections}>
                <Icon name={it.icon} /><span>{it.label}</span>
              </a>
            ) : (
              <a className={tab === it.id ? "on " + (adm ? "adm" : "") : ""} onClick={() => go(it.id)}>
                <Icon name={it.icon} /><span>{it.label}</span>
              </a>
            )}
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

function CampaignForm({ existing, onCancel, onDone }: { existing?: import("@/lib/catalog").CampaignReal; onCancel: () => void; onDone: () => void }) {
  const edit = !!existing;
  const [name, setName] = useState(existing?.name ?? "");
  const [desc, setDesc] = useState(existing?.description ?? "");
  const [rate, setRate] = useState(existing ? String(existing.rate).replace(".", ",") : "1,2");
  const [accent, setAccent] = useState(existing?.accent ?? GRADS[0]);
  const [active, setActive] = useState(existing ? existing.is_active : true);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) { setErr("Donne un nom à la campagne."); return; }
    const rateNum = parseFloat(rate.replace(",", "."));
    if (!isFinite(rateNum) || rateNum <= 0) { setErr("Tarif invalide (ex. 1,2)."); return; }
    setBusy(true); setErr(null);
    const payload = { name: name.trim(), description: desc.trim() || null, rate_per_1000: rateNum, accent, is_active: active };
    const sb = getSupabase();
    const { error } = edit
      ? await sb.from("campaigns").update(payload).eq("id", existing!.id)
      : await sb.from("campaigns").insert(payload);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onDone();
  }

  async function remove() {
    setBusy(true); setErr(null);
    const { error } = await getSupabase().from("campaigns").delete().eq("id", existing!.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onDone();
  }

  return (
    <>
      <h3>{edit ? "Modifier la campagne" : "Nouvelle campagne"}</h3>
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

      {edit && (
        <div className="field" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <label style={{ margin: 0 }}>Campagne active</label>
          <button onClick={() => setActive((v) => !v)} aria-label="activer"
            style={{ width: 46, height: 26, borderRadius: 14, cursor: "pointer", position: "relative",
              background: active ? "var(--mint)" : "var(--surf2)", border: "1px solid var(--line2)", transition: "background .15s" }}>
            <span style={{ position: "absolute", top: 2, left: active ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "#0a0610", transition: "left .15s" }} />
          </button>
        </div>
      )}
      {edit && !active && <div style={{ fontSize: 11.5, color: "var(--mut)", marginTop: 2 }}>Désactivée : masquée aux clippers, mais l&apos;historique et l&apos;attribution restent intacts.</div>}

      <button className="btn btn-pri" style={{ marginTop: 18, padding: 14 }} onClick={save} disabled={busy}>
        {busy ? "Enregistrement…" : edit ? "Enregistrer" : "Créer la campagne"}
      </button>

      {edit && (
        <div className="card" style={{ marginTop: 14, background: "var(--bg2)" }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Lien public à partager</div>
          <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 2 }}>Une page vitrine de cette campagne, à envoyer aux clippers.</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <div className="mono" style={{ flex: 1, minWidth: 0, background: "var(--surf)", border: "1px solid var(--line2)", borderRadius: 10, padding: "9px 11px", fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(typeof window !== "undefined" ? window.location.origin : "") + "/c/" + existing!.id}</div>
            <button className="btn btn-gh" style={{ width: "auto", padding: "0 14px" }} onClick={async () => {
              const link = window.location.origin + "/c/" + existing!.id;
              if (navigator.share) { try { await navigator.share({ title: existing!.name, text: "Clippe cette campagne sur ClipWar 🎬", url: link }); return; } catch {} }
              try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
            }}>{copied ? "Copié ✨" : "Partager"}</button>
          </div>
        </div>
      )}

      {edit && (
        confirmDel ? (
          <>
            <div style={{ fontSize: 12, color: "var(--coral)", marginTop: 14, textAlign: "center" }}>
              {(existing!.clipCount > 0 || existing!.assetCount > 0)
                ? `Cette campagne a ${existing!.assetCount} asset(s) et ${existing!.clipCount} clip(s). La supprimer les détachera (attribution perdue). Mieux vaut la désactiver. Confirmer quand même ?`
                : "Supprimer définitivement cette campagne ?"}
            </div>
            <button className="btn btn-pri" style={{ marginTop: 10, padding: 12, background: "var(--coral)" }} onClick={remove} disabled={busy}>Oui, supprimer</button>
            <button className="btn btn-gh" style={{ marginTop: 9, padding: 12 }} onClick={() => setConfirmDel(false)}>Annuler</button>
          </>
        ) : (
          <button className="btn btn-gh" style={{ marginTop: 9, padding: 12, color: "var(--coral)" }} onClick={() => setConfirmDel(true)}>Supprimer la campagne</button>
        )
      )}
      {!edit && <button className="btn btn-gh" style={{ marginTop: 9, padding: 12 }} onClick={onCancel}>Annuler</button>}
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

/* ─────────── Formulaire : nouveau challenge v2 (modulable) ─────────── */
function ChallengeForm({ campaigns, onCancel, onDone }: { campaigns: import("@/lib/catalog").CampaignReal[]; onCancel: () => void; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [campaignId, setCampaignId] = useState<string>("");
  const [metric, setMetric] = useState<"views" | "clips" | "manual">("views");
  const [kind, setKind] = useState<"collectif" | "sprint" | "palier">("sprint");
  const [goal, setGoal] = useState("1000000");
  const [rewardType, setRewardType] = useState<"cash" | "cadeau" | "bonus" | "autre">("cash");
  const [pot, setPot] = useState("");
  const [rewardLabel, setRewardLabel] = useState("");
  const [dur, setDur] = useState("today");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const needsGoal = metric !== "manual" && kind !== "sprint"; // sprint = classement, pas de seuil ; manual = jugé
  const goalLabel = metric === "clips" ? "Objectif de clips" : "Objectif de vues";

  async function create() {
    if (!title.trim()) { setErr("Donne un nom au challenge."); return; }
    setBusy(true); setErr(null);
    let goalNum: number | null = null;
    if (needsGoal) {
      goalNum = parseInt(goal.replace(/\s/g, ""), 10);
      if (!isFinite(goalNum) || goalNum <= 0) { setBusy(false); setErr("Objectif invalide."); return; }
    }
    const now = new Date();
    let ends = new Date();
    if (dur === "today") { ends.setHours(23, 59, 59, 0); }
    else ends = new Date(Date.now() + parseFloat(dur) * 864e5);

    const { error } = await getSupabase().from("challenges").insert({
      title: title.trim(),
      campaign_id: campaignId || null,
      kind, metric,
      reward_type: rewardType,
      reward_label: rewardLabel.trim() || null,
      pot: pot ? parseFloat(pot.replace(",", ".")) : null,
      goal_views: goalNum,
      starts_at: now.toISOString(),
      ends_at: ends.toISOString(),
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onDone();
  }

  return (
    <>
      <h3>Nouveau challenge</h3>
      <p style={{ color: "var(--mut)", fontSize: 13 }}>Rends-le ludique : choisis ce qu&apos;on mesure, le format et la prime.</p>

      <div className="field"><label>Nom</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Le plus de clips aujourd'hui 🔥" /></div>

      <div className="field"><label>On mesure</label>
        <select value={metric} onChange={(e) => setMetric(e.target.value as any)}>
          <option value="views">Vues nettes</option>
          <option value="clips">Nombre de clips postés</option>
          <option value="manual">Jugé manuellement (meilleur montage, plus drôle…)</option>
        </select>
        {metric === "manual" && <div className="prefill">Tu désigneras le gagnant à la clôture (rien à mesurer automatiquement).</div>}
      </div>

      <div className="field"><label>Format</label>
        <select value={kind} onChange={(e) => setKind(e.target.value as any)}>
          <option value="sprint">Course / classement — le meilleur gagne</option>
          <option value="collectif">Objectif collectif — la commu atteint le but</option>
          <option value="palier">Palier — chacun qui atteint le seuil gagne</option>
        </select>
      </div>

      <div className="field"><label>Campagne</label>
        <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
          <option value="">Toutes les campagnes</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></div>

      {needsGoal && (
        <div className="field"><label>{goalLabel}</label><input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={metric === "clips" ? "Ex. 50" : "Ex. 1000000"} /></div>
      )}

      <div className="field"><label>Type de prime</label>
        <select value={rewardType} onChange={(e) => setRewardType(e.target.value as any)}>
          <option value="cash">Cash (€)</option>
          <option value="cadeau">Cadeau (objet, place…)</option>
          <option value="bonus">Bonus sur la paie</option>
          <option value="autre">Autre</option>
        </select>
        <div className="prefill">La prime est <b>hors payout normal</b> — tu la remets toi-même au gagnant.</div>
      </div>

      {rewardType === "cash" || rewardType === "bonus" ? (
        <div className="field"><label>Montant (€)</label><input value={pot} onChange={(e) => setPot(e.target.value)} placeholder="Ex. 200" /></div>
      ) : (
        <div className="field"><label>Récompense</label><input value={rewardLabel} onChange={(e) => setRewardLabel(e.target.value)} placeholder="Ex. AirPods Pro, place de concert…" /></div>
      )}
      {(rewardType === "cash" || rewardType === "bonus") && (
        <div className="field"><label>Précision (optionnel)</label><input value={rewardLabel} onChange={(e) => setRewardLabel(e.target.value)} placeholder="Ex. versé sur PayPal, +20% ce mois…" /></div>
      )}

      <div className="field"><label>Durée</label>
        <select value={dur} onChange={(e) => setDur(e.target.value)}>
          <option value="today">Aujourd&apos;hui (jusqu&apos;à minuit)</option>
          <option value="1">24 heures</option>
          <option value="2">48 heures</option>
          <option value="7">7 jours</option>
          <option value="14">14 jours</option>
          <option value="30">30 jours</option>
        </select></div>

      <button className="btn btn-pri" style={{ marginTop: 18, padding: 14 }} onClick={create} disabled={busy}>{busy ? "Création…" : "Lancer le challenge"}</button>
      <button className="btn btn-gh" style={{ marginTop: 9, padding: 12 }} onClick={onCancel}>Annuler</button>
      {err && <div className="auth-err">{err}</div>}
    </>
  );
}
