"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

export type Notif = {
  id: number; kind: string; title: string; body: string | null;
  link_tab: string | null; read: boolean; created_at: string;
};

export function useNotifications(enabled: boolean) {
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!enabled) { setLoading(false); return; }
    const { data } = await getSupabase()
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setItems((data || []) as Notif[]);
    setLoading(false);
  }, [enabled]);

  useEffect(() => { reload(); }, [reload]);

  // léger rafraîchissement périodique (pas de websocket pour rester simple)
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(reload, 60000);
    return () => clearInterval(t);
  }, [enabled, reload]);

  const unread = items.filter((i) => !i.read).length;

  const markAllRead = useCallback(async () => {
    const ids = items.filter((i) => !i.read).map((i) => i.id);
    if (!ids.length) return;
    setItems((p) => p.map((i) => ({ ...i, read: true })));
    await getSupabase().from("notifications").update({ read: true }).in("id", ids);
  }, [items]);

  return { items, unread, loading, reload, markAllRead };
}

// libellé relatif court : "à l'instant", "il y a 3 h", "hier"…
export function agoShort(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "hier";
  return `il y a ${d} j`;
}

export const notifEmoji: Record<string, string> = {
  clip_validated: "✅", clip_paid: "💰", clip_held: "⏸️", clip_rejected: "🚫",
  challenge_new: "🚀", challenge_won: "🏆", rank_up: "📈",
  clip_submitted: "🎬", fraud_alert: "⚠️", new_clipper: "👋",
};
