"use client";
import React, { useEffect, useRef, useState } from "react";

export default function CountUp({
  value, format, dur = 750, className, style,
}: { value: number; format?: (n: number) => string; dur?: number; className?: string; style?: React.CSSProperties }) {
  const [v, setV] = useState(value);
  const from = useRef(value);
  const mounted = useRef(false);

  useEffect(() => {
    // pas d'animation au tout premier rendu si la valeur est déjà connue
    if (!mounted.current) { mounted.current = true; from.current = 0; }
    const a = from.current, b = value, start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setV(a + (b - a) * e);
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, dur]);

  return <span className={className} style={style}>{format ? format(v) : Math.round(v).toLocaleString("fr-FR")}</span>;
}
