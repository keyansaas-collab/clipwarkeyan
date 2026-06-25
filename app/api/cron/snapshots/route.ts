import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runSnapshots } from "@/lib/views/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Déclenché par le cron Vercel (voir vercel.json).
// Relève les vues de chaque clip track/hold en parallèle par lots.
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runSnapshots(supabaseAdmin());
    return Response.json(result);
  } catch (e: any) {
    return Response.json({ error: e?.message || "snapshot failed" }, { status: 500 });
  }
}
