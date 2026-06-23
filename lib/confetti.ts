"use client";

// Confettis maison — aucune dépendance. Un burst depuis le centre-bas.
// Usage : import { celebrate } from "@/lib/confetti"; celebrate();
export function celebrate(opts?: { count?: number; emojis?: string[] }) {
  if (typeof window === "undefined") return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const count = opts?.count ?? 120;
  const colors = ["#2DE2E6", "#8B6CFF", "#FF6A45", "#FFB23E", "#35E6A1", "#FF5C8A"];
  const emojis = opts?.emojis ?? [];

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = (canvas.width = window.innerWidth * dpr);
  const H = (canvas.height = window.innerHeight * dpr);

  type P = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; color: string; emoji?: string; life: number };
  const parts: P[] = [];
  const cx = W / 2, cy = H * 0.62;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI - Math.PI / 2 - Math.PI / 4 + (Math.random() - 0.5) * 0.8;
    const sp = (6 + Math.random() * 10) * dpr;
    parts.push({
      x: cx + (Math.random() - 0.5) * 60 * dpr,
      y: cy,
      vx: Math.cos(a) * sp * (Math.random() > 0.5 ? 1 : -1) * 0.7 + (Math.random() - 0.5) * 4 * dpr,
      vy: -Math.abs(Math.sin(a) * sp) - 6 * dpr,
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.4,
      size: (6 + Math.random() * 8) * dpr,
      color: colors[(Math.random() * colors.length) | 0],
      emoji: emojis.length ? emojis[(Math.random() * emojis.length) | 0] : undefined,
      life: 1,
    });
  }

  const g = 0.32 * dpr;
  let raf = 0;
  const t0 = performance.now();
  function frame(t: number) {
    ctx.clearRect(0, 0, W, H);
    const elapsed = t - t0;
    let alive = false;
    for (const p of parts) {
      p.vy += g; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (elapsed > 1800) p.life -= 0.03;
      if (p.life <= 0 || p.y > H + 40) continue;
      alive = true;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.emoji) {
        ctx.font = `${p.size * 2}px serif`;
        ctx.textAlign = "center";
        ctx.fillText(p.emoji, 0, 0);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      }
      ctx.restore();
    }
    if (alive && elapsed < 4000) raf = requestAnimationFrame(frame);
    else { cancelAnimationFrame(raf); canvas.remove(); }
  }
  raf = requestAnimationFrame(frame);
}
