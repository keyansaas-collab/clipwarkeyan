"use client";
import React, { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import KeyanDash from "@/components/KeyanDash";

type Prof = { display_name: string | null; role: string } | null;

export default function KeyanPage() {
  const [session, setSession] = useState<any>(undefined);
  const [profile, setProfile] = useState<Prof>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = "keyan-font";
    if (!document.getElementById(id)) {
      const l = document.createElement("link");
      l.id = id; l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800;900&display=swap";
      document.head.appendChild(l);
    }
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

  if (session === undefined || !ready) return <Gate><div style={{ opacity: 0.4 }}>…</div></Gate>;

  // pas connecté → écran de connexion admin
  if (!session) return <KeyanAuth />;

  const isBoss = profile?.role === "owner" || profile?.role === "admin";
  if (!isBoss) {
    return (
      <Gate>
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          <Logo />
          <div style={{ fontSize: 40, margin: "18px 0 12px" }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Accès réservé</div>
          <div style={{ color: "#6E6B62", fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
            Ce cockpit est réservé au pilotage. Ton compte n'a pas les droits admin.
          </div>
          <button style={btnGhost} onClick={() => getSupabase().auth.signOut()}>Changer de compte</button>
        </div>
      </Gate>
    );
  }

  return <KeyanDash userName={profile?.display_name || session.user.email || undefined} />;
}

/* ═══════════ Connexion admin KeyanOS ═══════════ */
function KeyanAuth() {
  const sb = getSupabase();
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [forgotMode, setForgotMode] = useState(false);

  async function login() {
    if (!email.trim()) { setErr("Entre ton email."); return; }
    setBusy(true); setErr(null);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pwd });
    setBusy(false);
    if (error) setErr("Email ou mot de passe incorrect.");
    // succès → onAuthStateChange recharge la page vers le cockpit
  }

  async function forgot() {
    if (!email.trim()) { setErr("Entre ton email pour recevoir le lien."); return; }
    setBusy(true); setErr(null);
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + "/keyan" });
    setBusy(false);
    if (error) setErr(error.message); else { setInfo("Lien de réinitialisation envoyé ✓"); setForgotMode(false); }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <Logo />
        <h1 style={S.h1}>{forgotMode ? "Mot de passe oublié" : "Pilotage"}</h1>
        <p style={S.sub}>{forgotMode ? "On t'envoie un lien de réinitialisation." : "Connecte-toi pour accéder au cockpit."}</p>

        <input style={S.input} placeholder="Email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        {!forgotMode && (
          <input style={S.input} placeholder="Mot de passe" type="password"
            value={pwd} onChange={(e) => setPwd(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()} />
        )}

        {err && <div style={S.err}>{err}</div>}
        {info && <div style={S.info}>{info}</div>}

        <button style={S.btn} disabled={busy} onClick={forgotMode ? forgot : login}>
          {busy ? "…" : forgotMode ? "Envoyer le lien" : "Se connecter"}
        </button>

        <button style={S.link} onClick={() => { setForgotMode(!forgotMode); setErr(null); setInfo(null); }}>
          {forgotMode ? "← Retour à la connexion" : "Mot de passe oublié ?"}
        </button>
      </div>
    </div>
  );
}

function Logo() {
  return <div style={{ fontWeight: 800, fontSize: 24, letterSpacing: "-0.02em" }}>Keyan<span style={{ color: "#3A6B2E" }}>OS</span></div>;
}
function Gate({ children }: { children: React.ReactNode }) {
  return <div style={S.page}><div style={{ textAlign: "center" }}>{children}</div></div>;
}

const GREEN = "#3A6B2E";
const btnGhost: React.CSSProperties = { background: "none", border: "1px solid #E1DED5", borderRadius: 12, padding: "11px 20px", fontWeight: 700, fontSize: 13, color: "#15140F", fontFamily: "Manrope, system-ui, sans-serif", cursor: "pointer" };
const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FBFAF8", color: "#15140F", fontFamily: "Manrope, system-ui, sans-serif", padding: 24 },
  card: { width: "100%", maxWidth: 380, background: "#fff", border: "1px solid #ECEAE3", borderRadius: 24, padding: 32, boxShadow: "0 4px 24px rgba(20,18,10,.06)" },
  h1: { fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", marginTop: 18 },
  sub: { fontSize: 14, color: "#6E6B62", marginTop: 6, marginBottom: 22, fontWeight: 500 },
  input: { width: "100%", background: "#F2F1EC", border: "1px solid #E1DED5", borderRadius: 13, padding: "14px 15px", fontSize: 16, fontFamily: "inherit", color: "#15140F", outline: "none", marginBottom: 11 },
  btn: { width: "100%", background: GREEN, color: "#fff", border: "none", borderRadius: 14, padding: 16, fontSize: 15.5, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", marginTop: 6 },
  link: { display: "block", width: "100%", textAlign: "center", background: "none", border: "none", color: "#6E6B62", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", marginTop: 14 },
  err: { marginTop: 4, marginBottom: 8, fontSize: 13, color: "#C4551F", background: "#FBEDE4", border: "1px solid #F1D9C9", borderRadius: 10, padding: "10px 12px" },
  info: { marginTop: 4, marginBottom: 8, fontSize: 13, color: "#2C4D22", background: "#EAF3E4", border: "1px solid rgba(58,107,46,.2)", borderRadius: 10, padding: "10px 12px", lineHeight: 1.4 },
};
