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

    const { html, text } = renderEmail(n.kind, n.title, n.body || "", appUrl);

    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: email, subject: `ClipWar — ${n.title}`, html, text }),
      });
      if (r.ok) sent++; else skipped++;
    } catch { skipped++; }
  }

  if (markIds.length) await db.from("notifications").update({ emailed: true }).in("id", markIds);

  return Response.json({ ok: true, sent, skipped, processed: markIds.length });
}

const ACCENTS: Record<string, { emoji: string; color: string }> = {
  clip_paid: { emoji: "💰", color: "#35E6A1" },
  challenge_won: { emoji: "🏆", color: "#FFB23E" },
  challenge_new: { emoji: "🚀", color: "#8B6CFF" },
  clip_held: { emoji: "⏸️", color: "#FF6A45" },
  new_clipper: { emoji: "👋", color: "#2DE2E6" },
};

function renderEmail(kind: string, title: string, body: string, appUrl: string) {
  const a = ACCENTS[kind] || { emoji: "🔔", color: "#8B6CFF" };
  const T = escapeHtml(title), B = escapeHtml(body);
  const wordmark = `<div style="font-family:'Segoe UI',system-ui,Arial,sans-serif;font-size:22px;font-weight:900;letter-spacing:1.5px;"><span style="color:#ffffff;">CLIP</span><span style="color:#2DE2E6;">WAR</span></div>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="dark"></head>
<body style="margin:0;padding:0;background:#08060f;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#08060f;padding:28px 14px;">
<tr><td align="center">
  <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#15101f;border:1px solid #2a2440;border-radius:18px;overflow:hidden;">
    <tr><td style="height:4px;background:linear-gradient(90deg,#8B6CFF,#2DE2E6);background-color:${a.color};font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td style="padding:26px 30px 0;text-align:center;">${wordmark}</td></tr>
    <tr><td style="padding:18px 30px 0;text-align:center;font-size:40px;line-height:1;">${a.emoji}</td></tr>
    <tr><td style="padding:12px 30px 0;text-align:center;">
      <div style="font-family:'Segoe UI',system-ui,Arial,sans-serif;font-size:21px;font-weight:800;color:#ffffff;letter-spacing:-.3px;">${T}</div>
    </td></tr>
    <tr><td style="padding:10px 34px 0;text-align:center;">
      <div style="font-family:'Segoe UI',system-ui,Arial,sans-serif;font-size:15px;line-height:1.55;color:#b9b2c9;">${B}</div>
    </td></tr>
    <tr><td style="padding:24px 30px 30px;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>
        <td style="border-radius:12px;background:#8B6CFF;background:linear-gradient(135deg,#8B6CFF,#2DE2E6);">
          <a href="${appUrl}" style="display:inline-block;padding:13px 28px;font-family:'Segoe UI',system-ui,Arial,sans-serif;font-size:15px;font-weight:700;color:#0a0610;text-decoration:none;border-radius:12px;">Ouvrir ClipWar →</a>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:0 30px 26px;text-align:center;">
      <div style="font-family:'Segoe UI',system-ui,Arial,sans-serif;font-size:11.5px;color:#6b6480;">Tu reçois cet email car tu as un compte ClipWar.</div>
    </td></tr>
  </table>
  <div style="font-family:'Segoe UI',system-ui,Arial,sans-serif;font-size:11px;color:#4a4560;margin-top:14px;">ClipWar · War Room</div>
</td></tr>
</table>
</body></html>`;

  const text = `${title}\n\n${body}\n\nOuvrir ClipWar : ${appUrl}\n\n— Tu reçois cet email car tu as un compte ClipWar.`;
  return { html, text };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
