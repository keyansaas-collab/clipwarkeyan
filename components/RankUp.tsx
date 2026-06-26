"use client";
import React, { useEffect, useState } from "react";
import RankSeal, { rankForViews, RANK_TIERS } from "./RankSeal";
import { celebrate } from "@/lib/confetti";

export default function RankUp({ views }: { views: number }) {
  const [show, setShow] = useState<number | null>(null);

  useEffect(() => {
    if (views <= 0) return;
    const idx = rankForViews(views).idx;
    let raw: string | null = null;
    try { raw = localStorage.getItem("cw_rank_seen"); } catch { return; }
    if (raw == null) { try { localStorage.setItem("cw_rank_seen", String(idx)); } catch {} return; }
    const seen = parseInt(raw, 10);
    if (idx > seen) {
      setShow(idx);
      try { celebrate({ emojis: ["👑", "🔥", "💸"] }); } catch {}
    }
    try { localStorage.setItem("cw_rank_seen", String(idx)); } catch {}
  }, [views]);

  if (show == null) return null;
  const t = RANK_TIERS[show];
  return (
    <div className="rankup-ov" onClick={() => setShow(null)}>
      <div className="rankup-rays" />
      <div className="rankup-seal"><RankSeal idx={show} size={180} /></div>
      <div className="rankup-name gold">{t.name}</div>
      <div className="rankup-sub">Nouveau rang débloqué</div>
      <button className="btn btn-pri rankup-btn" style={{ width: "auto", padding: "12px 28px" }} onClick={() => setShow(null)}>Continuer</button>
    </div>
  );
}
