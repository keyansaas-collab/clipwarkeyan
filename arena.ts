"use client";

// ─────────────────────────────────────────────────────────────
//  ClipWar — « Arena » : challenges + classement réels
//  Lit challenges_list() et leaderboard() (patch 10). Partagé par
//  le clipper (Accueil + Classement) et l'admin (écran Challenges).
//  Remplace les tableaux fictifs `challenges` et `clippersFull`.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

export type ArenaChallenge = {
  id: string; title: string; campaign_id: string | null; campaign_name: string | null;
  kind: "sprint" | "collectif"; goal_views: number | null; pot: number | null;
  starts_at: string | null; ends_at: string | null;
  active: boolean; progress: number; participants: number;
};

export type BoardRow = {
  id: string; name: string; rank: string; clips: number; vues_7: number; vues_total: number;
};

export type Arena = {
  challenges: ArenaChallenge[];
  board: BoardRow[];
  loading: boolean;
  reload: () => Promise<void>;
};

const n = (v: any) => Number(v) || 0;

export function useArena(enabled: boolean): Arena {
  const [challenges, setChallenges] = useState<ArenaChallenge[]>([]);
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!enabled) { setLoading(false); return; }
    const sb = getSupabase();
    setLoading(true);
    const [chR, lbR] = await Promise.all([sb.rpc("challenges_list"), sb.rpc("leaderboard")]);
    setChallenges((chR.data || []).map((r: any) => ({
      id: r.id, title: r.title, campaign_id: r.campaign_id, campaign_name: r.campaign_name,
      kind: r.kind === "sprint" ? "sprint" : "collectif",
      goal_views: r.goal_views == null ? null : n(r.goal_views),
      pot: r.pot == null ? null : n(r.pot),
      starts_at: r.starts_at, ends_at: r.ends_at,
      active: !!r.active, progress: n(r.progress), participants: n(r.participants),
    })));
    setBoard((lbR.data || []).map((r: any) => ({
      id: r.id, name: r.name, rank: r.rank, clips: n(r.clips), vues_7: n(r.vues_7), vues_total: n(r.vues_total),
    })));
    setLoading(false);
  }, [enabled]);

  useEffect(() => { reload(); }, [reload]);

  return { challenges, board, loading, reload };
}

// libellé « il reste … » pour la fin d'un challenge
export function endsLabel(ends_at: string | null): string {
  if (!ends_at) return "Sans fin";
  const ms = new Date(ends_at).getTime() - Date.now();
  if (ms <= 0) return "Terminé";
  const h = Math.floor(ms / 3.6e6);
  if (h < 1) return "Fini dans < 1 h";
  if (h < 48) return `Fini dans ${h} h`;
  return `Fini dans ${Math.round(h / 24)} j`;
}
