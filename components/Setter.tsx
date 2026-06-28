"use client";
import React, { useEffect, useState, useCallback } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { Avatar } from "./ui";

type Prospect = {
  id: number; handle: string; clipper_id: string | null; clipper_name: string | null;
  need: string | null; stage: string; note: string | null; rdv_at: string | null;
  sale_amount: number | null; last_activity_at: string; stale: boolean;
};
type Stats = { en_convo: number; pret_appel: number; rdv: number; vendus: number; ca: number };
type SetterRow = { setter_id: string; name: string; avatar_url: string | null; clippers: number; en_convo: number; rdv: number; vendus: number; ca: number };
type Pod = { clipper_id: string; clipper_name: string; avatar_url: string | null; setter_id: string | null; setter_name: string | null };
type Opt = { id: string; name: string };

const STAGES: { v: string; l: string; c: string }[] = [
  { v: "nouveau", l: "Nouveau", c: "#9b8fd0" },
  { v: "en_convo", l: "En convo", c: "#FFB23E" },
  { v: "pret_appel", l: "Prêt pour appel", c: "#35E6A1" },
  { v: "rdv_pris", l: "RDV pris", c: "#8B6CFF" },
  { v: "rdv_honore", l: "RDV honoré", c: "#2DE2E6" },
  { v: "vendu", l: "Vendu", c: "#F5C451" },
  { v: "perdu", l: "Perdu", c: "#6b6478" },
];
const stageOf = (v: string) => STAGES.find((s) => s.v === v) || STAGES[1];
const euro = (n: number) => (n || 0).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";

function agoLabel(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 3600) return Math.max(1, Math.round(d / 60)) + " min";
  if (d < 86400) return Math.round(d / 3600) + " h";
  return Math.round(d / 86400) + " j";
}

export default function Setter({ isStaff, userName, userAvatar }: { isStaff: boolean; userName: string; userAvatar?: string | null }) {
  const db = getSupabase();
  const [view, setView] = useState<"pipe" | "setters" | "pods">("pipe");
  const [rows, setRows] = useState<Prospect[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [board, setBoard] = useState<SetterRow[]>([]);
  const [pods, setPods] = useState<Pod[]>([]);
  const [setters, setSetters] = useState<Opt[]>([]);
  const [clippers, setClippers] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [add, setAdd] = useState(false);
  const [edit, setEdit] = useState<Prospect | null>(null);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2600); };

  const load = useCallback(async () => {
    setLoading(true);
    const [p, s, c] = await Promise.all([
      db.rpc("setter_prospects"),
      db.rpc("setter_stats"),
      db.rpc("my_pod_clippers"),
    ]);
    setRows((p.data as Prospect[]) || []);
    setStats(((s.data as Stats[]) || [])[0] || { en_convo: 0, pret_appel: 0, rdv: 0, vendus: 0, ca: 0 });
    setClippers((c.data as Opt[]) || []);
    if (isStaff) {
      const [b, pd, st] = await Promise.all([db.rpc("admin_setters"), db.rpc("admin_pods"), db.rpc("list_setters")]);
      setBoard((b.data as SetterRow[]) || []);
      setPods((pd.data as Pod[]) || []);
      setSetters((st.data as Opt[]) || []);
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
          {stats && (
            <div className="stats" style={{ marginTop: 12 }}>
              <div className="stat"><div className="v">{stats.en_convo}</div><div className="l">en convo</div></div>
              <div className="stat" style={{ borderColor: "rgba(53,230,161,.3)" }}><div className="v" style={{ color: "#35E6A1" }}>{stats.pret_appel}</div><div className="l">prêt appel</div></div>
              <div className="stat"><div className="v">{stats.rdv}</div><div className="l">rdv</div></div>
              <div className="stat" style={{ borderColor: "rgba(245,196,81,.3)" }}><div className="v gold">{stats.vendus}</div><div className="l">vendus</div></div>
            </div>
          )}

          <div className="sec-h" style={{ marginTop: 16 }}><h2>Conversations</h2>
            <span className="more" onClick={() => setAdd(true)}>+ Ajouter</span></div>

          {loading ? <div className="card"><div className="empty">Chargement…</div></div>
            : rows.length === 0 ? <div className="card"><div className="empty">Aucune conversation. Ajoute ton premier prospect 👇</div></div>
              : rows.map((p) => {
                const st = stageOf(p.stage);
                return (
                  <div key={p.id} className="card press" onClick={() => setEdit(p)}
                    style={{ display: "flex", flexDirection: "column", gap: 6, cursor: "pointer", marginBottom: 9, borderColor: p.stale ? "rgba(255,106,69,.35)" : p.stage === "pret_appel" ? "rgba(53,230,161,.35)" : undefined }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 800, fontSize: 14 }}>@{p.handle}</span>
                      {p.stale
                        ? <span className="sticker" style={{ background: "#FF6A45", transform: "none" }}>🔴 à relancer · {agoLabel(p.last_activity_at)}</span>
                        : <span style={{ fontSize: 9, fontWeight: 900, fontStyle: "italic", textTransform: "uppercase", letterSpacing: .5, padding: "3px 8px", borderRadius: 6, color: "#0a0610", background: st.c }}>{st.l}</span>}
                      <span style={{ marginLeft: "auto", color: "var(--mut)", fontSize: 16 }}>✏️</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--mut)" }}>
                      {p.clipper_name ? <>clip <b style={{ color: "var(--coral)" }}>{p.clipper_name}</b></> : "origine ?"}
                      {p.need ? <> · {p.need}</> : ""}
                      {p.stage === "vendu" && p.sale_amount ? <> · <b style={{ color: "var(--text)" }}>{euro(p.sale_amount)}</b></> : ""}
                      {p.rdv_at ? <> · RDV {new Date(p.rdv_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</> : ""}
                    </div>
                  </div>
                );
              })}

          <button className="btn btn-gh" style={{ width: "100%", marginTop: 4, padding: 13, borderStyle: "dashed" }} onClick={() => setAdd(true)}>+ Ajouter un prospect</button>
        </>
      )}

      {/* ───────── SETTERS (staff) ───────── */}
      {view === "setters" && isStaff && (
        <>
          <div className="sec-h" style={{ marginTop: 14 }}><h2>Performance des setters</h2></div>
          {board.length === 0 ? <div className="card"><div className="empty">Aucun setter. Promeus un membre depuis « Équipe ».</div></div>
            : board.map((s) => (
              <div key={s.setter_id} className="card" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 9 }}>
                <Avatar url={s.avatar_url} name={s.name} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: "var(--mut)", textTransform: "uppercase", letterSpacing: .4, fontWeight: 700 }}>{s.clippers} clippers · {s.en_convo} en convo</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="gold" style={{ fontWeight: 800, fontStyle: "italic" }}>{euro(s.ca)}</div>
                  <div style={{ fontSize: 11, color: "var(--mut)" }}>{s.rdv} rdv · {s.vendus} vendus</div>
                </div>
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
              <div key={c.clipper_id} className="card" style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 8 }}>
                <Avatar url={c.avatar_url} name={c.clipper_name} size={36} />
                <div style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14 }}>{c.clipper_name}</div>
                <select value={c.setter_id || ""} onChange={(e) => assign(c.clipper_id, e.target.value)}
                  style={{ background: "var(--bg2)", color: "var(--text)", border: "1px solid var(--line2)", borderRadius: 10, padding: "9px 10px", fontSize: 13, fontFamily: "inherit", maxWidth: 150 }}>
                  <option value="">— aucun —</option>
                  {setters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            ))}
        </>
      )}

      {add && <AddModal clippers={clippers} onClose={() => setAdd(false)} onDone={() => { setAdd(false); flash("Prospect ajouté ✨"); load(); }} />}
      {edit && <EditModal p={edit} isStaff={isStaff} onClose={() => setEdit(null)} onDone={() => { setEdit(null); flash("Mis à jour ✓"); load(); }} />}
      {toast && <div className="cw-toast">{toast}</div>}
    </>
  );
}

