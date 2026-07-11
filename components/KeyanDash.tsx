"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

/* ═══════════════════════════════════════════════════════════════
   KeyanDash · cockpit du closer/boss
   Vue équipe (6 setters comparés + 6 KPIs) → rapport individuel.
   Branché sur les RPC admin_* existantes.
   CAC/LTV/FECC : calculés à partir d'une saisie manuelle (budget pub,
   panier moyen, durée client) stockée en localStorage — pas de SQL requis.
═══════════════════════════════════════════════════════════════ */

type SetterRow = {
  setter_id: string; name: string; avatar_url: string | null; clippers: number;
  contacted: number; replied: number; taux_reponse: number | null; rdv_booked: number;
  rdv_honored: number; show_up: number | null; vendus: number; ca: number; avg_h: number | null; is_active: boolean;
};
type Overview = {
  contacted: number; replied: number; taux_reponse: number | null; rdv_booked: number;
  rdv_honored: number; show_up: number | null; qualifies: number; non_qualifies: number; vendus: number;
  ca: number; commission_base: number; avg_h: number | null; perdus: number;
};
type Funnel = { stage: string; n: number };
type Extra = { pipeline_days: number; acts_per_day: number };
type Prospect = {
  id: number; handle: string; stage: string; source: string; interet: string | null;
  need: string | null; rdv_at: string | null; sale_amount: number | null; relance_count: number; last_activity_at: string;
  note?: string | null; budget?: string | null; qualified?: string | null; coach_note?: string | null; platform?: string | null;
};

const euro = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
const pct = (n: number | null | undefined) => (n == null ? "—" : Math.round(n) + "%");
const initial = (s: string) => (s || "?").charAt(0).toUpperCase();

const FUNNEL_ORDER = ["contacte", "repondu", "en_convo", "pret_appel", "rdv_pris", "rdv_honore", "vendu"];
const FUNNEL_LABEL: Record<string, string> = {
  contacte: "Contactés", repondu: "Répondu", en_convo: "En convo", pret_appel: "Prêt appel",
  rdv_pris: "RDV pris", rdv_honore: "RDV honorés", vendu: "Vendus",
};

/* paramètres business pour CAC/LTV (saisie manuelle, persistée localement) */
type BizParams = { adSpend: number; avgTicket: number; clientMonths: number };
const DEFAULT_BIZ: BizParams = { adSpend: 0, avgTicket: 0, clientMonths: 1 };
function loadBiz(): BizParams {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem("keyan_biz") : null;
    return raw ? { ...DEFAULT_BIZ, ...JSON.parse(raw) } : DEFAULT_BIZ;
  } catch { return DEFAULT_BIZ; }
}

