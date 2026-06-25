import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runSnapshots } from "@/lib/views/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Bouton « Rafraîchir les vues » côté admin. Staff uniquement.
export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return Response.json({ error: "no token" }, { status: 401 });

  const db = supabaseAdmin();
  const { data: userData, error: uErr } = await db.auth.getUser(token);
  if (uErr || !userData?.user) return Response.json({ error: "invalid token" }, { status: 401 });

  const { data: prof } = await db.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
  if (!prof || (prof.role !== "owner" && prof.role !== "admin")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await runSnapshots(db);
    return Response.json({ ok: true, ...result });
  } catch (e: any) {
    return Response.json({ error: e?.message || "refresh failed" }, { status: 500 });
  }
}
