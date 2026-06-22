"use client";

import React, { useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

type Mode = "login" | "signup" | "forgot";

export default function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function reset(m: Mode) { setMode(m); setErr(null); setInfo(null); }

  async function login() {
    if (!email || !pwd) { setErr("Email et mot de passe requis."); return; }
    setBusy(true); setErr(null);
    const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password: pwd });
    setBusy(false);
    if (error) setErr(error.message === "Invalid login credentials" ? "Email ou mot de passe incorrect." : error.message);
    // succès : onAuthStateChange (dans AppShell) prend le relais.
  }

  async function signup() {
    if (!name.trim()) { setErr("Choisis un pseudo."); return; }
    if (!email) { setErr("Entre ton email."); return; }
    if (pwd.length < 6) { setErr("Mot de passe : 6 caractères minimum."); return; }
    setBusy(true); setErr(null);
    const { data, error } = await getSupabase().auth.signUp({
      email: email.trim(),
      password: pwd,
      options: { data: { display_name: name.trim() }, emailRedirectTo: window.location.origin + "/app" },
    });
    setBusy(false);
    if (error) {
      setErr(error.message.includes("already registered") ? "Un compte existe déjà avec cet email — connecte-toi." : error.message);
      return;
    }
    // Si la confirmation email est désactivée dans Supabase, une session est créée
    // immédiatement et AppShell bascule sur l'app. Sinon, on invite à confirmer.
    if (!data.session) {
      setInfo("Compte créé ✓ Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi.");
      setMode("login");
    }
  }

  async function forgot() {
    if (!email) { setErr("Entre ton email pour recevoir le lien de réinitialisation."); return; }
    setBusy(true); setErr(null);
    const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + "/app",
    });
    setBusy(false);
    if (error) setErr(error.message);
    else { setInfo("Email envoyé ✓ Ouvre le lien reçu pour choisir un nouveau mot de passe."); setMode("login"); }
  }

  const submit = mode === "login" ? login : mode === "signup" ? signup : forgot;
  const cta = busy ? "…" : mode === "login" ? "Se connecter" : mode === "signup" ? "Créer mon compte" : "Envoyer le lien";

  return (
    <div className="shell">
      <div className="auth-wrap">
        <img className="logo-img big" src="/clipwar-logo.png" alt="ClipWar" style={{ margin: "0 auto" }} />

        <div className="auth-card">
          <h2>{mode === "login" ? "Connexion" : mode === "signup" ? "Créer un compte" : "Mot de passe oublié"}</h2>
          <div className="auth-sub">
            {mode === "login" ? "Accède à ta War Room." : mode === "signup" ? "Rejoins la War Room en 30 secondes." : "On t'envoie un lien pour le réinitialiser."}
          </div>

          {mode === "signup" && (
            <div className="field" style={{ marginTop: 16 }}>
              <label>Pseudo</label>
              <input placeholder="Ex. LéaClips" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}

          <div className="field" style={{ marginTop: mode === "signup" ? 0 : 16 }}>
            <label>Email</label>
            <input type="email" placeholder="toi@exemple.com" value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && mode === "forgot") submit(); }} />
          </div>

          {mode !== "forgot" && (
            <div className="field">
              <label>Mot de passe</label>
              <input type="password" placeholder={mode === "signup" ? "6 caractères minimum" : "••••••••"} value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
            </div>
          )}

          <button className="btn btn-pri" style={{ marginTop: 16, padding: 13 }} onClick={submit} disabled={busy}>{cta}</button>

          {mode === "login" && (
            <div style={{ textAlign: "center", marginTop: 12, fontSize: 12.5 }}>
              <span style={{ color: "var(--cyan)", cursor: "pointer" }} onClick={() => reset("forgot")}>Mot de passe oublié ?</span>
            </div>
          )}

          <div className="auth-div">ou</div>

          {mode === "login" ? (
            <button className="btn btn-gh" style={{ padding: 13 }} onClick={() => reset("signup")}>Créer un compte</button>
          ) : (
            <button className="btn btn-gh" style={{ padding: 13 }} onClick={() => reset("login")}>J&apos;ai déjà un compte — me connecter</button>
          )}

          {err && <div className="auth-err">{err}</div>}
          {info && <div className="auth-ok" style={{ marginTop: 12 }}>{info}</div>}
        </div>

        <div className="auth-note">
          Un nouveau compte est créé en tant que clipper. Les accès admin sont attribués par le propriétaire.
        </div>
      </div>
    </div>
  );
}
