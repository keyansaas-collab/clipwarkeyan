"use client";
import React, { useId } from "react";

export type RankTier = {
  name: string; thr: number; petals: number; rings: number;
  mLight: string; mDark: string; glow: string;
};

export const RANK_TIERS: RankTier[] = [
  { name: "Recrue",        thr: 0,      petals: 5,  rings: 3, mLight: "#D2D6DE", mDark: "#5A6473", glow: "rgba(150,160,185,.4)" },
  { name: "Ambitieux",     thr: 10000,  petals: 6,  rings: 3, mLight: "#F2B877", mDark: "#7C4A20", glow: "rgba(225,140,65,.45)" },
  { name: "Hustler",       thr: 25000,  petals: 7,  rings: 4, mLight: "#F0F2F8", mDark: "#888E9C", glow: "rgba(225,230,240,.45)" },
  { name: "Closer",        thr: 50000,  petals: 8,  rings: 4, mLight: "#FCE08A", mDark: "#B5862A", glow: "rgba(245,196,81,.55)" },
  { name: "Boss",          thr: 120000, petals: 9,  rings: 5, mLight: "#C2F8FC", mDark: "#1E8C94", glow: "rgba(45,226,230,.55)" },
  { name: "Mogul",         thr: 300000, petals: 11, rings: 5, mLight: "#DEC9FF", mDark: "#5A3FB0", glow: "rgba(139,108,255,.6)" },
  { name: "Légende Dubai", thr: 750000, petals: 13, rings: 6, mLight: "#FFE9A8", mDark: "#C9881E", glow: "rgba(255,180,40,.72)" },
];

export function rankForViews(total: number) {
  let idx = 0;
  RANK_TIERS.forEach((t, i) => { if (total >= t.thr) idx = i; });
  const tier = RANK_TIERS[idx];
  const next = RANK_TIERS[idx + 1] || null;
  const progress = next ? Math.min(100, ((total - tier.thr) / (next.thr - tier.thr)) * 100) : 100;
  return { idx, tier, next, progress };
}

function rose(C: number, R: number, A: number, k: number, phase: number, steps: number) {
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    const r = R + A * Math.cos(k * th + phase);
    d += (i ? "L" : "M") + (C + r * Math.cos(th)).toFixed(2) + " " + (C + r * Math.sin(th)).toFixed(2) + " ";
  }
  return d + "Z";
}
function weave(C: number, R: number, a: number, p: number, d2: number, q: number, steps: number) {
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    const rr = R + a * Math.cos(p * th);
    const x = C + rr * Math.cos(th) + d2 * Math.cos(q * th);
    const y = C + rr * Math.sin(th) + d2 * Math.sin(q * th);
    d += (i ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2) + " ";
  }
  return d;
}

export default function RankSeal({
  views, idx, size = 120, mini = false, spin = true,
}: { views?: number; idx?: number; size?: number; mini?: boolean; spin?: boolean }) {
  const uid = useId().replace(/[:]/g, "");
  const tIdx = idx != null ? idx : rankForViews(views || 0).idx;
  const t = RANK_TIERS[tIdx];
  const C = 200;
  const steps = mini ? 700 : 2000;
  const g = `g${uid}`;

  const rings = [];
  for (let r = 0; r < t.rings; r++) {
    rings.push(
      <path key={r} d={rose(C, 60 + r * 16, 6 + (r % 2 ? 4 : 2), t.petals + r * 2, r * 0.4, mini ? 360 : 720)}
        fill="none" stroke={`url(#${g})`} strokeWidth={(0.7 - r * 0.05).toFixed(2)} opacity={(0.85 - r * 0.07).toFixed(2)} />
    );
  }
  const ticks = [];
  const N = mini ? 36 : 72;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, r0 = 170, r1 = i % 6 === 0 ? 160 : 165;
    ticks.push(<line key={i} x1={(C + r0 * Math.cos(a)).toFixed(1)} y1={(C + r0 * Math.sin(a)).toFixed(1)}
      x2={(C + r1 * Math.cos(a)).toFixed(1)} y2={(C + r1 * Math.sin(a)).toFixed(1)}
      stroke={`url(#${g})`} strokeWidth={i % 6 === 0 ? 1.4 : 0.6} opacity={0.8} />);
  }

  return (
    <svg width={size} height={size} viewBox="0 0 400 400" aria-label={`Rang ${t.name}`}
      style={{ filter: `drop-shadow(0 0 ${mini ? 5 : 14}px ${t.glow})`, display: "block" }}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.mLight} /><stop offset="0.5" stopColor={t.mLight} /><stop offset="1" stopColor={t.mDark} />
        </linearGradient>
        <radialGradient id={`${g}f`} cx="0.5" cy="0.42" r="0.62">
          <stop offset="0" stopColor={t.mDark} stopOpacity="0.28" />
          <stop offset="0.7" stopColor="#0a0812" stopOpacity="0.9" />
          <stop offset="1" stopColor="#06050c" />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r="192" fill={`url(#${g}f)`} stroke={`url(#${g})`} strokeWidth="2" />
      <circle cx={C} cy={C} r="152" fill="none" stroke={`url(#${g})`} strokeWidth="1.2" />
      <g>
        {ticks}
        {spin && <animateTransform attributeName="transform" type="rotate" from={`0 ${C} ${C}`} to={`-360 ${C} ${C}`} dur="120s" repeatCount="indefinite" />}
      </g>
      <g>
        {rings}
        <path d={weave(C, 46, 10, t.petals, 9, t.petals * 2, steps)} fill="none" stroke={`url(#${g})`} strokeWidth="0.5" opacity="0.9" />
        {!mini && <path d={weave(C, 40, 8, t.petals + 1, 7, t.petals * 2 + 1, steps)} fill="none" stroke={`url(#${g})`} strokeWidth="0.45" opacity="0.7" />}
        {spin && <animateTransform attributeName="transform" type="rotate" from={`0 ${C} ${C}`} to={`360 ${C} ${C}`} dur="90s" repeatCount="indefinite" />}
      </g>
      <circle cx={C} cy={C} r="36" fill="#0a0812" stroke={`url(#${g})`} strokeWidth="1.4" />
      <g fill={`url(#${g})`} transform={`translate(${C} ${C}) scale(1.25)`}>
        <polygon points="-13,-15 -7,-15 -7,15 -13,15" />
        <polygon points="-7,-1 6,-15 13,-15 -2,2" />
        <polygon points="-7,1 6,15 13,15 -2,-2" />
      </g>
    </svg>
  );
}