/* ───────── Modales ───────── */
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
  const [clipper, setClipper] = useState(clippers[0]?.id || "");
  const [need, setNeed] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!handle.trim()) return;
    setBusy(true);
    await db.rpc("add_prospect", { p_handle: handle, p_clipper: clipper || null, p_need: need });
    setBusy(false); onDone();
  }
  return (
    <Backdrop onClose={onClose}>
      <h3 style={{ margin: "0 0 14px", fontStyle: "italic" }}>Ajouter un prospect</h3>
      <label className="fld-l">Pseudo Instagram</label>
      <input className="fld" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@marco_b" autoFocus />
      <label className="fld-l">Vient de quel clipper</label>
      <select className="fld" value={clipper} onChange={(e) => setClipper(e.target.value)}>
        <option value="">— inconnu —</option>
        {clippers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <label className="fld-l">Son besoin (optionnel)</label>
      <input className="fld" value={need} onChange={(e) => setNeed(e.target.value)} placeholder="veut lancer un SaaS…" />
      <button className="btn btn-pri" style={{ width: "100%", marginTop: 14, padding: 13 }} disabled={busy || !handle.trim()} onClick={save}>{busy ? "…" : "Ajouter"}</button>
    </Backdrop>
  );
}

function EditModal({ p, isStaff, onClose, onDone }: { p: Prospect; isStaff: boolean; onClose: () => void; onDone: () => void }) {
  const db = getSupabase();
  const [stage, setStage] = useState(p.stage);
  const [need, setNeed] = useState(p.need || "");
  const [note, setNote] = useState(p.note || "");
  const [sale, setSale] = useState(p.sale_amount ? String(p.sale_amount) : "");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    await db.rpc("update_prospect", {
      p_id: p.id, p_stage: stage, p_need: need, p_note: note,
      p_sale: isStaff && stage === "vendu" && sale ? Number(sale) : null,
    });
    setBusy(false); onDone();
  }
  return (
    <Backdrop onClose={onClose}>
      <h3 style={{ margin: "0 0 4px", fontStyle: "italic" }}>@{p.handle}</h3>
      <div style={{ fontSize: 12, color: "var(--mut)", marginBottom: 14 }}>{p.clipper_name ? `clip ${p.clipper_name}` : "origine inconnue"}</div>
      <label className="fld-l">Stade</label>
      <select className="fld" value={stage} onChange={(e) => setStage(e.target.value)}>
        {STAGES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
      </select>
      <label className="fld-l">Besoin</label>
      <input className="fld" value={need} onChange={(e) => setNeed(e.target.value)} placeholder="son projet…" />
      <label className="fld-l">Note</label>
      <textarea className="fld" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="relancé le 12, attend une vidéo…" />
      {isStaff && stage === "vendu" && (
        <>
          <label className="fld-l">Montant de la vente (€)</label>
          <input className="fld" type="number" value={sale} onChange={(e) => setSale(e.target.value)} placeholder="3500" />
        </>
      )}
      {!isStaff && (stage === "rdv_honore") && (
        <div style={{ fontSize: 11, color: "var(--mut)", marginTop: 6 }}>La vente sera validée par Keyan en fin d&apos;appel.</div>
      )}
      <button className="btn btn-pri" style={{ width: "100%", marginTop: 14, padding: 13 }} disabled={busy} onClick={save}>{busy ? "…" : "Enregistrer"}</button>
    </Backdrop>
  );
}
