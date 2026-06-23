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
  kind: "sprint" | "collectif" | "palier";
  metric: "views" | "clips" | "manual";
  reward_type: "cash" | "cadeau" | "bonus" | "autre";
  reward_label: string | null;
  goal_views: number | null; pot: number | null;
  starts_at: string | null; ends_at: string | null;
  active: boolean; progress: number; participants: number;
  winner_id: string | null; winner_name: string | null; awarded_at: string | null;
};

export type BoardRow = {
  id: string; name: string; rank: string; avatar_url: string | null; clips: number; vues_7: number; vues_total: number;
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
      kind: (["sprint", "collectif", "palier"].includes(r.kind) ? r.kind : "collectif"),
      metric: (["views", "clips", "manual"].includes(r.metric) ? r.metric : "views"),
      reward_type: (["cash", "cadeau", "bonus", "autre"].includes(r.reward_type) ? r.reward_type : "cash"),
      reward_label: r.reward_label,
      goal_views: r.goal_views == null ? null : n(r.goal_views),
      pot: r.pot == null ? null : n(r.pot),
      starts_at: r.starts_at, ends_at: r.ends_at,
      active: !!r.active, progress: n(r.progress), participants: n(r.participants),
      winner_id: r.winner_id, winner_name: r.winner_name, awarded_at: r.awarded_at,
    })));
    setBoard((lbR.data || []).map((r: any) => ({
      id: r.id, name: r.name, rank: r.rank, avatar_url: r.avatar_url, clips: n(r.clips), vues_7: n(r.vues_7), vues_total: n(r.vues_total),
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

export const metricLabel: Record<string, string> = { views: "vues", clips: "clips postés", manual: "jugé manuellement" };
export const kindLabel: Record<string, string> = { collectif: "Objectif collectif", sprint: "Course / classement", palier: "Palier individuel" };
export const rewardLabel: Record<string, string> = { cash: "Cash", cadeau: "Cadeau", bonus: "Bonus paie", autre: "Récompense" };

// récompense affichable : « 400 € », « AirPods (cadeau) », etc.
export function rewardText(c: ArenaChallenge): string {
  const bits: string[] = [];
  if (c.pot) bits.push(Math.round(c.pot).toLocaleString("fr-FR") + " €");
  if (c.reward_label) bits.push(c.reward_label);
  if (!bits.length) bits.push(rewardLabel[c.reward_type] || "Récompense");
  return bits.join(" · ");
}

// classement d'un challenge (qui mène) — chargé à la demande
export async function fetchChallengeBoard(cid: string): Promise<{ clipper_id: string; name: string; score: number }[]> {
  const { data } = await getSupabase().rpc("challenge_leaderboard", { cid });
  return (data || []).map((r: any) => ({ clipper_id: r.clipper_id, name: r.name, score: Number(r.score) || 0 }));
}

// clôturer & désigner le gagnant (winner peut être null pour un collectif)
export async function awardChallenge(cid: string, winner: string | null) {
  return getSupabase().rpc("award_challenge", { cid, winner });
}
