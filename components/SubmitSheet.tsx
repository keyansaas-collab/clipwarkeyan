"use client";

import React, { useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

function detect(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("tiktok")) return "tiktok";
  if (u.includes("instagram")) return "instagram";
  if (u.includes("youtu")) return "youtube";
  return "";
}

export default function SubmitSheet({ clipperId, onDone }: { clipperId: string; onDone: () => void }) {
  const [url, setUrl] = useState("");
  const [plat, setPlat] = useState("tiktok");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function onUrl(v: string) {
    setUrl(v);
    const d = detect(v);
    if (d) setPlat(d);
  }

  async function submit() {
    if (!url.trim()) { setErr("Colle le lien de ton clip."); return; }
    setBusy(true); setErr(null);
    const { error } = await getSupabase().from("clips").insert({
      clipper_id: clipperId,
      platform: plat,
      url: url.trim(),
      status: "track",
    });
    setBusy(false);
    if (error) {
      setErr(error.code === "23505" ? "Ce lien a déjà été soumis." : error.message);
      return;
    }
    onDone();
  }

  return (
    <>
      <h3>Soumettre un clip</h3>
      <p style={{ color: "var(--mut)", fontSize: 13 }}>On suit ses vues automatiquement dès l&apos;ajout.</p>
      <div className="field">
        <label>Lien du clip</label>
        <input placeholder="https://tiktok.com/@..." value={url} onChange={(e) => onUrl(e.target.value)} />
      </div>
      <div className="field">
        <label>Plateforme</label>
        <select value={plat} onChange={(e) => setPlat(e.target.value)}>
          <option value="tiktok">TikTok</option>
          <option value="instagram">Instagram</option>
          <option value="youtube">YouTube</option>
        </select>
        <div className="prefill">Détectée automatiquement depuis le lien — corrige si besoin.</div>
      </div>
      <button className="btn btn-pri" style={{ marginTop: 18, padding: 14 }} onClick={submit} disabled={busy}>
        {busy ? "Envoi…" : "Soumettre le clip"}
      </button>
      {err && <div className="auth-err">{err}</div>}
    </>
  );
}
