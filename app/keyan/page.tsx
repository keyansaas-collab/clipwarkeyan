"use client";
import React, { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import KeyanDash from "@/components/KeyanDash";

type Prof = { display_name: string | null; role: string } | null;

export default function KeyanPage() {
  const [session, setSession] = useState<any>(undefined);
  const [profile, setProfile] = useState<Prof>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = "keyan-font";
    if (!document.getElementById(id)) {
      const l = document.createElement("link");
      l.id = id;
      l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800;900&display=swap";
      document.head.appendChild(l);
    }
  }, []);

  const loadProfile = useCallback(async (uid: string) => {
    const sb = getSupabase();
    const { data } = await sb.from("profiles").select("display_name, role").eq("id", uid).single();
    setProfile((data as Prof) || null);
    setReady(true);
  }, []);

  useEffect(() => {
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) => {
      const s = data.session ?? null;
      setSession(s);
      if (s) loadProfile(s.user.id);
      else setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
      setSession(s ?? null);
      if (s) loadProfile(s.user.id);
      else { setProfile(null); setReady(true); }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  if (session === undefined || !ready) return <Gate>…</Gate>;

  if (!session) {
    return (
      <Gate>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Keyan<span style={{ color: "#3A6B2E" }}>OS</span></div>
          <div style={{ color: "#6E6B62", fontSize: 14, marginBottom: 22 }}>Connecte-toi pour piloter ton équipe.</div>
          <a href="/" style={btn}>Se connecter</a>
        </div>
      </Gate>
    );
  }

  const isBoss = profile?.role === "owner" || profile?.role === "admin";
  if (!isBoss) {
    return (
      <Gate>
        <div style={{ textAlign: "center", maxWidth: 300 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Accès réservé</div>
          <div style={{ color: "#6E6B62", fontSize: 14, lineHeight: 1.5 }}>Ce cockpit est réservé au pilotage de l'équipe.</div>
        </div>
      </Gate>
    );
  }

  return <KeyanDash userName={profile?.display_name || session.user.email || undefined} />;
}

function Gate({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FBFAF8", color: "#15140F", fontFamily: "Manrope, system-ui, sans-serif", padding: 24 }}>{children}</div>
  );
}

const btn: React.CSSProperties = {
  display: "inline-block", background: "#3A6B2E", color: "#fff", fontWeight: 800,
  textDecoration: "none", padding: "14px 24px", borderRadius: 15, fontFamily: "Manrope, system-ui, sans-serif",
};
