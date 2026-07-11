"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import SetWar from "@/components/SetWar";

type Prof = { display_name: string | null; role: string } | null;

export default function SetWarPage() {
  const [session, setSession] = useState<any>(undefined);
  const [profile, setProfile] = useState<Prof>(null);
  const [ready, setReady] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const redeemDone = useRef(false);

  // police
  useEffect(() => {
    const id = "setwar-font";
    if (!document.getElementById(id)) {
      const l = document.createElement("link");
      l.id = id; l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800;900&display=swap";
      document.head.appendChild(l);
    }
    // capte le code d'invitation dans l'URL
    const t = new URLSearchParams(window.location.search).get("invite");
    if (t) setInviteToken(t);
  }, []);

  const loadProfile = useCallback(async (uid: string) => {
    const sb = getSupabase();
    const { data } = await sb.from("profiles").select("display_name, role").eq("id", uid).single();
    setProfile((data as Prof) || null);
    setReady(true);
  }, []);

  useEffect(() => {
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) => {
      const s = data.session ?? null;
      setSession(s);
      if (s) loadProfile(s.user.id); else setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
      setSession(s ?? null);
      if (s) loadProfile(s.user.id); else { setProfile(null); setReady(true); }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  // applique le code d'invitation dès qu'on est connecté + clipper
  useEffect(() => {
    if (redeemDone.current || !session || !profile || !inviteToken) return;
    if (profile.role === "clipper") {
      redeemDone.current = true;
      setRedeeming(true);
      getSupabase().rpc("redeem_invite", { p_token: inviteToken }).then(({ data }) => {
        setRedeeming(false);
        setInviteToken(null);
        if (data === "setter" || data === "admin" || data === "owner") loadProfile(session.user.id);
      });
    } else {
      redeemDone.current = true;
      setInviteToken(null);
    }
  }, [session, profile, inviteToken, loadProfile]);

  // ── chargement ──
  if (session === undefined || !ready || redeeming) return <Gate><Spinner /></Gate>;

  // ── pas connecté → écran d'accueil SetWar (inscription / connexion) ──
  if (!session) return <SetWarAuth invite={inviteToken} />;

  const role = profile?.role;
  const allowed = role === "setter" || role === "admin" || role === "owner";

  // ── connecté mais pas encore setter (et pas de code) ──
  if (!allowed) {
    return (
      <Gate>
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          <Logo />
          <div style={{ fontSize: 40, margin: "18px 0 12px" }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Accès réservé aux setters</div>
          <div style={{ color: "#6E6B62", fontSize: 14, lineHeight: 1.5 }}>
            Ton compte n'a pas encore le rôle setter. Demande à ton équipe le lien d'invitation avec ton code.
          </div>
        </div>
      </Gate>
    );
  }

  return <SetWar userName={profile?.display_name || session.user.email || undefined} />;
}

/* ═══════════ Écran d'accueil SetWar : inscription + connexion ═══════════ */
function SetWarAuth({ invite }: { invite: string | null }) {
  const sb = getSupabase();
  const [mode, setMode] = useState<"signup" | "login">(invite ? "signup" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function signup() {
    if (!name.trim()) { setErr("Entre ton nom."); return; }
    if (!email.trim()) { setErr("Entre ton email."); return; }
    if (pwd.length < 6) { setErr("Mot de passe : 6 caractères minimum."); return; }
    setBusy(true); setErr(null);
    const { data, error } = await sb.auth.signUp({
      email: email.trim(),
      password: pwd,
      options: {
        data: { display_name: name.trim(), invite_token: invite || null },
        emailRedirectTo: window.location.origin + "/setwar" + (invite ? `?invite=${invite}` : ""),
      },
    });
    setBusy(false);
    if (error) {
      setErr(error.message.includes("already registered") ? "Un compte existe déjà avec cet email — connecte-toi." : error.message);
      return;
    }
    if (!data.session) {
      setInfo("Compte créé ✓ Vérifie ta boîte mail pour confirmer, puis connecte-toi.");
      setMode("login");
    }
    // si session immédiate → onAuthStateChange prend le relais, le code d'invite s'applique
  }

  async function login() {
    if (!email.trim()) { setErr("Entre ton email."); return; }
    setBusy(true); setErr(null);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pwd });
    setBusy(false);
    if (error) setErr("Email ou mot de passe incorrect.");
  }

  async function forgot() {
    if (!email.trim()) { setErr("Entre ton email pour recevoir le lien."); return; }
    setBusy(true); setErr(null);
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + "/setwar" });
    setBusy(false);
    if (error) setErr(error.message); else setInfo("Lien de réinitialisation envoyé ✓");
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <Logo />
        {invite && mode === "signup" && (
          <div style={S.invite}>🎉 Tu as été invité à rejoindre l'équipe comme setter.</div>
        )}
        <h1 style={S.h1}>{mode === "signup" ? "Rejoins l'équipe" : "Bon retour"}</h1>
        <p style={S.sub}>{mode === "signup" ? "Crée ton compte pour ouvrir ta journée." : "Connecte-toi à ta journée."}</p>

        {mode === "signup" && (
          <input style={S.input} placeholder="Ton nom" value={name} autoCapitalize="words"
            onChange={(e) => setName(e.target.value)} />
        )}
        <input style={S.input} placeholder="Email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <input style={S.input} placeholder="Mot de passe" type="password"
          value={pwd} onChange={(e) => setPwd(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (mode === "signup" ? signup() : login())} />

        {err && <div style={S.err}>{err}</div>}
        {info && <div style={S.info}>{info}</div>}

        <button style={S.btn} disabled={busy} onClick={mode === "signup" ? signup : login}>
          {busy ? "…" : mode === "signup" ? "Créer mon compte" : "Se connecter"}
        </button>

        {mode === "login" && (
          <button style={S.link} onClick={forgot}>Mot de passe oublié ?</button>
        )}

        <div style={S.switch}>
          {mode === "signup" ? (
            <>Déjà un compte ? <button style={S.linkInline} onClick={() => { setMode("login"); setErr(null); }}>Se connecter</button></>
          ) : (
            <>Pas encore de compte ? <button style={S.linkInline} onClick={() => { setMode("signup"); setErr(null); }}>S'inscrire</button></>
          )}
        </div>
      </div>
    </div>
  );
}

function Logo() {
  return <div style={{ fontWeight: 800, fontSize: 24, letterSpacing: "-0.02em" }}>Set<span style={{ color: "#3A6B2E" }}>War</span></div>;
}
function Spinner() { return <div style={{ opacity: 0.4, fontSize: 15 }}>…</div>; }
function Gate({ children }: { children: React.ReactNode }) {
  return <div style={S.page}><div style={{ textAlign: "center" }}>{children}</div></div>;
}

const GREEN = "#3A6B2E";
const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FBFAF8", color: "#15140F", fontFamily: "Manrope, system-ui, sans-serif", padding: 24 },
  card: { width: "100%", maxWidth: 380, background: "#fff", border: "1px solid #ECEAE3", borderRadius: 24, padding: 32, boxShadow: "0 4px 24px rgba(20,18,10,.06)" },
  invite: { marginTop: 16, background: "#EAF3E4", border: "1px solid rgba(58,107,46,.2)", borderRadius: 12, padding: "11px 14px", fontSize: 13, color: "#2C4D22", fontWeight: 600, lineHeight: 1.4 },
  h1: { fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", marginTop: 18 },
  sub: { fontSize: 14, color: "#6E6B62", marginTop: 6, marginBottom: 22, fontWeight: 500 },
  input: { width: "100%", background: "#F2F1EC", border: "1px solid #E1DED5", borderRadius: 13, padding: "14px 15px", fontSize: 16, fontFamily: "inherit", color: "#15140F", outline: "none", marginBottom: 11 },
  btn: { width: "100%", background: GREEN, color: "#fff", border: "none", borderRadius: 14, padding: 16, fontSize: 15.5, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", marginTop: 6 },
  link: { display: "block", width: "100%", textAlign: "center", background: "none", border: "none", color: "#6E6B62", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", marginTop: 14 },
  linkInline: { background: "none", border: "none", color: GREEN, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", fontSize: 13.5, padding: 0 },
  switch: { textAlign: "center", marginTop: 20, fontSize: 13.5, color: "#6E6B62", fontWeight: 500 },
  err: { marginTop: 4, marginBottom: 8, fontSize: 13, color: "#C4551F", background: "#FBEDE4", border: "1px solid #F1D9C9", borderRadius: 10, padding: "10px 12px" },
  info: { marginTop: 4, marginBottom: 8, fontSize: 13, color: "#2C4D22", background: "#EAF3E4", border: "1px solid rgba(58,107,46,.2)", borderRadius: 10, padding: "10px 12px", lineHeight: 1.4 },
};
