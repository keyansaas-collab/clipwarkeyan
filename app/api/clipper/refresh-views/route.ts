import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runSnapshots } from "@/lib/views/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const COOLDOWN_MIN = 15; // un clipper peut rafraîchir au plus toutes les 15 min

// Le clipper rafraîchit SES propres vues. Cooldown anti-abus.
export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return Response.json({ error: "no token" }, { status: 401 });

  const db = supabaseAdmin();
  const { data: userData, error: uErr } = await db.auth.getUser(token);
  if (uErr || !userData?.user) return Response.json({ error: "invalid token" }, { status: 401 });
  const uid = userData.user.id;

  const { data: prof } = await db.from("profiles").select("last_views_refresh").eq("id", uid).maybeSingle();
  const last = prof?.last_views_refresh ? new Date(prof.last_views_refresh).getTime() : 0;
  const waitMs = COOLDOWN_MIN * 60 * 1000 - (Date.now() - last);
  if (last && waitMs > 0) {
    return Response.json({ error: "cooldown", retryInSec: Math.ceil(waitMs / 1000) }, { status: 429 });
  }

  try {
    const result = await runSnapshots(db, uid);
    await db.from("profiles").update({ last_views_refresh: new Date().toISOString() }).eq("id", uid);
    return Response.json({ ok: true, ...result });
  } catch (e: any) {
    return Response.json({ error: e?.message || "refresh failed" }, { status: 500 });
  }
}