export default function KeyanDash({ userName }: { userName?: string }) {
  const db = getSupabase();
  const [setters, setSetters] = useState<SetterRow[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [funnel, setFunnel] = useState<Funnel[]>([]);
  const [extra, setExtra] = useState<Extra | null>(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<SetterRow | null>(null);
  const [biz, setBiz] = useState<BizParams>(DEFAULT_BIZ);
  const [bizOpen, setBizOpen] = useState(false);
  const [days, setDays] = useState(7);
  const [report, setReport] = useState<any>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => { setBiz(loadBiz()); }, []);

  // rapport period-aware (Daily/7/15/30) — rechargé quand la période change
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await db.rpc("keyan_report", { p_days: days });
        if (alive) setReport(data || null);
      } catch {
        if (alive) setReport(null);
      }
    })();
    return () => { alive = false; };
  }, [db, days]);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, o, f, x] = await Promise.all([
      db.rpc("admin_setters"),
      db.rpc("admin_overview", { p_setter: null }),
      db.rpc("admin_funnel", { p_setter: null }),
      db.rpc("admin_extra_kpis"),
    ]);
    setSetters(((s.data as SetterRow[]) || []).sort((a, b) => b.vendus - a.vendus || b.rdv_booked - a.rdv_booked));
    setOverview((o.data as Overview) || null);
    setFunnel((f.data as Funnel[]) || []);
    const ex = Array.isArray(x.data) ? (x.data as any[])[0] : (x.data as any);
    setExtra(ex || null);
    setLoading(false);
  }, [db]);

  useEffect(() => { load(); }, [load]);

  function saveBiz(b: BizParams) {
    setBiz(b);
    try { window.localStorage.setItem("keyan_biz", JSON.stringify(b)); } catch { /* noop */ }
  }

  // les 6 KPIs équipe
  const kpis = useMemo(() => {
    const o = overview;
    const contacted = o?.contacted || 0;
    const rdv = o?.rdv_booked || 0;
    const honored = o?.rdv_honored || 0;
    const vendus = o?.vendus || 0;
    const ca = o?.ca || 0;
    const booking = contacted ? (rdv / contacted) * 100 : null;
    const showup = o?.show_up ?? (rdv ? (honored / rdv) * 100 : null);
    const closing = honored ? (vendus / honored) * 100 : null;
    const cac = vendus && biz.adSpend ? biz.adSpend / vendus : null;
    const ltv = biz.avgTicket ? biz.avgTicket * biz.clientMonths : null;
    // FECC : First-Est Client Cost / ratio d'efficacité = LTV / CAC (santé de l'acquisition)
    const fecc = cac && ltv ? ltv / cac : null;
    return { booking, showup, closing, cac, ltv, fecc, ca, vendus, rdv, contacted };
  }, [overview, biz]);

  if (sel) {
    return <SetterReport setter={sel} biz={biz} onBack={() => setSel(null)} />;
  }

  const first = (userName || "Keyan").split(/\s|@/)[0];

  return (
    <div className="kd-root">
      <KeyanStyle />
      <div className="kd-wrap">
        <header className="kd-head">
          <div className="kd-htop">
            <div className="kd-mark">Keyan<b>OS</b> · pilotage</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="kd-cfg" onClick={() => setInviteOpen(true)}>＋ Inviter un setter</button>
              <button className="kd-cfg" onClick={() => setBizOpen(true)}>⚙︎ Paramètres</button>
            </div>
          </div>
          <h1 className="kd-h1">Salut {first}.</h1>
          <p className="kd-sub">{loading ? "chargement…" : `${setters.length} setters · vue d'ensemble de l'écosystème`}</p>
        </header>

        <GlobalReport report={report} days={days} setDays={setDays} biz={biz} />

        <div className="kd-sect" style={{ paddingLeft: 4, marginTop: 8 }}>KPIs setters — détail équipe</div>
        {/* 6 KPIs équipe */}
        <div className="kd-kpigrid">
          <Kpi label="Booking rate" value={pct(kpis.booking)} hint="RDV / contacts" tone="lime" />
          <Kpi label="Show-up rate" value={pct(kpis.showup)} hint="honorés / RDV" tone="blue" />
          <Kpi label="Closing rate" value={pct(kpis.closing)} hint="ventes / RDV honorés" tone="lime" />
          <Kpi label="CAC" value={kpis.cac != null ? euro(kpis.cac) : "à régler"} hint="coût par acquisition" tone={kpis.cac != null ? "" : "muted"} onClick={() => setBizOpen(true)} />
          <Kpi label="LTV" value={kpis.ltv != null ? euro(kpis.ltv) : "à régler"} hint="valeur par client" tone={kpis.ltv != null ? "" : "muted"} onClick={() => setBizOpen(true)} />
          <Kpi label="LTV / CAC" value={kpis.fecc != null ? kpis.fecc.toFixed(1) + "×" : "à régler"} hint="santé acquisition" tone={kpis.fecc != null ? (kpis.fecc >= 3 ? "lime" : "hot") : "muted"} onClick={() => setBizOpen(true)} />
        </div>

        {/* KPIs secondaires — comportement */}
        <div className="kd-sect" style={{ paddingLeft: 4 }}>Indicateurs de comportement</div>
        <div className="kd-kpigrid kd-kpigrid2">
          <Kpi label="Speed-to-lead" value={overview?.avg_h != null ? overview.avg_h + "h" : "—"} hint="délai moy. → RDV" tone="" />
          <Kpi label="Taux de réponse" value={pct(overview?.taux_reponse)} hint="répondu / contacté" tone="" />
          <Kpi label="Taux de qualif" value={overview ? pct(overview.qualifies + overview.non_qualifies ? (overview.qualifies / (overview.qualifies + overview.non_qualifies)) * 100 : null) : "—"} hint="qualifiés / en convo" tone="" />
          <Kpi label="No-show" value={overview?.show_up != null ? pct(100 - overview.show_up) : "—"} hint="RDV manqués" tone={overview?.show_up != null && 100 - overview.show_up > 30 ? "hot" : ""} />
          <Kpi label="Temps pipeline" value={extra?.pipeline_days != null ? extra.pipeline_days + "j" : "—"} hint="création → clôture" tone="" />
          <Kpi label="Activité / jour" value={extra?.acts_per_day != null ? String(extra.acts_per_day) : "—"} hint="gestes / jour actif" tone="" />
        </div>

        <div className="kd-cols">
          {/* classement setters */}
          <div className="kd-col">
            <div className="kd-sect">Tes {setters.length} setters</div>
            {loading && <div className="kd-loading">…</div>}
            {!loading && setters.length === 0 && (
              <div className="kd-empty">Aucun setter. Invite-les via un code (voir SetWar).</div>
            )}
            {setters.map((s, i) => {
              const booking = s.contacted ? Math.round((s.rdv_booked / s.contacted) * 100) : 0;
              const closing = s.rdv_honored ? Math.round((s.vendus / s.rdv_honored) * 100) : 0;
              return (
                <button key={s.setter_id} className="kd-setter" onClick={() => setSel(s)} style={{ opacity: s.is_active ? 1 : 0.5 }}>
                  <div className="kd-rank" data-top={i === 0 ? "1" : undefined}>{i + 1}</div>
                  <div className="kd-ava">{initial(s.name)}</div>
                  <div className="kd-sinfo">
                    <div className="kd-sname">{s.name}{!s.is_active && <span className="kd-off">off</span>}</div>
                    <div className="kd-smeta">{s.rdv_booked} RDV · {pct(s.show_up)} show-up · {closing}% closing</div>
                  </div>
                  <div className="kd-sright">
                    <div className="kd-sca">{euro(s.ca)}</div>
                    <div className="kd-svendus">{s.vendus} vente{s.vendus > 1 ? "s" : ""}</div>
                  </div>
                  <div className="kd-chev">›</div>
                </button>
              );
            })}
          </div>

          {/* funnel équipe */}
          <div className="kd-col">
            <div className="kd-sect">Funnel de l'équipe</div>
            <div className="kd-card">
              {(() => {
                const map: Record<string, number> = {};
                funnel.forEach((f) => { map[f.stage] = f.n; });
                const ord = FUNNEL_ORDER.map((k) => ({ k, n: map[k] || 0 }));
                const max = Math.max(1, ...ord.map((o) => o.n));
                return ord.map((o, idx) => {
                  const prev = idx > 0 ? ord[idx - 1].n : o.n;
                  const drop = prev > 0 ? Math.round((1 - o.n / prev) * 100) : 0;
                  return (
                    <div key={o.k} className="kd-fnl">
                      <div className="kd-fnl-l">{FUNNEL_LABEL[o.k]}</div>
                      <div className="kd-fnl-bar"><div style={{ width: `${Math.max(4, (o.n / max) * 100)}%` }} /></div>
                      <div className="kd-fnl-n">{o.n}</div>
                      {idx > 0 && drop > 0 && <div className="kd-fnl-drop">−{drop}%</div>}
                    </div>
                  );
                });
              })()}
            </div>
            <div className="kd-sect">Total équipe</div>
            <div className="kd-card kd-totals">
              <div><b>{euro(kpis.ca)}</b><span>CA généré</span></div>
              <div><b>{kpis.rdv}</b><span>RDV bookés</span></div>
              <div><b>{kpis.vendus}</b><span>ventes</span></div>
              <div><b>{kpis.contacted}</b><span>contacts</span></div>
            </div>
          </div>
        </div>
      </div>

      {bizOpen && <BizSheet biz={biz} onClose={() => setBizOpen(false)} onSave={(b) => { saveBiz(b); setBizOpen(false); }} />}
      {inviteOpen && <InviteSheet onClose={() => setInviteOpen(false)} />}
    </div>
  );
}

