"use client";

import { useEffect, useRef } from "react";

// Surveille le déploiement courant. Si une nouvelle version est mise en ligne,
// recharge l'app automatiquement — sauf si l'utilisateur est en train de saisir.
export default function UpdateWatcher() {
  const current = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;

    async function check() {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const { v } = await r.json();
        if (!v) return;
        if (current.current === null) { current.current = v; return; } // 1er passage = référence
        if (v !== current.current) {
          const el = document.activeElement as HTMLElement | null;
          const typing = el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
          if (typing) return;            // on ne coupe pas une saisie en cours
          current.current = v;
          window.location.reload();      // nouvelle version → recharge
        }
      } catch {
        /* hors-ligne ou erreur réseau : on réessaiera */
      }
    }

    check();
    const id = setInterval(() => { if (!stopped) check(); }, 60000);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
