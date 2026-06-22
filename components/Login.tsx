"use client";

import React, { useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function magicLink() {
    if (!email) { setErr("Entre ton adresse email."); return; }
    setBusy(true); setErr(null);
    const { error } = await getSupabase().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + "/app" },
    });
    setBusy(false);
    if (error) setErr(error.message); else setSent(true);
  }

  async function google() {
    setErr(null);
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/app" },
    });
    if (error) setErr(error.message);
  }

  return (
    <div className="shell">
      <div className="auth-wrap">
        <img className="logo-img big" src="/clipwar-logo.png" alt="ClipWar" style={{ margin: "0 auto" }} />

        <div className="auth-card">
          {sent ? (
            <div className="auth-ok">
              Lien envoyé ✓<br />
              Ouvre l&apos;email reçu sur <b>{email}</b> et clique le lien pour entrer. (Pense à vérifier les spams.)
            </div>
          ) : (
            <>
              <h2>Connexion</h2>
              <div className="auth-sub">Accède à ta War Room.</div>

              <div className="field" style={{ marginTop: 16 }}>
                <label>Email</label>
                <input
                  type="email"
                  placeholder="toi@exemple.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") magicLink(); }}
                />
              </div>
              <button className="btn btn-pri" style={{ marginTop: 14, padding: 13 }} onClick={magicLink} disabled={busy}>
                {busy ? "Envoi…" : "Recevoir le lien magique"}
              </button>

              <div className="auth-div">ou</div>

              <button className="btn btn-google" style={{ padding: 13 }} onClick={google}>
                Continuer avec Google
              </button>
            </>
          )}

          {err && <div className="auth-err">{err}</div>}
        </div>

        <div className="auth-note">
          Première connexion ? Ton compte est créé automatiquement en tant que clipper.
        </div>
      </div>
    </div>
  );
}
