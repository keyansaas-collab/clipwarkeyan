"use client";
import React, { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import SetWar from "@/components/SetWar";

export default function SetWarPage() {
  const [session, setSession] = useState<any>(undefined); // undefined = chargement
  const [name, setName] = useState<string | undefined>(undefined);

  // police Manrope (chargée uniquement sur SetWar, n'affecte pas ClipWar)
  useEffect(() => {
    const id = "setwar-font";
    if (!document.getElementById(id)) {
      const l = document.createElement("link");
      l.id = id;
      l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap";
      document.head.appendChild(l);
    }
  }, []);

  useEffect(() => {
    const sb = getSupabase();
    sb.auth.getSession().then(async ({ data }) => {
      const s = data.session ?? null;
      setSession(s);
      if (s) {
        const { data: p } = await sb
          .from("profiles")
          .select("display_name")
          .eq("id", s.user.id)
          .single();
        setName((p as any)?.display_name || s.user.email || undefined);
      }
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div style={gate}>
        <div style={{ opacity: 0.6 }}>…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={gate}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>SetWar</div>
          <div style={{ color: "#B9AEDB", fontSize: 14, marginBottom: 18 }}>
            Connecte-toi pour ouvrir ta journée.
          </div>
          <a href="/" style={btn}>
            Se connecter
          </a>
        </div>
      </div>
    );
  }

  return <SetWar userName={name} />;
}

const gate: React.CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(180deg,#241A3E,#1A1530 60%)",
  color: "#F4EEFF",
  fontFamily: "Manrope, system-ui, sans-serif",
};

const btn: React.CSSProperties = {
  display: "inline-block",
  background: "linear-gradient(135deg,#FF8BA7,#FFB27A)",
  color: "#22103A",
  fontWeight: 800,
  textDecoration: "none",
  padding: "12px 22px",
  borderRadius: 16,
  fontFamily: "Manrope, system-ui, sans-serif",
};
