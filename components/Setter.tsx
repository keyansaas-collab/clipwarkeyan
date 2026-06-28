"use client";
import React, { useEffect, useState, useCallback } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { useSettings } from "@/lib/settings";
import { Avatar } from "./ui";

type Prospect = {
  id: number; handle: string; clipper_id: string | null; clipper_name: string | null;
  need: string | null; stage: string; source: string; note: string | null; rdv_at: string | null;
  sale_amount: number | null; platform: string | null; budget: string | null; interet: string | null;
  qualified: string | null; lost_reason: string | null; relance_count: number;
  last_activity_at: string; stale: boolean;
};
type Stats = { en_convo: number; pret_appel: number; rdv: number; vendus: number; ca: number;
  froid_contacte: number; froid_repondu: number; froid_whatsapp: number; qualifies: number };
type SetterRow = { setter_id: string; name: string; avatar_url: string | null; clippers: number;
  contacted: number; replied: number; taux_reponse: number | null; rdv_booked: number; rdv_honored: number;
  show_up: number | null; vendus: number; ca: number; avg_h: number | null; is_active: boolean };
type Overview = { contacted: number; replied: number; taux_reponse: number | null; rdv_booked: number;
  rdv_honored: number; show_up: number | null; qualifies: number; non_qualifies: number; vendus: number;
  ca: number; commission_base: number; avg_h: number | null; perdus: number };
type Funnel = { stage: string; n: number };
type Pod = { clipper_id: string; clipper_name: string; avatar_url: string | null; setter_id: string | null; setter_name: string | null; is_active: boolean };
type Opt = { id: string; name: string };

const SOURCES: { v: string; l: string; e: string }[] = [
  { v: "inbound", l: "Inbound", e: "🔥" },
  { v: "chaud", l: "Chaud", e: "🌡️" },
  { v: "froid", l: "Froid", e: "❄️" },
];
const srcOf = (v: string) => SOURCES.find((s) => s.v === v) || SOURCES[0];

