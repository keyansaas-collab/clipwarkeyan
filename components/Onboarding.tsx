"use client";

import React, { useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

export default function Onboarding({
  userId, email, initialName, onDone,
}: {
  userId: string; email: string; initialName: string | null; onDone: () => void;
}) {
  const [pseudo, setPseudo] = useState(initialName || "");
  const [tiktok, setTiktok] = useState("");
  const [instagram, setInstagram] = useState("");
  const [youtube, setYoutube] = useState("");
  const [country, setCountry] = useState("France");
  const [statut, setStatut] = useState("majeur");
  const [guardian, setGuardian] = useState("");
  const [payMethod, setPayMethod] = useState("paypal");
  const [payDetail, setPayDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!pseudo.trim()) { setErr("Choisis un pseudo."); return; }
    if (!tiktok && !instagram && !youtube) { setErr("Renseigne au moins un compte (TikTok, Instagram ou YouTube)."); return; }
    if (statut === "mineur" && !guardian.trim()) { setErr("En tant que mineur, l'email d'un parent / responsable est requis."); return; }

    setBusy(true); setErr(null);
    const { error } = await getSupabase().from("profiles").update({
      display_name: pseudo.trim(),
      tiktok: tiktok.trim() || null,
      instagram: instagram.trim() || null,
      youtube: youtube.trim() || null,
      country,
      is_minor: statut === "mineur",
      guardian_email: statut === "mineur" ? guardian.trim() : null,
      payout_method: payMethod,
      payout_detail: payDetail.trim() || null,
      onboarded: true,
    }).eq("id", userId);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onDone();
  }

  return (
    <div className="shell">
      <div className="auth-wrap" style={{ justifyContent: "flex-start", paddingTop: 28 }}>
        <img className="logo-img big" src="/clipwar-logo.png" alt="ClipWar" style={{ margin: "0 auto" }} />

        <div className="auth-card">
          <h2>Crée ta fiche clipper</h2>
          <div className="auth-sub">Quelques infos pour rejoindre la War Room. Tu pourras les modifier plus tard.</div>

          <div className="field"><label>Pseudo (affiché dans le classement)</label>
            <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} placeholder="Ex. LéaClips" /></div>

          <div className="onb-sep">Tes comptes</div>
          <div className="field"><label>TikTok</label>
            <input value={tiktok} onChange={(e) => setTiktok(e.target.value)} placeholder="@ton_compte" /></div>
          <div className="field"><label>Instagram</label>
            <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@ton_compte" /></div>
          <div className="field"><label>YouTube</label>
            <input value={youtube} onChange={(e) => setYoutube(e.target.value)} placeholder="lien ou nom de la chaîne" /></div>

          <div className="onb-sep">Profil</div>
          <div className="field"><label>Pays</label>
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              {["France", "Belgique", "Suisse", "Luxembourg", "Canada", "Maroc", "Tunisie", "Algérie", "Autre"].map((c) => <option key={c}>{c}</option>)}
            </select></div>
          <div className="field"><label>Statut</label>
            <select value={statut} onChange={(e) => setStatut(e.target.value)}>
              <option value="majeur">Majeur(e) — 18 ans et +</option>
              <option value="mineur">Mineur(e) — moins de 18 ans</option>
            </select></div>
          {statut === "mineur" && (
            <div className="field"><label>Email d&apos;un parent / responsable</label>
              <input type="email" value={guardian} onChange={(e) => setGuardian(e.target.value)} placeholder="parent@exemple.com" /></div>
          )}

          <div className="onb-sep">Paiement <span className="onb-opt">(modifiable avant ton 1ᵉʳ versement)</span></div>
          <div className="field"><label>Méthode</label>
            <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
              <option value="paypal">PayPal</option>
              <option value="iban">Virement (IBAN)</option>
              <option value="autre">Autre</option>
            </select></div>
          <div className="field"><label>{payMethod === "paypal" ? "Email PayPal" : payMethod === "iban" ? "IBAN" : "Coordonnées"}</label>
            <input value={payDetail} onChange={(e) => setPayDetail(e.target.value)} placeholder={payMethod === "paypal" ? "toi@exemple.com" : payMethod === "iban" ? "FR76 ..." : ""} /></div>

          <button className="btn btn-pri" style={{ marginTop: 18, padding: 14 }} onClick={submit} disabled={busy}>
            {busy ? "Enregistrement…" : "Entrer dans la War Room"}
          </button>
          {err && <div className="auth-err">{err}</div>}
        </div>

        <div className="auth-note">Connectée en tant que {email}.</div>
      </div>
    </div>
  );
}