function GlobalReport({ report, days, setDays, biz }: { report: any; days: number; setDays: (d: number) => void; biz: BizParams }) {
  const cur = report?.current || {};
  const prev = report?.previous || {};
  const num = (v: any) => Number(v || 0);

  const ca = num(cur.ca);
  const paid = num(cur.paid);
  const roi = paid > 0 ? ca / paid : null;
  const prevCa = num(prev.ca), prevPaid = num(prev.paid);
  const prevRoi = prevPaid > 0 ? prevCa / prevPaid : null;
  const roiDelta = roi != null && prevRoi != null ? roi - prevRoi : null;
  const caDelta = prevCa > 0 ? Math.round(((ca - prevCa) / prevCa) * 100) : null;
  const paidDelta = prevPaid > 0 ? Math.round(((paid - prevPaid) / prevPaid) * 100) : null;

  const fmtViews = (n: number) => n >= 1e6 ? (Math.round(n / 1e5) / 10) + "M" : n >= 1e3 ? (Math.round(n / 100) / 10) + "k" : String(n);
  const fmtNum = (n: number) => new Intl.NumberFormat("fr-FR").format(n);

  // funnel : acquisition (vues, leads) + setting/closing
  const views = num(cur.views_gained);
  const leads = num(cur.leads_in);
  const contacted = num(cur.contacted);
  const rdv = num(cur.rdv);
  const honored = num(cur.honored);
  const ventes = num(cur.ventes);
  const fstages = [
    { zone: "Acquisition", name: "Vues générées", val: views, disp: fmtViews(views), cls: "acq", base: views, conv: null },
    { zone: "", name: "Leads inbound", val: leads, disp: fmtNum(leads), cls: "acq", base: views, conv: views ? (leads / views) * 100 : null },
    { zone: "Setting", name: "Contactés", val: contacted, disp: fmtNum(contacted), cls: "set", base: Math.max(leads, contacted, 1), conv: leads ? (contacted / leads) * 100 : null },
    { zone: "", name: "RDV pris", val: rdv, disp: fmtNum(rdv), cls: "set", base: Math.max(contacted, 1), conv: contacted ? (rdv / contacted) * 100 : null },
    { zone: "", name: "RDV honorés", val: honored, disp: fmtNum(honored), cls: "set", base: Math.max(contacted, 1), conv: rdv ? (honored / rdv) * 100 : null },
    { zone: "Closing", name: "Ventes", val: ventes, disp: fmtNum(ventes), cls: "clo", base: Math.max(contacted, 1), conv: honored ? (ventes / honored) * 100 : null },
  ];
  const maxBase = Math.max(1, views);

  const periods = [{ d: 1, l: "Daily" }, { d: 7, l: "7j" }, { d: 15, l: "15j" }, { d: 30, l: "30j" }];
  const ltv = biz.avgTicket ? biz.avgTicket * biz.clientMonths : null;
  const cac = ventes && biz.adSpend ? biz.adSpend / ventes : (ventes && paid ? paid / ventes : null);
  const ltvCac = ltv && cac ? ltv / cac : null;

  return (
    <div className="kd-report">
      <div className="kd-rtop">
        <div className="kd-sect" style={{ padding: 0 }}>Vue d'ensemble</div>
        <div className="kd-periods">
          {periods.map((p) => (
            <button key={p.d} className={days === p.d ? "on" : ""} onClick={() => setDays(p.d)}>{p.l}</button>
          ))}
        </div>
      </div>

      {/* ROI hero */}
      <div className="kd-hero">
        <div className="kd-hero-roi">
          <div className="l">ROI global — CA généré ÷ coût acquisition</div>
          <div className="v">{roi != null ? roi.toFixed(1) : "—"}<small>×</small></div>
          <div className="d">
            {roiDelta != null ? `${roiDelta >= 0 ? "▲ +" : "▼ "}${roiDelta.toFixed(1)}× vs période précédente` : "période précédente indisponible"}
            {roi != null && (roi >= 3 ? " · acquisition saine" : " · à surveiller")}
          </div>
        </div>
        <div className="kd-hero-card">
          <div className="l">CA généré (closing)</div>
          <div className="v gold">{euro(ca)}</div>
          {caDelta != null && <div className={"d " + (caDelta >= 0 ? "up" : "down")}>{caDelta >= 0 ? "▲ +" : "▼ "}{caDelta}%</div>}
        </div>
        <div className="kd-hero-card">
          <div className="l">Coût acquisition (clippers)</div>
          <div className="v">{euro(paid)}</div>
          {paidDelta != null && <div className={"d " + (paidDelta >= 0 ? "down" : "up")}>{paidDelta >= 0 ? "▲ +" : "▼ "}{Math.abs(paidDelta)}% de dépense</div>}
        </div>
      </div>

      {/* Funnel */}
      <div className="kd-sect">Funnel complet <span className="kd-badge">du clip au cash</span></div>
      <div className="kd-funnel">
        {fstages.map((s, i) => (
          <div key={i} className="kd-fstage">
            <div className="kd-fzone">{s.zone}</div>
            <div className="kd-fname">{s.name}</div>
            <div className="kd-fbar"><div className={"b-" + s.cls} style={{ width: `${Math.max(4, (s.val / maxBase) * 100)}%` }}>{s.disp}</div></div>
            <div className="kd-fnum">{s.disp}</div>
            <div className={"kd-fconv" + (s.conv != null && s.conv < 25 && i > 0 ? " warn" : "")}>{s.conv != null ? Math.round(s.conv) + "%" : "—"}</div>
          </div>
        ))}
      </div>

      {/* 3 pôles */}
      <div className="kd-sect">Les 3 pôles</div>
      <div className="kd-poles">
        <div className="kd-pole">
          <div className="kd-pole-h acq"><span className="kd-pole-dot" /><h3>Acquisition</h3><span className="kd-ptag">ClipWar</span></div>
          <PRow k="Vues générées" v={fmtViews(views)} />
          <PRow k="Clips publiés" v={fmtNum(num(cur.clips))} />
          <PRow k="Clippers actifs" v={fmtNum(num(cur.clippers))} />
          <PRow k="Leads inbound" v={fmtNum(leads)} />
          <PRow k="Payé aux clippers" v={euro(paid)} />
        </div>
        <div className="kd-pole">
          <div className="kd-pole-h set"><span className="kd-pole-dot" /><h3>Setting</h3><span className="kd-ptag">SetWar</span></div>
          <PRow k="Contactés" v={fmtNum(contacted)} />
          <PRow k="RDV pris" v={fmtNum(rdv)} />
          <PRow k="RDV honorés" v={fmtNum(honored)} />
          <PRow k="Booking rate" v={contacted ? Math.round((rdv / contacted) * 100) + "%" : "—"} tone="lime" />
          <PRow k="Show-up rate" v={rdv ? Math.round((honored / rdv) * 100) + "%" : "—"} />
        </div>
        <div className="kd-pole">
          <div className="kd-pole-h clo"><span className="kd-pole-dot" /><h3>Closing</h3><span className="kd-ptag">Ventes</span></div>
          <PRow k="Closing rate" v={honored ? Math.round((ventes / honored) * 100) + "%" : "—"} tone="lime" />
          <PRow k="Ventes" v={fmtNum(ventes)} />
          <PRow k="Panier moyen" v={ventes ? euro(ca / ventes) : "—"} />
          <PRow k="CA généré" v={euro(ca)} tone="gold" />
          <PRow k="LTV / CAC" v={ltvCac != null ? ltvCac.toFixed(1) + "×" : "à régler"} tone={ltvCac != null ? "lime" : ""} />
        </div>
      </div>
    </div>
  );
}

