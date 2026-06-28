"use client";
import React, { useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

export default function SetterOnboarding({ userId, initialName, onDone }: { userId: string; initialName: string | null; onDone: () => void }) {
  const [name, setName] = useState(initialName || "");
  const [phone, setPhone] = useState("");
  const [insta, setInsta] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [experience, setExperience] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function togglePlat(p: string) {
    setPlatforms((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]);
  }

  async function submit() {
    if (!name.trim()) { setErr("Indique ton nom."); return; }
    setBusy(true); setErr(null);
    const { error } = await getSupabase().from("profiles").update({
      display_name: name.trim(),
      phone: phone.trim() || null,
      instagram: insta.trim().replace(/^@/, "") || null,
      prospect_platforms: platforms.join(", ") || null,
      experience: experience || null,
      bio: bio.trim() || null,
      setter_onboarded: true,
    }).eq("id", userId);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onDone();
  }

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "28px 18px", maxWidth: 460, margin: "0 auto" }}>
      <div className="eyebrow" style={{ color: "var(--coral)" }}>BIENVENUE DANS L&apos;ÉQUIPE</div>
      <h1 className="display" style={{ fontSize: 26, fontStyle: "italic", margin: "4px 0 4px" }}>Ta fiche setter</h1>
      <p style={{ color: "var(--mut)", fontSize: 13, marginBottom: 20 }}>Quelques infos pour te configurer. Tu pourras les modifier plus tard.</p>

      <label className="fld-l">Nom complet *</label>
      <input className="fld" value={name} onChange={(e) => setName(e.target.value)} placeholder="Inès Martin" autoFocus />

      <label className="fld-l">Téléphone (WhatsApp)</label>
      <input className="fld" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+33 6 12 34 56 78" inputMode="tel" />

      <label className="fld-l">Ton compte Instagram</label>
      <input className="fld" value={insta} onChange={(e) => setInsta(e.target.value)} placeholder="@ines.closing" />

      <label className="fld-l">Plateformes où tu prospectes</label>
      <div className="role" style={{ margin: "0 0 4px", flexWrap: "wrap" }}>
        {["Instagram", "TikTok", "Autre"].map((p) => (
          <button key={p} className={platforms.includes(p) ? "on" : ""} onClick={() => togglePlat(p)}>{p}</button>
        ))}
      </div>

      <label className="fld-l">Ton expérience en setting / closing</label>
      <select className="fld" value={experience} onChange={(e) => setExperience(e.target.value)}>
        <option value="">—</option>
        <option value="Débutant">Débutant</option>
        <option value="Intermédiaire">Intermédiaire</option>
        <option value="Confirmé">Confirmé</option>
      </select>

      <label className="fld-l">Présente-toi en une ligne</label>
      <textarea className="fld" value={bio} onChange={(e) => setBio(e.target.value)} rows={2} placeholder="Ex : 2 ans en agence, spécialisé prospection froide, dispo le soir." />

      {err && <div style={{ color: "var(--coral)", fontSize: 13, marginTop: 8 }}>{err}</div>}
      <button className="btn btn-pri" style={{ width: "100%", marginTop: 18, padding: 14, fontSize: 15 }} disabled={busy} onClick={submit}>{busy ? "…" : "C'est parti 🚀"}</button>
    </div>
  );
}
