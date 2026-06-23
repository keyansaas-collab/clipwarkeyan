"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { DRIVE_URL } from "@/lib/config";
import { REF_BONUS, REF_MILESTONE } from "@/lib/referral";

let _cache: Record<string, string> | null = null;
let _loading: Promise<void> | null = null;

async function load(force = false) {
  if (_cache && !force) return;
  if (_loading && !force) return _loading;
  _loading = (async () => {
    const { data } = await getSupabase().from("settings").select("key,value");
    _cache = Object.fromEntries((data || []).map((r: any) => [r.key, r.value]));
  })();
  return _loading;
}

export type Settings = {
  driveUrl: string;
  refBonus: number;
  refMilestone: number;
  emailEnabled: boolean;
  raw: Record<string, string> | null;
  reload: () => Promise<void>;
};

export function useSettings(): Settings {
  const [map, setMap] = useState<Record<string, string> | null>(_cache);
  useEffect(() => {
    let alive = true;
    load().then(() => { if (alive) setMap({ ...(_cache || {}) }); });
    return () => { alive = false; };
  }, []);
  const get = (k: string, def: string) => (map?.[k] ?? def);
  return {
    driveUrl: get("drive_url", DRIVE_URL),
    refBonus: Number(get("ref_bonus", String(REF_BONUS))) || REF_BONUS,
    refMilestone: Number(get("ref_milestone", String(REF_MILESTONE))) || REF_MILESTONE,
    emailEnabled: get("email_enabled", "1") === "1",
    raw: map,
    reload: async () => { await load(true); setMap({ ...(_cache || {}) }); },
  };
}

export async function setSetting(key: string, value: string) {
  const r = await getSupabase().rpc("set_setting", { p_key: key, p_value: value });
  await load(true);
  return r;
}