const STAGES: { v: string; l: string; c: string; cold?: boolean }[] = [
  { v: "nouveau", l: "Nouveau", c: "#9b8fd0" },
  { v: "en_convo", l: "En convo", c: "#FFB23E" },
  { v: "pret_appel", l: "Prêt pour appel", c: "#35E6A1" },
  { v: "rdv_pris", l: "RDV pris", c: "#8B6CFF" },
  { v: "rdv_honore", l: "RDV honoré", c: "#2DE2E6" },
  { v: "vendu", l: "Vendu", c: "#F5C451" },
  { v: "perdu", l: "Perdu", c: "#6b6478" },
  { v: "contacte", l: "Contacté", c: "#7aa2c4", cold: true },
  { v: "repondu", l: "A répondu", c: "#FF6A45", cold: true },
  { v: "whatsapp", l: "Dans WhatsApp", c: "#25D366", cold: true },
];
const stageOf = (v: string) => STAGES.find((s) => s.v === v) || STAGES[1];
const euro = (n: number) => (n || 0).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";
const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n)}%`);

function agoLabel(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 3600) return Math.max(1, Math.round(d / 60)) + " min";
  if (d < 86400) return Math.round(d / 3600) + " h";
  return Math.round(d / 86400) + " j";
}

export default function Setter({ isStaff, userName, userAvatar }: { isStaff: boolean; userName: string; userAvatar?: string | null }) {
  const db = getSupabase();
  const { bookingUrl, whatsappGroupUrl, coldScript, commissionPct } = useSettings();
  const [view, setView] = useState<"pipe" | "setters" | "pods">("pipe");
  const [temp, setTemp] = useState<"all" | "inbound" | "chaud" | "froid">("all");
  const [rows, setRows] = useState<Prospect[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [board, setBoard] = useState<SetterRow[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [funnel, setFunnel] = useState<Funnel[]>([]);
  const [pods, setPods] = useState<Pod[]>([]);
  const [setters, setSetters] = useState<Opt[]>([]);
  const [clippers, setClippers] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [add, setAdd] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [edit, setEdit] = useState<Prospect | null>(null);
  const [detail, setDetail] = useState<SetterRow | null>(null);
  const [detailRows, setDetailRows] = useState<Prospect[]>([]);
  const [myNote, setMyNote] = useState("");

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2600); };

  const load = useCallback(async () => {
    setLoading(true);
    const [p, s, c] = await Promise.all([
      db.rpc("setter_prospects"),
      db.rpc("setter_stats"),
      db.rpc("my_pod_clippers"),
    ]);
    setRows((p.data as Prospect[]) || []);
    setStats(((s.data as Stats[]) || [])[0] || { en_convo: 0, pret_appel: 0, rdv: 0, vendus: 0, ca: 0, froid_contacte: 0, froid_repondu: 0, froid_whatsapp: 0, qualifies: 0 });
    setClippers((c.data as Opt[]) || []);
    if (!isStaff) {
      const n = await db.rpc("my_coach_note");
      setMyNote((n.data as string) || "");
    }
    if (isStaff) {
      const [b, pd, st, ov, fn] = await Promise.all([
        db.rpc("admin_setters"), db.rpc("admin_pods"), db.rpc("list_setters"),
        db.rpc("admin_overview", { p_setter: null }), db.rpc("admin_funnel", { p_setter: null }),
      ]);
      setBoard((b.data as SetterRow[]) || []);
      setPods((pd.data as Pod[]) || []);
      setSetters((st.data as Opt[]) || []);
      setOverview(((ov.data as Overview[]) || [])[0] || null);
      setFunnel((fn.data as Funnel[]) || []);
    }
    setLoading(false);
  }, [db, isStaff]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const h = () => setAdd(true);
    window.addEventListener("cw-add-prospect", h);
    return () => window.removeEventListener("cw-add-prospect", h);
  }, []);

  async function assign(clipperId: string, setterId: string) {
    await db.rpc("assign_setter", { p_clipper: clipperId, p_setter: setterId || null });
    flash("Pod mis à jour");
    load();
  }
  async function openDetail(s: SetterRow) {
    const { data } = await db.rpc("admin_setter_prospects", { p_setter: s.setter_id });
    setDetailRows((data as Prospect[]) || []);
    setDetail(s);
  }
  async function toggleActive(userId: string, active: boolean, label: string) {
    if (!active && !confirm(`Désactiver ${label} ? Son historique est conservé, il ne pourra plus se connecter. Réversible.`)) return;
    await db.rpc("set_user_active", { p_user: userId, p_active: active });
    flash(active ? "Réactivé ✓" : "Désactivé");
    load();
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 4 }}>
        <Avatar url={userAvatar} name={userName} size={42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="display" style={{ fontSize: 17, fontStyle: "italic" }}>{isStaff ? "Pilotage · Setters" : userName}</div>
          <div style={{ fontSize: 11, color: "var(--mut)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>
            {isStaff ? "Keyan supervise" : "Setter"}
          </div>
        </div>
        {!isStaff && stats && (
          <div className="gold" style={{ fontWeight: 800, fontStyle: "italic", fontSize: 16 }}>{euro(stats.ca)}</div>
        )}
      </div>

      {isStaff && (
        <div className="role" style={{ marginTop: 12 }}>
          <button className={view === "pipe" ? "on" : ""} onClick={() => setView("pipe")}>Conversations</button>
          <button className={view === "setters" ? "on" : ""} onClick={() => setView("setters")}>Setters</button>
          <button className={view === "pods" ? "on" : ""} onClick={() => setView("pods")}>Pods</button>
        </div>
      )}

      {/* ───────── PIPELINE ───────── */}
      {view === "pipe" && (
        <>
          {!isStaff && myNote && (
            <div className="card" style={{ marginTop: 12, background: "linear-gradient(150deg,rgba(139,108,255,.14),rgba(45,226,230,.05)),var(--surf)", borderColor: "rgba(139,108,255,.3)" }}>
              <div style={{ fontSize: 10, color: "#8B6CFF", textTransform: "uppercase", letterSpacing: 1, fontWeight: 800, marginBottom: 4 }}>💬 Note de Keyan</div>
              <div style={{ fontSize: 13, color: "var(--text)", whiteSpace: "pre-wrap" }}>{myNote}</div>
            </div>
          )}
          {stats && (
            <div className="stats" style={{ marginTop: 12 }}>
              <div className="stat"><div className="v">{stats.en_convo}</div><div className="l">en convo</div></div>
              <div className="stat" style={{ borderColor: "rgba(53,230,161,.3)" }}><div className="v" style={{ color: "#35E6A1" }}>{stats.pret_appel}</div><div className="l">prêt appel</div></div>
              <div className="stat"><div className="v">{stats.rdv}</div><div className="l">rdv</div></div>
              <div className="stat" style={{ borderColor: "rgba(245,196,81,.3)" }}><div className="v gold">{stats.vendus}</div><div className="l">vendus</div></div>
            </div>
          )}
          {stats && (stats.froid_contacte + stats.froid_repondu + stats.froid_whatsapp) > 0 && (
            <div className="stats" style={{ marginTop: 8 }}>
              <div className="stat"><div className="v" style={{ fontSize: 16 }}>{stats.froid_contacte}</div><div className="l">❄️ contactés</div></div>
              <div className="stat" style={{ borderColor: "rgba(255,106,69,.35)" }}><div className="v" style={{ color: "#FF6A45", fontSize: 16 }}>{stats.froid_repondu}</div><div className="l">💬 ont répondu</div></div>
              <div className="stat" style={{ borderColor: "rgba(37,211,102,.35)" }}><div className="v" style={{ color: "#25D366", fontSize: 16 }}>{stats.froid_whatsapp}</div><div className="l">✅ WhatsApp</div></div>
            </div>
          )}

          {/* filtre par source */}
          <div className="role" style={{ marginTop: 12 }}>
            <button className={temp === "all" ? "on" : ""} onClick={() => setTemp("all")}>Tout</button>
            <button className={temp === "inbound" ? "on" : ""} onClick={() => setTemp("inbound")}>🔥</button>
            <button className={temp === "chaud" ? "on" : ""} onClick={() => setTemp("chaud")}>🌡️</button>
            <button className={temp === "froid" ? "on" : ""} onClick={() => setTemp("froid")}>❄️</button>
          </div>

          <div className="sec-h" style={{ marginTop: 14 }}><h2>{temp === "froid" ? "Outbound froid" : temp === "chaud" ? "Prospection chaude" : temp === "inbound" ? "Leads inbound" : "Pipeline"}</h2></div>

          {(() => {
            const list = rows.filter((p) => temp === "all" ? true : p.source === temp);
            if (loading) return <div className="card"><div className="empty">Chargement…</div></div>;
            if (list.length === 0) return <div className="card"><div className="empty">{temp === "froid" ? "Aucun froid. Ajoute ta liste du jour 👇" : "Rien ici pour l'instant."}</div></div>;
            return list.map((p) => {
              const st = stageOf(p.stage);
              const src = srcOf(p.source);
              return (
                <div key={p.id} className="card press" onClick={() => setEdit(p)}
                  style={{ display: "flex", flexDirection: "column", gap: 6, cursor: "pointer", marginBottom: 9, borderColor: p.stage === "repondu" ? "rgba(255,106,69,.45)" : p.stale ? "rgba(255,106,69,.3)" : p.stage === "pret_appel" ? "rgba(53,230,161,.35)" : p.stage === "whatsapp" ? "rgba(37,211,102,.3)" : undefined }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11 }}>{src.e}</span>
                    <span style={{ fontWeight: 800, fontSize: 14 }}>@{p.handle}</span>
                    {p.qualified === "oui" && <span style={{ fontSize: 11 }}>✓</span>}
                    {p.stale && p.stage !== "repondu"
                      ? <span className="sticker" style={{ background: "#FF6A45", transform: "none" }}>🔴 relance{p.relance_count ? ` ×${p.relance_count}` : ""} · {agoLabel(p.last_activity_at)}</span>
                      : <span style={{ fontSize: 9, fontWeight: 900, fontStyle: "italic", textTransform: "uppercase", letterSpacing: .5, padding: "3px 8px", borderRadius: 6, color: st.v === "whatsapp" ? "#fff" : "#0a0610", background: st.c }}>{st.l}</span>}
                    <span style={{ marginLeft: "auto", color: "var(--mut)", fontSize: 16 }}>✏️</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--mut)" }}>
                    {p.source === "inbound" ? (p.clipper_name ? <>clip <b style={{ color: "var(--coral)" }}>{p.clipper_name}</b></> : "origine ?") : <i>{src.l.toLowerCase()}</i>}
                    {p.platform ? <> · {p.platform}</> : ""}
                    {p.budget ? <> · 💰 {p.budget}</> : ""}
                    {p.interet ? <> · {p.interet}</> : (p.need ? <> · {p.need}</> : "")}
                    {p.stage === "vendu" && p.sale_amount ? <> · <b style={{ color: "var(--text)" }}>{euro(p.sale_amount)}</b></> : ""}
                    {p.stage === "perdu" && p.lost_reason ? <> · ✕ {p.lost_reason}</> : ""}
                    {p.rdv_at ? <> · RDV {new Date(p.rdv_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</> : ""}
                  </div>
                </div>
              );
            });
          })()}

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button className="btn btn-gh" style={{ flex: 1, padding: 13, borderStyle: "dashed" }} onClick={() => setAdd(true)}>+ Prospect</button>
            <button className="btn btn-gh" style={{ flex: 1, padding: 13, borderStyle: "dashed", borderColor: "rgba(120,162,196,.4)" }} onClick={() => setBulk(true)}>❄️ Ajouter en lot</button>
          </div>
        </>
      )}

      {/* ───────── SETTERS (staff) ───────── */}
      {view === "setters" && isStaff && (
        <>
          {/* vue d'ensemble (data conversation + perf, tout auto-calculé) */}
          {overview && (
            <>
              <div className="sec-h" style={{ marginTop: 14 }}><h2>Vue d&apos;ensemble</h2></div>
              <div className="stats">
                <div className="stat"><div className="v">{pct(overview.taux_reponse)}</div><div className="l">taux réponse</div></div>
                <div className="stat" style={{ borderColor: "rgba(53,230,161,.3)" }}><div className="v" style={{ color: "#35E6A1" }}>{pct(overview.show_up)}</div><div className="l">show-up</div></div>
                <div className="stat"><div className="v">{overview.rdv_booked}</div><div className="l">rdv bookés</div></div>
                <div className="stat" style={{ borderColor: "rgba(245,196,81,.3)" }}><div className="v gold">{overview.vendus}</div><div className="l">ventes</div></div>
              </div>
              <div className="card" style={{ marginTop: 9, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <Kpi label="CA généré" value={euro(overview.ca)} gold />
                <Kpi label={`Commission (${commissionPct}%)`} value={euro(overview.commission_base * commissionPct / 100)} />
                <Kpi label="Tps moyen → RDV" value={overview.avg_h != null ? `${overview.avg_h} h` : "—"} />
                <Kpi label="Qualifiés" value={`${overview.qualifies}/${overview.qualifies + overview.non_qualifies}`} />
              </div>
            </>
          )}

          {/* funnel complet */}
          {funnel.length > 0 && (() => {
            const order = ["contacte", "repondu", "en_convo", "pret_appel", "rdv_pris", "rdv_honore", "vendu"];
            const ord = order.map((k) => funnel.find((f) => f.stage === k)).filter(Boolean) as Funnel[];
            const max = Math.max(1, ...ord.map((f) => f.n));
            return (
              <>
                <div className="sec-h" style={{ marginTop: 16 }}><h2>Funnel complet</h2></div>
                <div className="card">
                  {ord.map((f) => (
                    <div key={f.stage} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                      <div style={{ width: 96, fontSize: 11, color: "var(--mut)", textTransform: "uppercase", letterSpacing: .3, fontWeight: 700 }}>{stageOf(f.stage).l}</div>
                      <div style={{ flex: 1, height: 18, background: "var(--bg2)", borderRadius: 6, overflow: "hidden" }}>
                        <div style={{ width: `${Math.max(4, (f.n / max) * 100)}%`, height: "100%", background: stageOf(f.stage).c, borderRadius: 6 }} />
                      </div>
                      <div style={{ width: 28, textAlign: "right", fontWeight: 800, fontStyle: "italic" }}>{f.n}</div>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}

          {/* classement des setters */}
          <div className="sec-h" style={{ marginTop: 16 }}><h2>Classement des setters</h2></div>
          {board.length === 0 ? <div className="card"><div className="empty">Aucun setter. Promeus un membre (Supabase → profiles → role = setter).</div></div>
            : board.map((s, i) => (
              <div key={s.setter_id} className="card press" onClick={() => openDetail(s)} style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 9, cursor: "pointer", opacity: s.is_active ? 1 : .55 }}>
                <div style={{ fontWeight: 900, fontStyle: "italic", color: i === 0 ? "#F5C451" : "var(--mut)", width: 18 }}>{i + 1}</div>
                <Avatar url={s.avatar_url} name={s.name} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{s.name}{!s.is_active && <span style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", color: "#FF6A45", marginLeft: 6 }}>désactivé</span>}</div>
                  <div style={{ fontSize: 11, color: "var(--mut)", fontWeight: 700 }}>{s.clippers} clip · {pct(s.taux_reponse)} rép · {pct(s.show_up)} show-up</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="gold" style={{ fontWeight: 800, fontStyle: "italic" }}>{euro(s.ca)}</div>
                  <div style={{ fontSize: 11, color: "var(--mut)" }}>{s.rdv_booked} rdv · {s.vendus} vendus</div>
                </div>
                <span style={{ color: "var(--mut)", fontSize: 18 }}>›</span>
              </div>
            ))}
        </>
      )}

      {/* ───────── PODS (staff) ───────── */}
      {view === "pods" && isStaff && (
        <>
          <div className="sec-h" style={{ marginTop: 14 }}><h2>Pods · clipper → setter</h2></div>
          {pods.length === 0 ? <div className="card"><div className="empty">Aucun clipper.</div></div>
            : pods.map((c) => (
              <div key={c.clipper_id} className="card" style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 8, opacity: c.is_active ? 1 : .55 }}>
                <Avatar url={c.avatar_url} name={c.clipper_name} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{c.clipper_name}{!c.is_active && <span style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", color: "#FF6A45", marginLeft: 6 }}>désactivé</span>}</div>
                </div>
                {c.is_active ? (
                  <>
                    <select value={c.setter_id || ""} onChange={(e) => assign(c.clipper_id, e.target.value)}
                      style={{ background: "var(--bg2)", color: "var(--text)", border: "1px solid var(--line2)", borderRadius: 10, padding: "9px 10px", fontSize: 13, fontFamily: "inherit", maxWidth: 130 }}>
                      <option value="">— aucun —</option>
                      {setters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button className="btn btn-gh" style={{ padding: "8px 9px", fontSize: 11 }} onClick={() => toggleActive(c.clipper_id, false, c.clipper_name)}>🚫</button>
                  </>
                ) : (
                  <button className="btn btn-gh" style={{ padding: "8px 11px", fontSize: 12, color: "#35E6A1", borderColor: "rgba(53,230,161,.4)" }} onClick={() => toggleActive(c.clipper_id, true, c.clipper_name)}>Réactiver</button>
                )}
              </div>
            ))}
        </>
      )}

      {add && <AddModal clippers={clippers} onClose={() => setAdd(false)} onDone={() => { setAdd(false); flash("Prospect ajouté ✨"); load(); }} />}
      {bulk && <BulkModal coldScript={coldScript} whatsappGroupUrl={whatsappGroupUrl} onClose={() => setBulk(false)} onDone={(n) => { setBulk(false); flash(n); load(); }} />}
      {edit && <EditModal p={edit} isStaff={isStaff} bookingUrl={bookingUrl} coldScript={coldScript} whatsappGroupUrl={whatsappGroupUrl} onClose={() => setEdit(null)} onDone={() => { setEdit(null); flash("Mis à jour ✓"); load(); }} />}
      {detail && <SetterDetail s={detail} rows={detailRows} onOpenProspect={(p) => setEdit(p)} onToggleActive={() => { toggleActive(detail.setter_id, !detail.is_active, detail.name); setDetail(null); }} onClose={() => setDetail(null)} onSaved={flash} />}
      {toast && <div className="cw-toast">{toast}</div>}
    </>
  );
}

function SetterDetail({ s, rows, onOpenProspect, onToggleActive, onClose, onSaved }: { s: SetterRow; rows: Prospect[]; onOpenProspect: (p: Prospect) => void; onToggleActive: () => void; onClose: () => void; onSaved: (m: string) => void }) {
  const db = getSupabase();
  const [note, setNote] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    (async () => {
      const { data } = await db.from("profiles").select("coach_note").eq("id", s.setter_id).single();
      setNote((data as { coach_note?: string } | null)?.coach_note || "");
      setLoaded(true);
    })();
  }, [db, s.setter_id]);
  async function saveNote() {
    setBusy(true);
    await db.rpc("set_coach_note", { p_setter: s.setter_id, p_note: note });
    setBusy(false); onSaved("Commentaire envoyé au setter 💬");
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 210, background: "rgba(6,5,12,.82)", backdropFilter: "blur(4px)", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, margin: "0 auto", minHeight: "100%", background: "var(--bg)", padding: "16px 14px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
          <button className="btn btn-gh" style={{ padding: "6px 12px" }} onClick={onClose}>← Retour</button>
          <Avatar url={s.avatar_url} name={s.name} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="display" style={{ fontSize: 18, fontStyle: "italic" }}>{s.name}</div>
            <div style={{ fontSize: 11, color: "var(--mut)", fontWeight: 700 }}>{s.clippers} clippers · {s.contacted} contacts</div>
          </div>
          <div className="gold" style={{ fontWeight: 800, fontStyle: "italic" }}>{euro(s.ca)}</div>
        </div>

        <div className="stats">
          <div className="stat"><div className="v">{pct(s.taux_reponse)}</div><div className="l">taux rép.</div></div>
          <div className="stat" style={{ borderColor: "rgba(53,230,161,.3)" }}><div className="v" style={{ color: "#35E6A1" }}>{pct(s.show_up)}</div><div className="l">show-up</div></div>
          <div className="stat"><div className="v">{s.rdv_booked}</div><div className="l">rdv</div></div>
          <div className="stat" style={{ borderColor: "rgba(245,196,81,.3)" }}><div className="v gold">{s.vendus}</div><div className="l">vendus</div></div>
        </div>

        <div className="sec-h" style={{ marginTop: 16 }}><h2>💬 Commentaire de coaching</h2></div>
        <div className="card">
          <textarea className="fld" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={loaded ? "Ex : pense à relancer plus vite les leads chauds, ton script froid est trop long…" : "Chargement…"} style={{ width: "100%" }} />
          <div style={{ fontSize: 11, color: "var(--mut)", margin: "2px 0 8px" }}>Le setter verra ce message en haut de son écran.</div>
          <button className="btn btn-pri" style={{ width: "100%", padding: 11 }} disabled={busy} onClick={saveNote}>{busy ? "…" : "Envoyer au setter"}</button>
        </div>

        <div className="sec-h" style={{ marginTop: 16 }}><h2>Toute son activité ({rows.length})</h2></div>
        {rows.length === 0 ? <div className="card"><div className="empty">Aucun prospect pour ce setter.</div></div>
          : rows.map((p) => {
            const st = stageOf(p.stage); const src = srcOf(p.source);
            return (
              <div key={p.id} className="card press" onClick={() => onOpenProspect(p)} style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 8, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontSize: 11 }}>{src.e}</span>
                  <span style={{ fontWeight: 800, fontSize: 14 }}>@{p.handle}</span>
                  {p.qualified === "oui" && <span style={{ fontSize: 11 }}>✓</span>}
                  <span style={{ fontSize: 9, fontWeight: 900, fontStyle: "italic", textTransform: "uppercase", letterSpacing: .5, padding: "3px 8px", borderRadius: 6, color: st.v === "whatsapp" ? "#fff" : "#0a0610", background: st.c }}>{st.l}</span>
                  {p.relance_count > 0 && <span style={{ fontSize: 10, color: "var(--mut)" }}>🔄{p.relance_count}</span>}
                  <span style={{ marginLeft: "auto", color: "var(--mut)", fontSize: 13 }}>il y a {agoLabel(p.last_activity_at)}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--mut)" }}>
                  {p.source === "inbound" ? (p.clipper_name ? <>clip <b style={{ color: "var(--coral)" }}>{p.clipper_name}</b></> : "origine ?") : <i>{src.l.toLowerCase()}</i>}
                  {p.platform ? <> · {p.platform}</> : ""}{p.budget ? <> · 💰{p.budget}</> : ""}
                  {p.interet ? <> · {p.interet}</> : (p.need ? <> · {p.need}</> : "")}
                  {p.stage === "vendu" && p.sale_amount ? <> · <b style={{ color: "var(--text)" }}>{euro(p.sale_amount)}</b></> : ""}
                  {p.stage === "perdu" && p.lost_reason ? <> · ✕ {p.lost_reason}</> : ""}
                </div>
                {p.note && <div style={{ fontSize: 12, color: "var(--text)", background: "var(--bg2)", borderRadius: 8, padding: "6px 9px", marginTop: 2 }}>📝 {p.note}</div>}
              </div>
            );
          })}

        <button className="btn btn-gh" style={{ width: "100%", marginTop: 18, padding: 12, color: s.is_active ? "#FF6A45" : "#35E6A1", borderColor: s.is_active ? "rgba(255,106,69,.4)" : "rgba(53,230,161,.4)" }} onClick={onToggleActive}>
          {s.is_active ? "🚫 Désactiver ce setter" : "Réactiver ce setter"}
        </button>
      </div>
    </div>
  );
}

/* ───────── Modales ───────── */
function Kpi({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div style={{ minWidth: 68 }}>
      <div className={gold ? "gold" : ""} style={{ fontWeight: 800, fontStyle: "italic", fontSize: 15 }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--mut)", textTransform: "uppercase", letterSpacing: .4, fontWeight: 700, marginTop: 1 }}>{label}</div>
    </div>
  );
}

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(6,5,12,.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, background: "var(--surf)", border: "1px solid var(--line2)", borderRadius: "20px 20px 0 0", padding: 18, maxHeight: "86vh", overflowY: "auto" }}>
        {children}
      </div>
    </div>
  );
}

function AddModal({ clippers, onClose, onDone }: { clippers: Opt[]; onClose: () => void; onDone: () => void }) {
  const db = getSupabase();
  const [handle, setHandle] = useState("");
  const [source, setSource] = useState("inbound");
  const [clipper, setClipper] = useState(clippers[0]?.id || "");
  const [need, setNeed] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!handle.trim()) return;
    setBusy(true);
    await db.rpc("add_prospect", { p_handle: handle, p_clipper: source === "inbound" ? (clipper || null) : null, p_need: need, p_source: source });
    setBusy(false); onDone();
  }
  return (
    <Backdrop onClose={onClose}>
      <h3 style={{ margin: "0 0 14px", fontStyle: "italic" }}>Ajouter un prospect</h3>
      <label className="fld-l">Source</label>
      <div className="role" style={{ margin: "0 0 10px" }}>
        {SOURCES.map((s) => <button key={s.v} className={source === s.v ? "on" : ""} onClick={() => setSource(s.v)}>{s.e} {s.l}</button>)}
      </div>
      <label className="fld-l">Pseudo Instagram</label>
      <input className="fld" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@marco_b" autoFocus />
      {source === "inbound" && (
        <>
          <label className="fld-l">Vient de quel clipper</label>
          <select className="fld" value={clipper} onChange={(e) => setClipper(e.target.value)}>
            <option value="">— inconnu —</option>
            {clippers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </>
      )}
      <label className="fld-l">Son besoin (optionnel)</label>
      <input className="fld" value={need} onChange={(e) => setNeed(e.target.value)} placeholder="veut lancer un SaaS…" />
      <button className="btn btn-pri" style={{ width: "100%", marginTop: 14, padding: 13 }} disabled={busy || !handle.trim()} onClick={save}>{busy ? "…" : "Ajouter"}</button>
    </Backdrop>
  );
}

function BulkModal({ coldScript, whatsappGroupUrl, onClose, onDone }: { coldScript: string; whatsappGroupUrl: string; onClose: () => void; onDone: (msg: string) => void }) {
  const db = getSupabase();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const handles = text.split(/[\n,;\s]+/).map((x) => x.trim()).filter(Boolean);
  const fullScript = whatsappGroupUrl ? `${coldScript}\n${whatsappGroupUrl}` : coldScript;
  async function copyScript() {
    try { await navigator.clipboard.writeText(fullScript); onDone("Script copié 📋"); }
    catch { alert(fullScript); }
  }
  async function save() {
    if (handles.length === 0) return;
    setBusy(true);
    const { data } = await db.rpc("add_prospects_bulk", { p_handles: handles, p_source: "froid" });
    setBusy(false);
    const r = (data || {}) as { added?: number; skipped?: number };
    onDone(`${r.added || 0} ajoutés · ${r.skipped || 0} doublons ignorés`);
  }
  return (
    <Backdrop onClose={onClose}>
      <h3 style={{ margin: "0 0 4px", fontStyle: "italic" }}>❄️ Ajouter des froids en lot</h3>
      <div style={{ fontSize: 12, color: "var(--mut)", marginBottom: 12 }}>Colle ta liste de pseudos (un par ligne, ou séparés par une virgule). Les @ et doublons sont nettoyés automatiquement.</div>

      <div style={{ background: "rgba(37,211,102,.08)", border: "1px solid rgba(37,211,102,.25)", borderRadius: 12, padding: 11, marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "var(--mut)", textTransform: "uppercase", letterSpacing: .5, fontWeight: 700, marginBottom: 5 }}>Ton message d&apos;approche</div>
        <div style={{ fontSize: 12.5, color: "var(--text)", whiteSpace: "pre-wrap", marginBottom: 8 }}>{fullScript}</div>
        <button className="btn" style={{ width: "100%", padding: 9, background: "#25D366", color: "#062b15", fontWeight: 800, fontSize: 13 }} onClick={copyScript}>📋 Copier le script</button>
        {!whatsappGroupUrl && <div style={{ fontSize: 10.5, color: "var(--coral)", marginTop: 5 }}>Ajoute le lien WhatsApp dans Réglages (Vue admin) pour qu&apos;il soit inclus.</div>}
      </div>

      <label className="fld-l">Pseudos {handles.length > 0 ? `(${handles.length} détectés)` : ""}</label>
      <textarea className="fld" value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={"trader_paul\nhustle.max\n@money_mike"} autoFocus />
      <button className="btn btn-pri" style={{ width: "100%", marginTop: 10, padding: 13 }} disabled={busy || handles.length === 0} onClick={save}>{busy ? "…" : `Créer ${handles.length} fiche${handles.length > 1 ? "s" : ""} froide${handles.length > 1 ? "s" : ""}`}</button>
    </Backdrop>
  );
}

function ConversationLog({ prospectId }: { prospectId: number }) {
  const db = getSupabase();
  type Msg = { id: number; direction: string; body: string; author_name: string | null; created_at: string };
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [body, setBody] = useState("");
  const [dir, setDir] = useState<"out" | "in" | "note">("out");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const reload = React.useCallback(async () => {
    const { data } = await db.rpc("list_messages", { p_prospect: prospectId });
    setMsgs((data as Msg[]) || []); setLoaded(true);
  }, [db, prospectId]);
  useEffect(() => { reload(); }, [reload]);
  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    await db.rpc("add_message", { p_prospect: prospectId, p_direction: dir, p_body: body });
    setBody(""); setBusy(false); reload();
  }
  const stylesFor = (d: string) =>
    d === "out" ? { alignSelf: "flex-end", background: "linear-gradient(120deg,#8B6CFF,#6a4fd0)", color: "#fff" }
    : d === "in" ? { alignSelf: "flex-start", background: "var(--bg2)", color: "var(--text)" }
    : { alignSelf: "center", background: "transparent", color: "var(--mut)", fontStyle: "italic", fontSize: 11.5, border: "1px dashed var(--line2)" };
  return (
    <div style={{ marginBottom: 12 }}>
      <label className="fld-l">Conversation</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 230, overflowY: "auto", padding: "4px 2px 8px" }}>
        {!loaded ? <div style={{ fontSize: 12, color: "var(--mut)" }}>…</div>
          : msgs.length === 0 ? <div style={{ fontSize: 12, color: "var(--mut)" }}>Aucun échange noté. Garde une trace de ce qui se dit 👇</div>
            : msgs.map((m) => (
              <div key={m.id} style={{ maxWidth: "82%", padding: "7px 11px", borderRadius: 13, fontSize: 13, whiteSpace: "pre-wrap", ...stylesFor(m.direction) }}>
                {m.direction === "note" ? "📝 " : ""}{m.body}
                <div style={{ fontSize: 9, opacity: .6, marginTop: 3 }}>{new Date(m.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            ))}
      </div>
      <div className="role" style={{ margin: "4px 0" }}>
        <button className={dir === "out" ? "on" : ""} onClick={() => setDir("out")}>Moi →</button>
        <button className={dir === "in" ? "on" : ""} onClick={() => setDir("in")}>← Lui</button>
        <button className={dir === "note" ? "on" : ""} onClick={() => setDir("note")}>📝 Note</button>
      </div>
      <div style={{ display: "flex", gap: 7 }}>
        <input className="fld" style={{ flex: 1, marginBottom: 0 }} value={body} onChange={(e) => setBody(e.target.value)} placeholder={dir === "in" ? "Ce qu'il a répondu…" : dir === "note" ? "Note interne…" : "Ce que tu as envoyé…"} onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
        <button className="btn btn-pri" style={{ padding: "0 16px" }} disabled={busy || !body.trim()} onClick={send}>↑</button>
      </div>
    </div>
  );
}

function EditModal({ p, isStaff, bookingUrl, coldScript, whatsappGroupUrl, onClose, onDone }: { p: Prospect; isStaff: boolean; bookingUrl: string; coldScript: string; whatsappGroupUrl: string; onClose: () => void; onDone: () => void }) {
  const db = getSupabase();
  const [stage, setStage] = useState(p.stage);
  const [need, setNeed] = useState(p.need || "");
  const [note, setNote] = useState(p.note || "");
  const [sale, setSale] = useState(p.sale_amount ? String(p.sale_amount) : "");
  const [platform, setPlatform] = useState(p.platform || "");
  const [budget, setBudget] = useState(p.budget || "");
  const [interet, setInteret] = useState(p.interet || "");
  const [qualified, setQualified] = useState(p.qualified || "");
  const [lost, setLost] = useState(p.lost_reason || "");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    await db.rpc("update_prospect", {
      p_id: p.id, p_stage: stage, p_need: need, p_note: note,
      p_sale: isStaff && stage === "vendu" && sale ? Number(sale) : null,
      p_platform: platform, p_budget: budget, p_interet: interet,
      p_qualified: qualified || null, p_lost_reason: stage === "perdu" ? lost : null,
    });
    setBusy(false); onDone();
  }
  async function bookRdv() {
    if (!bookingUrl) { alert("Ajoute le lien de prise de RDV dans Réglages (Vue admin)."); return; }
    const sep = bookingUrl.includes("?") ? "&" : "?";
    const url = `${bookingUrl}${sep}name=${encodeURIComponent("@" + p.handle)}`;
    window.open(url, "_blank");
    setBusy(true);
    await db.rpc("update_prospect", { p_id: p.id, p_stage: "rdv_pris" });
    setBusy(false); onDone();
  }
  async function quickStage(st: string) {
    setBusy(true);
    await db.rpc("update_prospect", { p_id: p.id, p_stage: st });
    setBusy(false); onDone();
  }
  async function relance() {
    setBusy(true);
    await db.rpc("bump_relance", { p_id: p.id });
    setBusy(false); onDone();
  }
  async function copyCold() {
    const full = whatsappGroupUrl ? `${coldScript}\n${whatsappGroupUrl}` : coldScript;
    try { await navigator.clipboard.writeText(full); alert("Script copié 📋"); } catch { alert(full); }
  }
  const cold = p.source === "froid";
  const src = srcOf(p.source);
  return (
    <Backdrop onClose={onClose}>
      <h3 style={{ margin: "0 0 4px", fontStyle: "italic" }}>{src.e} @{p.handle}</h3>
      <div style={{ fontSize: 12, color: "var(--mut)", marginBottom: 14 }}>
        {p.source === "inbound" ? (p.clipper_name ? `clip ${p.clipper_name}` : "origine inconnue") : src.l.toLowerCase()}
        {p.relance_count ? ` · ${p.relance_count} relance${p.relance_count > 1 ? "s" : ""}` : ""}
      </div>

      {cold && (
        <div style={{ display: "flex", gap: 7, marginBottom: 12, flexWrap: "wrap" }}>
          <button className="btn" style={{ flex: "1 1 100%", padding: 10, background: "#25D366", color: "#062b15", fontWeight: 800, fontSize: 13 }} onClick={copyCold}>📋 Copier le script + lien WhatsApp</button>
          <button className="btn btn-gh" style={{ flex: 1, padding: 9, fontSize: 12 }} disabled={busy} onClick={() => quickStage("repondu")}>💬 A répondu</button>
          <button className="btn btn-gh" style={{ flex: 1, padding: 9, fontSize: 12, borderColor: "rgba(37,211,102,.4)", color: "#25D366" }} disabled={busy} onClick={() => quickStage("whatsapp")}>✅ Dans WhatsApp</button>
        </div>
      )}
      {!cold && (
        <button className="btn" style={{ width: "100%", marginBottom: 10, padding: 12, background: "linear-gradient(120deg,#8B6CFF,#2DE2E6)", color: "#0a0610", fontWeight: 800 }} disabled={busy} onClick={bookRdv}>📅 Caler le RDV (ouvre l&apos;agenda)</button>
      )}
      <button className="btn btn-gh" style={{ width: "100%", marginBottom: 14, padding: 10, fontSize: 13 }} disabled={busy} onClick={relance}>🔄 J&apos;ai relancé (+1)</button>

      <ConversationLog prospectId={p.id} />

      <label className="fld-l">Stade</label>
      <select className="fld" value={stage} onChange={(e) => setStage(e.target.value)}>
        {STAGES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
      </select>

      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label className="fld-l">Plateforme</label>
          <select className="fld" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="">—</option><option value="Instagram">Instagram</option><option value="TikTok">TikTok</option><option value="Autre">Autre</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label className="fld-l">Budget</label>
          <input className="fld" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="500-1k…" />
        </div>
      </div>

      <label className="fld-l">Intérêt / besoin</label>
      <input className="fld" value={interet} onChange={(e) => setInteret(e.target.value)} placeholder="veut lancer un SaaS…" />

      <label className="fld-l">Qualifié ?</label>
      <div className="role" style={{ margin: "0 0 4px" }}>
        <button className={qualified === "oui" ? "on" : ""} onClick={() => setQualified(qualified === "oui" ? "" : "oui")}>✓ Oui</button>
        <button className={qualified === "non" ? "on adm" : ""} onClick={() => setQualified(qualified === "non" ? "" : "non")}>✕ Non</button>
      </div>

      {stage === "perdu" && (
        <>
          <label className="fld-l">Raison du refus</label>
          <input className="fld" value={lost} onChange={(e) => setLost(e.target.value)} placeholder="pas le budget, pas le bon moment…" />
        </>
      )}

      <label className="fld-l">Note</label>
      <textarea className="fld" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="relancé le 12, attend une vidéo…" />
      {isStaff && stage === "vendu" && (
        <>
          <label className="fld-l">Montant de la vente (€)</label>
          <input className="fld" type="number" value={sale} onChange={(e) => setSale(e.target.value)} placeholder="3500" />
        </>
      )}
      {!isStaff && stage === "rdv_honore" && (
        <div style={{ fontSize: 11, color: "var(--mut)", marginTop: 6 }}>La vente sera validée par Keyan en fin d&apos;appel.</div>
      )}
      <button className="btn btn-pri" style={{ width: "100%", marginTop: 14, padding: 13 }} disabled={busy} onClick={save}>{busy ? "…" : "Enregistrer"}</button>
    </Backdrop>
  );
}
