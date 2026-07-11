"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import SetWar from "@/components/SetWar";

type Prof = { display_name: string | null; role: string } | null;

export default function SetWarPage() {
  const [session, setSession] = useState<any>(undefined); // undefined = chargement
  const [profile, setProfile] = useState<Prof>(null);
  const [ready, setReady] = useState(false);
  const [inviteState, setInviteState] = useState<"none" | "working" | "failed">(
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("invite") ? "working" : "none"
  );
  const inviteDone = useRef(false);

  // police Manrope
  useEffect(() => {
    const id = "setwar-font";
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

  // code d'invitation ?invite=TOKEN → attribue le rôle setter
  useEffect(() => {
    if (inviteDone.current || !session || !profile) return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("invite");
    if (!token) return;
    const cleanUrl = () => {
      params.delete("invite");
      const q = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (q ? "?" + q : ""));
    };
    if (profile.role === "clipper") {
      inviteDone.current = true;
      getSupabase().rpc("redeem_invite", { p_token: token }).then(({ data, error }) => {
        cleanUrl();
        if (error || data !== "setter") { setInviteState("failed"); return; }
        setInviteState("none");
        loadProfile(session.user.id);
      });
    } else {
      inviteDone.current = true;
      setInviteState("none");
      cleanUrl();
    }
  }, [session, profile, loadProfile]);

  // ── chargement ──
  if (session === undefined || !ready || inviteState === "working") {
    return <Gate><div style={{ opacity: 0.5 }}>…</div></Gate>;
  }

  // ── pas connecté ──
  if (!session) {
    const inviteQS = typeof window !== "undefined" ? window.location.search : "";
    return (
      <Gate>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Set<span style={{ color: "#CDFB5E" }}>War</span></div>
          <div style={{ color: "#9A9EA6", fontSize: 14, marginBottom: 22, maxWidth: 260, lineHeight: 1.5 }}>
            Connecte-toi pour ouvrir ta journée de setter.
          </div>
          <a href={"/" + inviteQS} style={btn}>Se connecter / créer un compte</a>
        </div>
      </Gate>
    );
  }

  const role = profile?.role;
  const allowed = role === "setter" || role === "admin" || role === "owner";

  // ── invitation échouée ──
  if (inviteState === "failed") {
    return (
      <Gate>
        <div style={{ textAlign: "center", maxWidth: 300 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔑</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Code d'invitation invalide</div>
          <div style={{ color: "#9A9EA6", fontSize: 14, lineHeight: 1.5 }}>
            Ce lien d'invitation n'est plus valide ou a déjà été utilisé. Demande un nouveau code à ton équipe.
          </div>
        </div>
      </Gate>
    );
  }

  // ── connecté mais pas setter ──
  if (!allowed) {
    return (
      <Gate>
        <div style={{ textAlign: "center", maxWidth: 300 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Accès réservé aux setters</div>
          <div style={{ color: "#9A9EA6", fontSize: 14, lineHeight: 1.5, marginBottom: 22 }}>
            Ton compte n'a pas encore le rôle setter. Si tu viens d'être recruté, demande à ton équipe le lien d'invitation avec ton code.
          </div>
          <a href="/" style={btnGhost}>Retour à ClipWar</a>
        </div>
      </Gate>
    );
  }

  // ── OK : setter ──
  return <SetWar userName={profile?.display_name || session.user.email || undefined} />;
}

function Gate({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#0A0B0D", color: "#F2F3F5", fontFamily: "Manrope, system-ui, sans-serif", padding: 24,
    }}>{children}</div>
  );
}

const btn: React.CSSProperties = {
  display: "inline-block", background: "#CDFB5E", color: "#0B0F04", fontWeight: 800,
  textDecoration: "none", padding: "14px 24px", borderRadius: 15, fontFamily: "Manrope, system-ui, sans-serif",
};
const btnGhost: React.CSSProperties = {
  display: "inline-block", background: "transparent", color: "#F2F3F5", fontWeight: 700,
  textDecoration: "none", padding: "13px 24px", borderRadius: 15, border: "1px solid rgba(255,255,255,.15)",
  fontFamily: "Manrope, system-ui, sans-serif",
};
