"use client";
import React, { useState } from "react";

export function KeyanBanner({
  src, height = 140, radius = 16, caption, style,
}: { src: string; height?: number; radius?: number; caption?: string; style?: React.CSSProperties }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    <div style={{ position: "relative", width: "100%", height, borderRadius: radius, overflow: "hidden", border: "1px solid var(--line2)", ...style }}>
      <img src={src} alt="" onError={() => setOk(false)}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      {caption && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "18px 14px 11px",
          background: "linear-gradient(to top, rgba(7,6,14,.85), transparent)",
          fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: .3 }}>{caption}</div>
      )}
    </div>
  );
}