function PRow({ k, v, tone }: { k: string; v: string | number; tone?: string }) {
  return (
    <div className="kd-prow"><span className="kd-pk">{k}</span><span className={"kd-pv " + (tone || "")}>{v}</span></div>
  );
}

function Kpi({ label, value, hint, tone, onClick }: { label: string; value: string; hint: string; tone?: string; onClick?: () => void }) {
  return (
    <div className={"kd-kpi" + (onClick ? " click" : "")} onClick={onClick}>
      <div className="kd-kpi-l">{label}</div>
      <div className={"kd-kpi-v " + (tone || "")}>{value}</div>
      <div className="kd-kpi-h">{hint}</div>
    </div>
  );
}

/* ═══════════ Rapport individuel ═══════════ */
function SetterReport({ setter, biz, onBack }: { setter: SetterRow; biz: BizParams; onBack: () => void }) {
  const db = getSupabase();
  const [ov, setOv] = useState<Overview | null>(null);
  const [funnel, setFunnel] = useState<Funnel[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [extra, setExtra] = useState<Extra | null>(null);
  const [loading, setLoading] = useState(true);
  const [coachNote, setCoachNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const [openProspect, setOpenProspect] = useState<Prospect | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [o, f, p, x, cn] = await Promise.all([
        db.rpc("admin_overview", { p_setter: setter.setter_id }),
        db.rpc("admin_funnel", { p_setter: setter.setter_id }),
        db.rpc("admin_setter_prospects", { p_setter: setter.setter_id }),
        db.rpc("admin_setter_extra", { p_setter: setter.setter_id }),
        db.from("profiles").select("coach_note").eq("id", setter.setter_id).single(),
      ]);
      setOv((o.data as Overview) || null);
      setFunnel((f.data as Funnel[]) || []);
      setProspects((p.data as Prospect[]) || []);
      const ex = Array.isArray(x.data) ? (x.data as any[])[0] : (x.data as any);
      setExtra(ex || null);
      setCoachNote(((cn.data as any)?.coach_note) || "");
      setLoading(false);
    })();
  }, [db, setter.setter_id]);

  async function saveCoachNote() {
    await db.rpc("set_coach_note", { p_setter: setter.setter_id, p_note: coachNote.trim() });
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 1500);
  }

  const contacted = ov?.contacted || 0;
  const rdv = ov?.rdv_booked || 0;
  const honored = ov?.rdv_honored || 0;
  const vendus = ov?.vendus || 0;
  const booking = contacted ? (rdv / contacted) * 100 : null;
  const showup = ov?.show_up ?? (rdv ? (honored / rdv) * 100 : null);
  const closing = honored ? (vendus / honored) * 100 : null;
  const cac = vendus && biz.adSpend ? biz.adSpend / vendus : null;
  const ltv = biz.avgTicket ? biz.avgTicket * biz.clientMonths : null;
  const fecc = cac && ltv ? ltv / cac : null;

  const map: Record<string, number> = {};
  funnel.forEach((f) => { map[f.stage] = f.n; });
  const ord = FUNNEL_ORDER.map((k) => ({ k, n: map[k] || 0 }));
  const max = Math.max(1, ...ord.map((o) => o.n));

  return (
    <div className="kd-root">
      <KeyanStyle />
      <div className="kd-wrap">
        <header className="kd-head">
          <button className="kd-back" onClick={onBack}>‹ Retour à l'équipe</button>
          <div className="kd-rhead">
            <div className="kd-ava lg">{initial(setter.name)}</div>
            <div>
              <h1 className="kd-h1" style={{ fontSize: 30 }}>{setter.name}</h1>
              <p className="kd-sub">Rapport individuel {!setter.is_active && "· désactivé"}</p>
            </div>
          </div>
        </header>

        <div className="kd-kpigrid">
          <Kpi label="Booking rate" value={pct(booking)} hint="RDV / contacts" tone="lime" />
          <Kpi label="Show-up rate" value={pct(showup)} hint="honorés / RDV" tone="blue" />
          <Kpi label="Closing rate" value={pct(closing)} hint="ventes / RDV honorés" tone="lime" />
          <Kpi label="CAC" value={cac != null ? euro(cac) : "—"} hint="coût / acquisition" tone={cac != null ? "" : "muted"} />
          <Kpi label="LTV" value={ltv != null ? euro(ltv) : "—"} hint="valeur / client" tone={ltv != null ? "" : "muted"} />
          <Kpi label="LTV / CAC" value={fecc != null ? fecc.toFixed(1) + "×" : "—"} hint="santé acquisition" tone={fecc != null ? (fecc >= 3 ? "lime" : "hot") : "muted"} />
        </div>

        <div className="kd-sect" style={{ paddingLeft: 4 }}>Indicateurs de comportement</div>
        <div className="kd-kpigrid kd-kpigrid2">
          <Kpi label="Speed-to-lead" value={ov?.avg_h != null ? ov.avg_h + "h" : "—"} hint="délai moy. → RDV" tone="" />
          <Kpi label="Taux de réponse" value={pct(ov?.taux_reponse)} hint="répondu / contacté" tone="" />
          <Kpi label="Taux de qualif" value={ov ? pct(ov.qualifies + ov.non_qualifies ? (ov.qualifies / (ov.qualifies + ov.non_qualifies)) * 100 : null) : "—"} hint="qualifiés / en convo" tone="" />
          <Kpi label="No-show" value={showup != null ? pct(100 - showup) : "—"} hint="RDV manqués" tone={showup != null && 100 - showup > 30 ? "hot" : ""} />
          <Kpi label="Temps pipeline" value={extra?.pipeline_days != null ? extra.pipeline_days + "j" : "—"} hint="création → clôture" tone="" />
          <Kpi label="Activité / jour" value={extra?.acts_per_day != null ? String(extra.acts_per_day) : "—"} hint="gestes / jour actif" tone="" />
        </div>

        <div className="kd-cols">
          <div className="kd-col">
            <div className="kd-sect">Son funnel — où il perd ses prospects</div>
            <div className="kd-card">
              {ord.map((o, idx) => {
                const prev = idx > 0 ? ord[idx - 1].n : o.n;
                const drop = prev > 0 ? Math.round((1 - o.n / prev) * 100) : 0;
                return (
                  <div key={o.k} className="kd-fnl">
                    <div className="kd-fnl-l">{FUNNEL_LABEL[o.k]}</div>
                    <div className="kd-fnl-bar"><div style={{ width: `${Math.max(4, (o.n / max) * 100)}%` }} /></div>
                    <div className="kd-fnl-n">{o.n}</div>
                    {idx > 0 && drop > 40 && <div className="kd-fnl-drop big">−{drop}%</div>}
                    {idx > 0 && drop > 0 && drop <= 40 && <div className="kd-fnl-drop">−{drop}%</div>}
                  </div>
                );
              })}
            </div>
            <div className="kd-card kd-totals">
              <div><b>{euro(ov?.ca || 0)}</b><span>CA généré</span></div>
              <div><b>{ov?.avg_h != null ? ov.avg_h + "h" : "—"}</b><span>tps → RDV</span></div>
              <div><b>{ov?.qualifies || 0}</b><span>qualifiés</span></div>
              <div><b>{ov?.perdus || 0}</b><span>perdus</span></div>
            </div>
          </div>

          <div className="kd-col">
            <div className="kd-sect">Mot de coaching à {setter.name.split(" ")[0]}</div>
            <div className="kd-card" style={{ padding: 16 }}>
              <textarea className="kd-fld" rows={3} value={coachNote} onChange={(e) => setCoachNote(e.target.value)}
                placeholder={`Un conseil visible en haut de son SetWar… ex : "Relance plus vite les leads chauds"`} />
              <button className="kd-save" style={{ marginTop: 10 }} onClick={saveCoachNote}>{noteSaved ? "✓ Envoyé" : "Envoyer le mot"}</button>
            </div>

            <div className="kd-sect">Ses prospects ({prospects.length}) <span className="kd-badge">clique pour voir la fiche</span></div>
            {loading && <div className="kd-loading">…</div>}
            <div className="kd-plist">
              {prospects.slice(0, 60).map((p) => (
                <button key={p.id} className="kd-prow kd-prow-click" onClick={() => setOpenProspect(p)}>
                  <div className="kd-ava sm">{initial(p.handle)}</div>
                  <div className="kd-pinfo">
                    <div className="kd-pname">@{p.handle}{p.coach_note ? " 💬" : ""}</div>
                    <div className="kd-pmeta">{p.interet || p.need || p.source}</div>
                  </div>
                  <div className="kd-pstage" data-s={p.stage}>{FUNNEL_LABEL[p.stage] || p.stage}</div>
                </button>
              ))}
              {!loading && prospects.length === 0 && <div className="kd-empty">Aucun prospect.</div>}
            </div>
          </div>
        </div>
      </div>

      {openProspect && (
        <ProspectFiche
          p={openProspect}
          setterName={setter.name}
          onClose={() => setOpenProspect(null)}
          onCoached={(id, note) => {
            setProspects((prev) => prev.map((x) => (x.id === id ? { ...x, coach_note: note } : x)));
          }}
        />
      )}
    </div>
  );
}

