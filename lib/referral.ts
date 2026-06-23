"use client";

import { getSupabase } from "@/lib/supabase/client";

// ── Paramètres du parrainage (modifiables ici) ──
export const REF_MILESTONE = 10000; // vues qu'un filleul doit atteindre
export const REF_BONUS = 5;         // bonus € pour le parrain quand le palier est atteint

export type Filleul = {
  id: string; name: string; avatar_url: string | null;
  vues_total: number; reached: boolean; joined_at: string;
};

export async function getMyCode(): Promise<string | null> {
  const { data } = await getSupabase().rpc("my_referral_code");
  return (data as string) || null;
}

export async function getMyReferrals(): Promise<Filleul[]> {
  const { data } = await getSupabase().rpc("my_referrals");
  return (data || []).map((r: any) => ({
    id: r.id, name: r.name, avatar_url: r.avatar_url,
    vues_total: Number(r.vues_total) || 0, reached: !!r.reached, joined_at: r.joined_at,
  }));
}

export async function linkReferral(code: string): Promise<boolean> {
  const { data } = await getSupabase().rpc("link_referral", { p_code: code });
  return !!data;
}

export function refLink(code: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/app?ref=${code}`;
}
