import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Types de notifs qui méritent un email (les plus importants — pas de spam).
const EMAILABLE = new Set(["clip_paid", "challenge_won", "challenge_new", "clip_held", "new_clipper"]);

// Déclenché par le cron Vercel. Envoie un email pour les notifications
// importantes pas encore envoyées. Inactif tant que RESEND_API_KEY est absent.
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) return Response.json({ ok: true, skipped: "no RESEND_API_KEY" });

  const db = supabaseAdmin();

  // emails activés dans les réglages ?
  const { data: setting } = await db.from("settings").select("value").eq("key", "email_enabled").maybeSingle();
  if (setting && setting.value === "0") return Response.json({ ok: true, skipped: "emails disabled" });

  const from = process.env.EMAIL_FROM || "ClipWar <onboarding@resend.dev>";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://clipwarkeyan.vercel.app/app";

  const { data: notifs } = await db
    .from("notifications")
    .select("id, user_id, kind, title, body")
    .eq("emailed", false)
    .order("created_at", { ascending: true })
    .limit(30);

  let sent = 0, skipped = 0;
  const markIds: number[] = [];

  for (const n of notifs ?? []) {
    markIds.push(n.id); // on marque tout comme traité (évite les boucles), même les non-emailés
    if (!EMAILABLE.has(n.kind)) { skipped++; continue; }

    const { data: u } = await db.auth.admin.getUserById(n.user_id);
    const email = u?.user?.email;
    if (!email) { skipped++; continue; }

    const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">
      <h2 style="margin:0 0 8px">${escapeHtml(n.title)}</h2>
      <p style="color:#444;font-size:15px;line-height:1.5">${escapeHtml(n.body || "")}</p>
      <a href="${appUrl}" style="display:inline-block;margin-top:12px;background:#8B6CFF;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600">Ouvrir ClipWar</a>
      <p style="color:#999;font-size:12px;margin-top:20px">Tu reçois cet email car tu as un compte ClipWar.</p>
    </div>`;

    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: email, subject: `ClipWar — ${n.title}`, html }),
      });
      if (r.ok) sent++; else skipped++;
    } catch { skipped++; }
  }

  if (markIds.length) await db.from("notifications").update({ emailed: true }).in("id", markIds);

  return Response.json({ ok: true, sent, skipped, processed: markIds.length });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