/* ═══════════ Fiche prospect vue par Keyan (lecture + coaching) ═══════════ */
function ProspectFiche({ p, setterName, onClose, onCoached }: { p: Prospect; setterName: string; onClose: () => void; onCoached: (id: number, note: string) => void }) {
  const db = getSupabase();
  const [note, setNote] = useState(p.coach_note || "");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const qualif = [
    { l: "Situation", v: p.need },
    { l: "Objectif", v: p.interet },
    { l: "Budget", v: p.budget },
    { l: "Qualifié", v: p.qualified === "oui" ? "Oui ✓" : p.qualified === "non" ? "Non" : null },
  ];

  async function save() {
    setBusy(true);
    try {
      await db.rpc("set_prospect_coach_note", { p_id: p.id, p_note: note.trim() });
      onCoached(p.id, note.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      /* si la migration n'est pas passée, on n'écrit pas */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="kd-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="kd-sheet" style={{ maxWidth: 520 }}>
        <div className="kd-fiche-head">
          <div className="kd-ava" style={{ width: 48, height: 48, borderRadius: 14 }}>{initial(p.handle)}</div>
          <div>
            <h3 style={{ margin: 0 }}>@{p.handle}</h3>
            <div className="kd-fiche-sub">{FUNNEL_LABEL[p.stage] || p.stage} · setter {setterName.split(" ")[0]}{p.platform ? ` · ${p.platform}` : ""}</div>
          </div>
        </div>

        <div className="kd-sect" style={{ padding: "16px 0 10px" }}>Comment {setterName.split(" ")[0]} a qualifié</div>
        <div className="kd-qualif">
          {qualif.map((q) => (
            <div key={q.l} className="kd-qline">
              <span className="kd-qk">{q.l}</span>
              <span className={"kd-qv" + (q.v ? "" : " empty")}>{q.v || "— non rempli"}</span>
            </div>
          ))}
          {p.rdv_at && (
            <div className="kd-qline"><span className="kd-qk">RDV</span><span className="kd-qv">{new Date(p.rdv_at).toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span></div>
          )}
          {p.note && (
            <div className="kd-qline" style={{ alignItems: "flex-start" }}><span className="kd-qk">Notes</span><span className="kd-qv" style={{ textAlign: "right" }}>{p.note}</span></div>
          )}
        </div>

        <div className="kd-sect" style={{ padding: "16px 0 10px" }}>Ton mot de coaching sur ce prospect</div>
        <textarea className="kd-fld" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Ex : « Il est chaud, propose-lui un créneau tout de suite »" />
        <button className="kd-save" onClick={save} disabled={busy}>{saved ? "✓ Enregistré — visible par le setter" : busy ? "…" : "Laisser ce mot"}</button>
      </div>
    </div>
  );
}

/* ═══════════ Inviter un setter ═══════════ */
function InviteSheet({ onClose }: { onClose: () => void }) {
  const db = getSupabase();
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = code ? `${origin}/setwar?invite=${code}` : "";

  async function generate() {
    setBusy(true);
    setErr(null);
    try {
      const { data, error } = await db.rpc("create_invite", { p_role: "setter" });
      if (error) throw error;
      // create_invite renvoie le token/code (string) ou un objet
      const token = typeof data === "string" ? data : (data as any)?.token || (data as any)?.code || String(data);
      setCode(token);
    } catch (e: any) {
      setErr(e?.message || "Impossible de générer le code.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* fallback : l'utilisateur copie à la main */
    }
  }

  return (
    <div className="kd-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="kd-sheet">
        <h3>Inviter un setter</h3>
        <p className="kd-shint">Génère un lien unique. Le setter crée son compte via ce lien et devient automatiquement setter — tu n'as rien d'autre à faire.</p>

        {!code ? (
          <button className="kd-save" disabled={busy} onClick={generate}>{busy ? "…" : "🔑 Générer un lien d'invitation"}</button>
        ) : (
          <>
            <label className="kd-lbl">Lien à envoyer au setter (WhatsApp, DM…)</label>
            <div className="kd-invlink">{link}</div>
            <button className="kd-save" onClick={copy}>{copied ? "✓ Copié !" : "Copier le lien"}</button>
            <button className="kd-invnew" onClick={generate} disabled={busy}>{busy ? "…" : "Générer un autre lien"}</button>
          </>
        )}
        {err && <div className="kd-err">{err}</div>}
      </div>
    </div>
  );
}

/* ═══════════ Paramètres business (CAC/LTV) ═══════════ */
function BizSheet({ biz, onClose, onSave }: { biz: BizParams; onClose: () => void; onSave: (b: BizParams) => void }) {
  const [adSpend, setAdSpend] = useState(String(biz.adSpend || ""));
  const [avgTicket, setAvgTicket] = useState(String(biz.avgTicket || ""));
  const [clientMonths, setClientMonths] = useState(String(biz.clientMonths || 1));

  return (
    <div className="kd-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="kd-sheet">
        <div className="kd-grab" />
        <h3>Paramètres pour CAC & LTV</h3>
        <p className="kd-shint">Ces chiffres ne sont pas dans l'app — entre-les pour activer CAC, LTV et le ratio LTV/CAC.</p>
        <label className="kd-lbl">Budget pub dépensé (période, €)</label>
        <input className="kd-fld" inputMode="decimal" placeholder="Ex : 3000" value={adSpend} onChange={(e) => setAdSpend(e.target.value)} />
        <label className="kd-lbl">Panier moyen par client (€)</label>
        <input className="kd-fld" inputMode="decimal" placeholder="Ex : 1500" value={avgTicket} onChange={(e) => setAvgTicket(e.target.value)} />
        <label className="kd-lbl">Durée moyenne d'un client (mois)</label>
        <input className="kd-fld" inputMode="decimal" placeholder="Ex : 6" value={clientMonths} onChange={(e) => setClientMonths(e.target.value)} />
        <button className="kd-save" onClick={() => onSave({ adSpend: +adSpend || 0, avgTicket: +avgTicket || 0, clientMonths: +clientMonths || 1 })}>
          Enregistrer
        </button>
      </div>
    </div>
  );
}

function KeyanStyle() {
  return (
    <style>{`
    .kd-root{--bg:#FBFAF8;--bg2:#F2F1EC;--card:#FFFFFF;--line:#ECEAE3;--line2:#E1DED5;--txt:#15140F;--mut:#6E6B62;--mut2:#A6A399;--lime:#3A6B2E;--lime-dim:#EAF3E4;--hot:#C4551F;--gold:#B8860B;--blue:#2F6FD6;--blue-dim:#E6EFFB;--track:#EDEBE4;--sh:0 1px 3px rgba(20,18,10,.05),0 4px 16px rgba(20,18,10,.04);font-family:"Manrope","Inter",system-ui,sans-serif;color:var(--txt);background:var(--bg);min-height:100dvh;-webkit-font-smoothing:antialiased}
    .kd-root *{box-sizing:border-box}
    /* rapport global */
    .kd-report{margin-bottom:12px}
    .kd-rtop{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
    .kd-periods{display:flex;gap:6px;background:var(--card);border:1px solid var(--line2);border-radius:13px;padding:4px;box-shadow:var(--sh)}
    .kd-periods button{padding:9px 16px;border-radius:10px;font-family:inherit;font-weight:700;font-size:13px;color:var(--mut);border:none;background:none;cursor:pointer}
    .kd-periods button.on{background:var(--lime);color:#fff}
    .kd-badge{font-size:10px;font-weight:700;color:var(--mut);background:var(--bg2);padding:3px 8px;border-radius:6px;margin-left:8px;text-transform:none;letter-spacing:0}
    .kd-hero{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:14px;margin-bottom:8px}
    .kd-hero-roi{background:linear-gradient(135deg,#15140F,#2A2820);color:#fff;border-radius:22px;padding:26px 28px;box-shadow:var(--sh)}
    .kd-hero-roi .l{font-size:13px;font-weight:600;opacity:.7}
    .kd-hero-roi .v{font-size:52px;font-weight:800;letter-spacing:-.03em;line-height:1;margin:8px 0}
    .kd-hero-roi .v small{font-size:24px;opacity:.8}
    .kd-hero-roi .d{font-size:13px;font-weight:600;color:#CDFB5E}
    .kd-hero-card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:24px;box-shadow:var(--sh);display:flex;flex-direction:column;justify-content:center}
    .kd-hero-card .l{font-size:13px;color:var(--mut);font-weight:600}
    .kd-hero-card .v{font-size:34px;font-weight:800;letter-spacing:-.02em;margin:6px 0 3px}
    .kd-hero-card .v.gold{color:var(--gold)}
    .kd-hero-card .d{font-size:12px;font-weight:700}
    .up{color:var(--lime)}.down{color:var(--hot)}
    .kd-funnel{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:24px;box-shadow:var(--sh);margin-bottom:8px}
    .kd-fstage{display:flex;align-items:center;gap:14px;margin-bottom:11px}
    .kd-fstage:last-child{margin-bottom:0}
    .kd-fzone{width:88px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--mut2)}
    .kd-fname{width:120px;font-size:13.5px;font-weight:700}
    .kd-fbar{flex:1;height:26px;background:var(--track);border-radius:8px;overflow:hidden}
    .kd-fbar div{height:100%;border-radius:8px;display:flex;align-items:center;padding-left:12px;font-size:12px;font-weight:800;color:#fff;min-width:44px}
    .kd-fbar .b-acq{background:linear-gradient(90deg,#2F6FD6,#5B93E8)}
    .kd-fbar .b-set{background:linear-gradient(90deg,#3A6B2E,#5B9B45)}
    .kd-fbar .b-clo{background:linear-gradient(90deg,#B8860B,#D4A82C)}
    .kd-fnum{width:80px;text-align:right;font-weight:800;font-size:15px}
    .kd-fconv{width:56px;text-align:right;font-size:11px;font-weight:700;color:var(--mut2)}
    .kd-fconv.warn{color:var(--hot)}
    .kd-poles{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:8px}
    .kd-pole{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:20px;box-shadow:var(--sh)}
    .kd-pole-h{display:flex;align-items:center;gap:9px;margin-bottom:14px}
    .kd-pole-dot{width:9px;height:9px;border-radius:50%}
    .kd-pole-h.acq .kd-pole-dot{background:var(--blue)}
    .kd-pole-h.set .kd-pole-dot{background:var(--lime)}
    .kd-pole-h.clo .kd-pole-dot{background:var(--gold)}
    .kd-pole-h h3{font-size:14px;font-weight:800}
    .kd-ptag{font-size:10px;font-weight:700;color:var(--mut2);margin-left:auto;text-transform:uppercase;letter-spacing:.04em}
    .kd-prow{display:flex;justify-content:space-between;align-items:baseline;padding:9px 0;border-bottom:1px solid var(--line)}
    .kd-prow:last-child{border-bottom:none}
    .kd-pk{font-size:13px;color:var(--mut)}
    .kd-pv{font-size:17px;font-weight:800}
    .kd-pv.hot{color:var(--hot)}.kd-pv.lime{color:var(--lime)}.kd-pv.gold{color:var(--gold)}
    .kd-wrap{max-width:1180px;margin:0 auto;padding:32px 24px 60px}
    .kd-head{margin-bottom:24px}
    .kd-htop{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
    .kd-mark{font-weight:800;font-size:16px}.kd-mark b{color:var(--lime)}
    .kd-cfg{background:var(--card);border:1px solid var(--line2);border-radius:11px;padding:9px 14px;font-family:inherit;font-weight:600;font-size:13px;color:var(--mut);cursor:pointer}
    .kd-h1{font-size:34px;font-weight:800;letter-spacing:-.03em;line-height:1.05}
    .kd-sub{margin-top:7px;font-size:15px;color:var(--mut);font-weight:500}
    .kd-back{background:none;border:none;color:var(--mut);font-family:inherit;font-weight:700;font-size:14px;cursor:pointer;padding:0;margin-bottom:18px}
    .kd-rhead{display:flex;align-items:center;gap:16px}
    /* KPIs */
    .kd-kpigrid{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:28px}
    .kd-kpigrid2{margin-top:4px}
    .kd-kpigrid2 .kd-kpi{padding:14px 14px;background:var(--bg2);box-shadow:none}
    .kd-kpigrid2 .kd-kpi-v{font-size:22px}
    .kd-kpi{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px 16px;box-shadow:var(--sh)}
    .kd-kpi.click{cursor:pointer}
    .kd-kpi-l{font-size:12px;color:var(--mut);font-weight:600}
    .kd-kpi-v{font-size:30px;font-weight:800;letter-spacing:-.02em;margin:6px 0 2px}
    .kd-kpi-v.lime{color:var(--lime)}.kd-kpi-v.blue{color:var(--blue)}.kd-kpi-v.hot{color:var(--hot)}.kd-kpi-v.muted{color:var(--mut2);font-size:18px;font-weight:700}
    .kd-kpi-h{font-size:11px;color:var(--mut2);font-weight:500}
    /* colonnes */
    .kd-cols{display:grid;grid-template-columns:1.2fr 1fr;gap:20px;align-items:start}
    .kd-col{min-width:0}
    .kd-sect{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mut2);padding:8px 4px 12px}
    .kd-loading{padding:30px;text-align:center;color:var(--mut2)}
    .kd-empty{padding:24px;text-align:center;color:var(--mut2);font-size:13px;background:var(--card);border:1px solid var(--line);border-radius:16px}
    /* setter row */
    .kd-setter{width:100%;display:flex;align-items:center;gap:13px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px 16px;margin-bottom:10px;box-shadow:var(--sh);cursor:pointer;font-family:inherit;text-align:left;transition:transform .2s,box-shadow .2s}
    .kd-setter:hover{transform:translateY(-2px);box-shadow:0 8px 26px rgba(20,18,10,.10)}
    .kd-rank{width:24px;font-weight:800;font-size:15px;color:var(--mut2);text-align:center}
    .kd-rank[data-top="1"]{color:var(--lime)}
    .kd-ava{width:44px;height:44px;border-radius:13px;flex:none;background:var(--lime-dim);border:1px solid rgba(58,107,46,.2);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px;color:var(--lime)}
    .kd-ava.lg{width:60px;height:60px;font-size:24px;border-radius:18px}
    .kd-ava.sm{width:36px;height:36px;font-size:14px;border-radius:11px}
    .kd-sinfo{flex:1;min-width:0}
    .kd-sname{font-weight:700;font-size:16px}
    .kd-off{font-size:9px;font-weight:800;text-transform:uppercase;color:var(--hot);margin-left:6px}
    .kd-smeta{font-size:12px;color:var(--mut2);margin-top:2px;font-weight:500}
    .kd-sright{text-align:right}
    .kd-sca{font-weight:800;font-size:15px}
    .kd-svendus{font-size:11px;color:var(--mut2);font-weight:600}
    .kd-chev{color:var(--mut2);font-size:20px}
    /* card + funnel */
    .kd-card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px;box-shadow:var(--sh);margin-bottom:16px}
    .kd-fnl{display:flex;align-items:center;gap:10px;margin-bottom:9px}
    .kd-fnl:last-child{margin-bottom:0}
    .kd-fnl-l{width:88px;font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.3px;font-weight:700}
    .kd-fnl-bar{flex:1;height:18px;background:var(--track);border-radius:6px;overflow:hidden}
    .kd-fnl-bar div{height:100%;background:var(--lime);border-radius:6px;transition:width .5s}
    .kd-fnl-n{width:32px;text-align:right;font-weight:800}
    .kd-fnl-drop{font-size:10px;font-weight:700;color:var(--mut2);width:42px;text-align:right}
    .kd-fnl-drop.big{color:var(--hot)}
    .kd-totals{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .kd-totals div b{display:block;font-size:22px;font-weight:800}
    .kd-totals div span{font-size:11px;color:var(--mut2);text-transform:uppercase;letter-spacing:.04em;font-weight:700}
    /* prospects */
    .kd-plist{max-height:600px;overflow-y:auto}
    .kd-prow{display:flex;align-items:center;gap:11px;background:var(--card);border:1px solid var(--line);border-radius:13px;padding:10px 13px;margin-bottom:8px;box-shadow:var(--sh)}
    .kd-pinfo{flex:1;min-width:0}
    .kd-pname{font-weight:700;font-size:14px}
    .kd-pmeta{font-size:11.5px;color:var(--mut2);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .kd-pstage{font-size:10px;font-weight:800;text-transform:uppercase;color:var(--mut);border:1px solid var(--line2);padding:4px 8px;border-radius:7px;white-space:nowrap}
    .kd-pstage[data-s="vendu"]{color:var(--lime);border-color:rgba(58,107,46,.3)}
    .kd-pstage[data-s="rdv_pris"],.kd-pstage[data-s="rdv_honore"]{color:var(--blue);border-color:rgba(47,111,214,.3)}
    /* sheet */
    .kd-scrim{position:fixed;inset:0;z-index:60;background:rgba(20,18,10,.4);display:flex;align-items:center;justify-content:center;padding:20px}
    .kd-sheet{width:100%;max-width:440px;background:var(--card);border-radius:24px;padding:24px;box-shadow:0 20px 60px rgba(20,18,10,.2)}
    .kd-grab{display:none}
    .kd-sheet h3{font-size:19px;font-weight:800;margin-bottom:6px}
    .kd-shint{font-size:13px;color:var(--mut);line-height:1.5;margin-bottom:18px}
    .kd-lbl{font-size:12px;color:var(--mut);font-weight:600;display:block;margin:14px 0 7px}
    .kd-fld{width:100%;background:var(--bg2);border:1px solid var(--line2);border-radius:12px;padding:13px 14px;color:var(--txt);font-family:inherit;font-size:16px;outline:none}
    .kd-fld:focus{border-color:var(--lime)}
    .kd-save{width:100%;margin-top:20px;background:var(--lime);color:#fff;border:none;border-radius:14px;padding:15px;font-family:inherit;font-weight:800;font-size:15px;cursor:pointer}
    .kd-invlink{background:var(--bg2);border:1px solid var(--line2);border-radius:12px;padding:14px;font-size:13px;font-weight:600;word-break:break-all;color:var(--lime);margin-bottom:4px}
    .kd-invnew{width:100%;margin-top:10px;background:none;border:1px solid var(--line2);border-radius:12px;padding:12px;font-family:inherit;font-weight:700;font-size:13px;color:var(--mut);cursor:pointer}
    .kd-err{margin-top:12px;font-size:12.5px;color:var(--hot);background:var(--hot-dim);border:1px solid rgba(196,85,31,.2);border-radius:10px;padding:10px 12px}
    .kd-prow-click{width:100%;text-align:left;font-family:inherit;cursor:pointer;transition:transform .15s,box-shadow .2s}
    .kd-prow-click:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(20,18,10,.08)}
    .kd-fiche-head{display:flex;align-items:center;gap:13px}
    .kd-fiche-sub{font-size:12.5px;color:var(--mut2);margin-top:3px;font-weight:600}
    .kd-qualif{background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:6px 14px}
    .kd-qline{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:11px 0;border-bottom:1px solid var(--line)}
    .kd-qline:last-child{border-bottom:none}
    .kd-qk{font-size:12px;font-weight:700;color:var(--mut2);text-transform:uppercase;letter-spacing:.03em;flex:none}
    .kd-qv{font-size:14px;font-weight:600;color:var(--txt)}
    .kd-qv.empty{color:var(--mut2);font-style:italic;font-weight:500}
    @media (max-width:820px){
      .kd-kpigrid{grid-template-columns:repeat(3,1fr)}
      .kd-cols{grid-template-columns:1fr}
      .kd-wrap{padding:24px 16px 60px}
      .kd-h1{font-size:28px}
      .kd-hero,.kd-poles{grid-template-columns:1fr}
      .kd-fzone{display:none}
      .kd-fname{width:92px;font-size:12px}
      .kd-rtop{flex-wrap:wrap;gap:10px}
    }
    @media (max-width:480px){
      .kd-kpigrid{grid-template-columns:repeat(2,1fr)}
    }
    `}</style>
  );
}
