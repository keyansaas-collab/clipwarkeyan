"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

/* ═══════════════════════════════════════════════════════════════
   SetWar · console setter complète — parcours A→Z
   Branché sur les RPC ClipWar existantes.
   Migration additive optionnelle : supabase/24_setwar_rdv.sql
     (setwar_book_rdv → écrit rdv_at, setwar_mark_paid → payment_received_at)
   L'app fonctionne SANS la migration (le RDV avance le stage,
   la date est juste stockée en plus si la fonction existe).
═══════════════════════════════════════════════════════════════ */

type Prospect = {
  id: number;
  handle: string;
  clipper_id: string | null;
  clipper_name: string | null;
  need: string | null;
  stage: string;
  source: string;
  note: string | null;
  rdv_at: string | null;
  sale_amount: number | null;
  platform: string | null;
  budget: string | null;
  interet: string | null;
  qualified: string | null;
  lost_reason: string | null;
  relance_count: number;
  last_activity_at: string;
  stale: boolean;
};

type Bucket = "nouveau" | "relancer" | "confirmer" | "silence";
type Screen = "today" | "fiche" | "focus" | "stats" | "vivier" | "profil";

const ALL_STAGES: { v: string; l: string }[] = [
  { v: "nouveau", l: "Nouveau" },
  { v: "contacte", l: "Contacté" },
  { v: "repondu", l: "A répondu" },
  { v: "en_convo", l: "En convo" },
  { v: "whatsapp", l: "WhatsApp" },
  { v: "pret_appel", l: "Prêt appel" },
  { v: "rdv_pris", l: "RDV pris" },
  { v: "rdv_honore", l: "RDV honoré" },
  { v: "vendu", l: "Vendu" },
  { v: "perdu", l: "Perdu" },
];
const stageLabel = (v: string) => ALL_STAGES.find((s) => s.v === v)?.l || v;

const RELANCE_STAGES = ["en_convo", "repondu", "pret_appel", "whatsapp", "contacte", "froid"];
const DONE_STAGES = ["vendu", "perdu", "rdv_honore"];

function endOfTomorrow(): number {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function bucketOf(p: Prospect): Bucket | null {
  if (DONE_STAGES.includes(p.stage)) return null;
  if (p.stage === "nouveau") return "nouveau";
  if (p.stage === "rdv_pris") {
    if (!p.rdv_at) return "confirmer";
    const t = new Date(p.rdv_at).getTime();
    if (t <= endOfTomorrow()) return "confirmer";
    return null;
  }
  if (RELANCE_STAGES.includes(p.stage)) return p.stale ? "silence" : "relancer";
  return "relancer";
}

function parseHandle(raw: string): { handle: string; platform: string | null } | null {
  let s = raw.trim();
  if (!s) return null;
  let platform: string | null = null;
  try {
    if (/https?:\/\//i.test(s) || /(instagram\.com|tiktok\.com)/i.test(s)) {
      if (/instagram\.com/i.test(s)) platform = "Instagram";
      if (/tiktok\.com/i.test(s)) platform = "TikTok";
      const m = s.match(/(?:instagram\.com|tiktok\.com)\/@?([A-Za-z0-9._]+)/i);
      if (m) s = m[1];
    }
  } catch {
    /* noop */
  }
  s = s.replace(/^@/, "").replace(/\/.*$/, "").trim();
  if (!/^[A-Za-z0-9._]{1,40}$/.test(s)) return null;
  return { handle: s, platform };
}

const CHEERS = ["Noté", "Une de moins", "Réglé", "Ça avance", "Solide"];

const SECTIONS: { key: Bucket; label: string; head: string }[] = [
  { key: "nouveau", label: "Nouveaux", head: "À contacter maintenant" },
  { key: "relancer", label: "À relancer", head: "À relancer" },
  { key: "confirmer", label: "Confirmer", head: "RDV à confirmer" },
  { key: "silence", label: "Silence", head: "Silence radio" },
];

const initialOf = (h: string) => (h || "?").charAt(0).toUpperCase();
const avaCls = (b: Bucket | null) => (b === "nouveau" ? "hot" : b === "confirmer" ? "blue" : "");

export default function SetWar({ userName }: { userName?: string }) {
  const db = getSupabase();
  const [rows, setRows] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>("today");
  const [current, setCurrent] = useState<Prospect | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [cheer, setCheer] = useState<string | null>(null);
  const [doneToday, setDoneToday] = useState(0);
  const [filter, setFilter] = useState<"all" | Bucket>("all");
  const [stats, setStats] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, s] = await Promise.all([db.rpc("setter_prospects"), db.rpc("setter_stats")]);
    setRows((p.data as Prospect[]) || []);
    setStats(s.data || null);
    setLoading(false);
  }, [db]);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (m: string) => {
    setCheer(m);
    window.clearTimeout((flash as any)._t);
    (flash as any)._t = window.setTimeout(() => setCheer(null), 1000);
  };

  const buckets = useMemo(() => {
    const b: Record<Bucket, Prospect[]> = { nouveau: [], relancer: [], confirmer: [], silence: [] };
    for (const p of rows) {
      const k = bucketOf(p);
      if (k) b[k].push(p);
    }
    return b;
  }, [rows]);

  const total = buckets.nouveau.length + buckets.relancer.length + buckets.confirmer.length + buckets.silence.length;
  const dayTotal = total + doneToday;
  const ratio = dayTotal === 0 ? 0 : doneToday / dayTotal;
  const first = (userName || "toi").split(/\s|@/)[0] || "toi";
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });

  async function act(p: Prospect, kind: Bucket) {
    try {
      if (kind === "nouveau") await db.rpc("update_prospect", { p_id: p.id, p_stage: "en_convo" });
      else if (kind === "confirmer") await db.rpc("update_prospect", { p_id: p.id, p_stage: "rdv_pris" });
      else await db.rpc("bump_relance", { p_id: p.id });
      setRows((prev) => prev.filter((x) => x.id !== p.id));
      setDoneToday((n) => n + 1);
      flash(CHEERS[Math.floor(Math.random() * CHEERS.length)]);
    } catch {
      flash("Erreur — réessaie");
    }
  }

  function openFiche(p: Prospect) {
    setCurrent(p);
    setScreen("fiche");
    window.scrollTo(0, 0);
  }

  const visibleSections = SECTIONS.filter((s) => (filter === "all" || filter === s.key) && buckets[s.key].length > 0);
  const focusList = useMemo(
    () => [...buckets.nouveau, ...buckets.relancer, ...buckets.confirmer].slice(0, 8),
    [buckets]
  );

  return (
    <div className="sw-root">
      <SetWarStyle />

      {/* ─────────── AUJOURD'HUI ─────────── */}
      {screen === "today" && (
        <div className="sw-screen">
          <header className="sw-head">
            <div className="sw-top">
              <div className="sw-mark">Set<b>War</b></div>
              <div className="sw-date">{today}</div>
            </div>
            <div className="sw-hello">Salut {first}.</div>
            <div className="sw-sub">
              {loading ? "on charge ta journée…" : total === 0 ? "tout est traité pour aujourd'hui." : (
                <><b>{total} lead{total > 1 ? "s" : ""}</b> {total > 1 ? "t'attendent" : "t'attend"} aujourd'hui.</>
              )}
            </div>
            <div className="sw-prog">
              <div className="sw-bar"><i style={{ width: `${Math.round(ratio * 100)}%` }} /></div>
              <div className="sw-plbl"><span><b>{doneToday}</b> traités</span><span>{total} restants</span></div>
            </div>
          </header>

          {!loading && total > 0 && (
            <div className="sw-brief">
              <h3>🎯 Ton brief du jour</h3>
              <p>
                {buckets.nouveau.length > 0 && `${buckets.nouveau.length} nouveau${buckets.nouveau.length > 1 ? "x" : ""} à contacter vite`}
                {buckets.nouveau.length > 0 && (buckets.relancer.length > 0 || buckets.confirmer.length > 0) && ", "}
                {buckets.relancer.length > 0 && `${buckets.relancer.length} relance${buckets.relancer.length > 1 ? "s" : ""}`}
                {buckets.relancer.length > 0 && buckets.confirmer.length > 0 && ", "}
                {buckets.confirmer.length > 0 && `${buckets.confirmer.length} RDV à confirmer`}
                . Attaque les nouveaux en premier.
              </p>
              <button className="sw-go" onClick={() => { setScreen("focus"); }}>Démarrer ma journée →</button>
            </div>
          )}

          <div className="sw-fils">
            <button className={"sw-fil" + (filter === "all" ? " on" : "")} onClick={() => setFilter("all")}>Tout</button>
            {SECTIONS.map((s) => (
              <button key={s.key} className={"sw-fil" + (filter === s.key ? " on" : "") + (buckets[s.key].length === 0 ? " zero" : "")}
                onClick={() => setFilter(filter === s.key ? "all" : s.key)}>
                {s.label}<span className="sw-cnt">{buckets[s.key].length}</span>
              </button>
            ))}
          </div>

          <div className="sw-list">
            {loading && <div className="sw-loading">…</div>}
            {!loading && total === 0 && (
              <div className="sw-empty">
                <div className="sw-emark">🏆</div>
                <h3>Journée bouclée.</h3>
                <p>Rien ne t'a filé entre les doigts. Ajoute des leads ou reviens demain.</p>
              </div>
            )}
            {!loading && visibleSections.map((s) => (
              <React.Fragment key={s.key}>
                <div className="sw-sect">{s.head}</div>
                {buckets[s.key].map((p) => (
                  <ListRow key={p.id} p={p} bucket={s.key} onOpen={() => openFiche(p)} onAct={() => act(p, s.key)} />
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* ─────────── FICHE ─────────── */}
      {screen === "fiche" && current && (
        <Fiche
          p={current}
          onBack={() => { setScreen("today"); setCurrent(null); }}
          onSaved={(msg) => { flash(msg); load(); }}
        />
      )}

      {/* ─────────── FOCUS ─────────── */}
      {screen === "focus" && (
        <Focus
          leads={focusList}
          onExit={() => setScreen("today")}
          onAct={async (p, kind) => { await act(p, kind); }}
        />
      )}

      {/* ─────────── STATS ─────────── */}
      {screen === "stats" && <Stats stats={stats} first={first} />}

      {/* ─────────── VIVIER ─────────── */}
      {screen === "vivier" && (
        <Vivier
          rows={rows}
          onOpen={(p) => openFiche(p)}
          onRelance={async (p) => { await db.rpc("bump_relance", { p_id: p.id }); flash("Relancé"); load(); }}
        />
      )}

      {/* ─────────── PROFIL ─────────── */}
      {screen === "profil" && <Profil first={first} userName={userName} stats={stats} rows={rows} onFlash={flash} />}

      {/* ─────────── NAV ─────────── */}
      {(screen === "today" || screen === "stats" || screen === "vivier" || screen === "profil") && (
        <div className="sw-nav">
          <button className={"sw-navit" + (screen === "today" ? " on" : "")} onClick={() => setScreen("today")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10.5L12 3l9 7.5V21H3z" /></svg>
            Aujourd'hui
          </button>
          <button className={"sw-navit" + (screen === "vivier" ? " on" : "")} onClick={() => setScreen("vivier")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /></svg>
            Vivier
          </button>
          <button className="sw-navfab" onClick={() => setAddOpen(true)} aria-label="Ajouter">
            <svg viewBox="0 0 24 24" fill="none" stroke="#0B0F04" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <button className={"sw-navit" + (screen === "stats" ? " on" : "")} onClick={() => setScreen("stats")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 4-5" /></svg>
            Stats
          </button>
          <button className={"sw-navit" + (screen === "profil" ? " on" : "")} onClick={() => setScreen("profil")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
            Profil
          </button>
        </div>
      )}

      {cheer && <div className="sw-toast">{cheer}</div>}

      {addOpen && (
        <AddSheet onClose={() => setAddOpen(false)} onDone={(m) => { setAddOpen(false); flash(m); load(); }} />
      )}
    </div>
  );
}

/* ═══════════ Liste : une ligne ═══════════ */
function ListRow({ p, bucket, onOpen, onAct }: { p: Prospect; bucket: Bucket; onOpen: () => void; onAct: () => void }) {
  const sub =
    p.source === "inbound" ? (p.clipper_name ? `inbound · clip ${p.clipper_name}` : "inbound") :
    p.source === "froid" ? "froid" : "chaud";
  const body = p.interet || p.need || p.note;
  const tag = { nouveau: "Nouveau", relancer: "Relance", confirmer: "Confirmer", silence: "Silence" }[bucket];
  const when = {
    nouveau: "⚡ Réponds vite — un lead frais convertit mieux",
    relancer: "à relancer aujourd'hui",
    confirmer: p.rdv_at ? `RDV ${new Date(p.rdv_at).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" })} — confirme la veille` : "⏰ Confirme le RDV",
    silence: "une dernière relance avant de lâcher ?",
  }[bucket];
  const whenCls = bucket === "nouveau" || bucket === "confirmer" ? "hot" : bucket === "silence" ? "calm" : "";

  return (
    <div className="sw-row" onClick={onOpen}>
      <div className="sw-rtop">
        <div className={"sw-ava " + avaCls(bucket)}>{initialOf(p.handle)}</div>
        <div className="sw-rid">
          <div className="sw-rname">@{p.handle}</div>
          <div className="sw-rsub">{sub}{p.relance_count ? ` · ${p.relance_count} relance${p.relance_count > 1 ? "s" : ""}` : ""}</div>
        </div>
        <div className={"sw-rtag " + avaCls(bucket)}>{tag}</div>
        <div className="sw-chev">›</div>
      </div>
      {body && bucket === "relancer" && <div className="sw-rbody">« {body} »</div>}
      <div className={"sw-rwhen " + whenCls}>{when}</div>
      <button className={"sw-act" + (bucket === "confirmer" || bucket === "silence" ? " ghost" : "")}
        onClick={(e) => { e.stopPropagation(); onAct(); }}>
        {{ nouveau: "J'ai contacté", relancer: "J'ai relancé", confirmer: "RDV confirmé", silence: "J'ai relancé" }[bucket]}
      </button>
    </div>
  );
}

/* ═══════════ Fiche conversation + qualif + RDV ═══════════ */
function Fiche({ p, onBack, onSaved }: { p: Prospect; onBack: () => void; onSaved: (m: string) => void }) {
  const db = getSupabase();
  const [situation, setSituation] = useState(p.need || "");
  const [objectif, setObjectif] = useState(p.interet || "");
  const [budget, setBudget] = useState(p.budget || "");
  const [timing, setTiming] = useState("");
  const [note, setNote] = useState(p.note || "");
  const [rdvOpen, setRdvOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const stages = ["Contacté", "En convo", "Qualifié", "RDV", "Vendu"];
  const stageIdx =
    ["vendu"].includes(p.stage) ? 4 :
    ["rdv_pris", "rdv_honore"].includes(p.stage) ? 3 :
    p.qualified === "oui" || ["pret_appel"].includes(p.stage) ? 2 :
    ["en_convo", "repondu", "whatsapp"].includes(p.stage) ? 1 : 0;

  async function saveQualif() {
    setBusy(true);
    try {
      await db.rpc("update_prospect", {
        p_id: p.id,
        p_stage: "pret_appel",
        p_need: situation || null,
        p_interet: objectif || null,
        p_budget: budget || null,
        p_note: [note, timing ? `Timing: ${timing}` : ""].filter(Boolean).join(" · ") || null,
        p_qualified: situation && objectif && budget ? "oui" : null,
      });
      onSaved("Qualif enregistrée ✓");
      onBack();
    } catch {
      onSaved("Erreur — réessaie");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sw-fiche">
      <div className="sw-fhead">
        <div className="sw-fnav">
          <button className="sw-back" onClick={onBack}>‹</button>
          <div className="sw-date">{p.source === "inbound" ? "inbound" : p.source}{p.platform ? ` · ${p.platform}` : ""}</div>
        </div>
        <div className="sw-fwho">
          <div className="sw-ava hot">{initialOf(p.handle)}</div>
          <div>
            <h2>@{p.handle}</h2>
            <p>{p.clipper_name ? `clip ${p.clipper_name} · ` : ""}{p.relance_count} relance{p.relance_count > 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="sw-stagebar">
          {stages.map((s, i) => (
            <div key={s} className={"sw-stg" + (i < stageIdx ? " done" : i === stageIdx ? " cur" : "")}>{s}</div>
          ))}
        </div>
      </div>

      <div className="sw-fbody">
        <div className="sw-coachbox">💡 <b>Qualifie avant de vendre.</b> Fais parler {p.handle.split(".")[0]} : sa situation, son objectif, son budget, son timing. Une fois les 4 cochés, cale le RDV.</div>

        <div className="sw-qcard">
          <h4>Checklist de qualification</h4>
          <QField label="Situation actuelle" ph="Ex : créateur UGC, 15k abonnés…" value={situation} onChange={setSituation} />
          <QField label="Objectif" ph="Ex : scaler à 5k€/mois…" value={objectif} onChange={setObjectif} />
          <QField label="Budget" ph="Ex : 1500€, à valider…" value={budget} onChange={setBudget} />
          <QField label="Timing / urgence" ph="Ex : veut démarrer ce mois…" value={timing} onChange={setTiming} />
        </div>

        <label className="sw-lbl">Notes libres</label>
        <textarea className="sw-fld" rows={3} value={note} autoCapitalize="sentences"
          placeholder="Tout ce qui aide à conclure…" onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="sw-factions">
        <button className="sw-fbtn ghost" disabled={busy} onClick={saveQualif}>Enregistrer</button>
        <button className="sw-fbtn lime" onClick={() => setRdvOpen(true)}>Caler le RDV</button>
      </div>

      {rdvOpen && <RdvSheet p={p} onClose={() => setRdvOpen(false)} onDone={(m) => { setRdvOpen(false); onSaved(m); onBack(); }} />}
    </div>
  );
}

function QField({ label, ph, value, onChange }: { label: string; ph: string; value: string; onChange: (v: string) => void }) {
  const filled = value.trim().length > 0;
  return (
    <div className="sw-qitem">
      <div className={"sw-qcheck" + (filled ? " on" : "")}>
        <svg viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.2 3L13 4.5" stroke="#0B0F04" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <div className="sw-qlabel">
        <div className="sw-q">{label}</div>
        <input className="sw-qinput" value={value} placeholder={ph} autoCapitalize="sentences" onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

/* ═══════════ Feuille RDV ═══════════ */
function RdvSheet({ p, onClose, onDone }: { p: Prospect; onClose: () => void; onDone: (m: string) => void }) {
  const db = getSupabase();
  const [slot, setSlot] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const slots = useMemo(() => {
    const out: { label: string; date: Date }[] = [];
    const base = new Date();
    for (const [dayOffset, h] of [[1, 14], [1, 17], [2, 11], [2, 16]] as [number, number][]) {
      const d = new Date(base);
      d.setDate(d.getDate() + dayOffset);
      d.setHours(h, 0, 0, 0);
      out.push({ label: d.toLocaleDateString("fr-FR", { weekday: "short" }), date: d });
    }
    return out;
  }, []);

  async function book() {
    if (slot === null) return;
    setBusy(true);
    const rdv = slots[slot].date.toISOString();
    try {
      // fonction dédiée si la migration est passée…
      const { error } = await db.rpc("setwar_book_rdv", { p_id: p.id, p_rdv_at: rdv });
      if (error) throw error;
    } catch {
      // …sinon on avance au moins le stage (rdv_at sera écrit après migration)
      await db.rpc("update_prospect", { p_id: p.id, p_stage: "rdv_pris" });
    }
    setBusy(false);
    onDone("RDV calé 🎉");
  }

  return (
    <div className="sw-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sw-sheet">
        <div className="sw-grab" />
        <h3>Caler le RDV avec @{p.handle}</h3>
        <div className="sw-subh">Choisis un créneau — un tap et c'est booké.</div>
        <div className="sw-slots">
          {slots.map((s, i) => (
            <button key={i} className={"sw-slot" + (slot === i ? " on" : "")} onClick={() => setSlot(i)}>
              {s.label}<small>{s.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</small>
            </button>
          ))}
        </div>
        <button className="sw-fbtn lime" style={{ width: "100%" }} disabled={slot === null || busy} onClick={book}>
          {busy ? "…" : "Confirmer le RDV"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════ Focus guidé ═══════════ */
function Focus({ leads, onExit, onAct }: { leads: Prospect[]; onExit: () => void; onAct: (p: Prospect, kind: Bucket) => Promise<void> }) {
  const [i, setI] = useState(0);
  const [swiping, setSwiping] = useState(false);

  if (leads.length === 0) {
    return (
      <div className="sw-screen">
        <div className="sw-ftrack"><button className="sw-fx" onClick={onExit}>✕</button></div>
        <div className="sw-bilan">
          <div className="sw-bmk">🏆</div>
          <h1>Rien à traiter.</h1>
          <div className="sw-bp">Ta journée est déjà à jour. Reviens plus tard.</div>
          <button className="sw-fprim" style={{ maxWidth: 260, marginTop: 26 }} onClick={onExit}>Retour</button>
        </div>
      </div>
    );
  }

  if (i >= leads.length) {
    const rdv = leads.filter((l) => bucketOf(l) === "confirmer").length;
    return (
      <div className="sw-screen">
        <div className="sw-ftrack">
          <button className="sw-fx" onClick={onExit}>✕</button>
          <div className="sw-fsteps">{leads.map((_, k) => <div key={k} className="sw-fseg done"><i /></div>)}</div>
          <div className="sw-fcount"><b>{leads.length}</b>/{leads.length}</div>
        </div>
        <div className="sw-bilan">
          <div className="sw-bmk">🏆</div>
          <h1>Session bouclée.</h1>
          <div className="sw-bp">Tu as traité tes {leads.length} leads prioritaires. Beau travail.</div>
          <div className="sw-bstats">
            <div><b>{leads.length}</b><span>traités</span></div>
            <div><b>{rdv}</b><span>à confirmer</span></div>
          </div>
          <button className="sw-fprim" style={{ maxWidth: 260, marginTop: 30 }} onClick={onExit}>Retour à ma journée</button>
        </div>
      </div>
    );
  }

  const p = leads[i];
  const b = bucketOf(p) || "relancer";
  const kick = { nouveau: "Nouveau lead", relancer: "À relancer", confirmer: "RDV à confirmer", silence: "Silence radio" }[b];
  const why = {
    nouveau: "⚡ Réponds vite — lead frais",
    relancer: "à relancer aujourd'hui",
    confirmer: "⏰ Confirme la veille",
    silence: "silencieux depuis un moment",
  }[b];
  const coachL = { nouveau: "Comment l'ouvrir", relancer: "Le bon move", confirmer: "Un mot suffit", silence: "Dernière carte" }[b];
  const coach = {
    nouveau: "<b>Une question, pas un pitch.</b> « Hey, c'est quoi ton objectif là ? »",
    relancer: "Il est chaud. <b>Propose 2 créneaux</b> plutôt que « quand es-tu dispo ? »",
    confirmer: "« On est bien on demain ? Hâte 🙌 »",
    silence: "<b>Sois direct :</b> « Toujours partant, ou je te laisse tranquille ? »",
  }[b];
  const cta = { nouveau: "J'ai contacté", relancer: "J'ai relancé", confirmer: "RDV confirmé", silence: "J'ai relancé" }[b];
  const body = p.interet || p.need || p.note;

  function next(kind: Bucket | null) {
    setSwiping(true);
    setTimeout(async () => {
      if (kind) await onAct(p, kind);
      setI((n) => n + 1);
      setSwiping(false);
    }, 300);
  }

  return (
    <div className="sw-screen">
      <div className="sw-ftrack">
        <button className="sw-fx" onClick={onExit}>✕</button>
        <div className="sw-fsteps">
          {leads.map((_, k) => <div key={k} className={"sw-fseg" + (k < i ? " done" : "")}><i /></div>)}
        </div>
        <div className="sw-fcount"><b>{i + 1}</b>/{leads.length}</div>
      </div>

      <div className="sw-fstage">
        <div className={"sw-fkick" + (b === "nouveau" ? " hot" : "")}>{kick}</div>
        <div className={"sw-fcard" + (swiping ? " swipe" : " enter")}>
          <div className="sw-fwho2">
            <div className={"sw-ava " + avaCls(b)}>{initialOf(p.handle)}</div>
            <div><h2>@{p.handle}</h2><p>{p.source} · {p.relance_count} relance{p.relance_count > 1 ? "s" : ""}</p></div>
          </div>
          {body && <div className="sw-fquote">« {body} »</div>}
          <div className="sw-fwhy">{why}</div>
          <div className="sw-fcoach"><div className="l">{coachL}</div><span dangerouslySetInnerHTML={{ __html: coach }} /></div>
        </div>
      </div>

      <div className="sw-fdock">
        <button className="sw-fprim" onClick={() => next(b)}>{cta}</button>
        <div className="sw-fsec">
          <button onClick={() => next(null)}>Plus tard</button>
          <button onClick={() => next(null)}>Passer</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════ Stats setter ═══════════ */
function Stats({ stats, first }: { stats: any; first: string }) {
  const s = stats || {};
  const rdv = s.rdv || 0;
  const vendus = s.vendus || 0;
  const contacted = (s.froid_contacte || 0) + (s.froid_repondu || 0) + (s.froid_whatsapp || 0) + (s.en_convo || 0) + (s.pret_appel || 0) + rdv + vendus;
  const bookRate = contacted ? Math.round((rdv / contacted) * 100) : 0;
  const closeRate = rdv ? Math.round((vendus / rdv) * 100) : 0;

  const funnel: [string, number][] = [
    ["Contactés", contacted],
    ["Répondu", s.froid_repondu || 0],
    ["En convo", s.en_convo || 0],
    ["Prêt appel", s.pret_appel || 0],
    ["RDV", rdv],
    ["Vendus", vendus],
  ];
  const max = Math.max(1, ...funnel.map(([, n]) => n));

  return (
    <div className="sw-screen">
      <header className="sw-head">
        <div className="sw-top"><div className="sw-mark">Mes <b>stats</b></div><div className="sw-date">7 jours</div></div>
        <div className="sw-hello">Ta semaine, {first}.</div>
        <div className="sw-sub">Tout est calculé depuis tes gestes — rien à saisir.</div>
      </header>
      <div className="sw-list">
        <div className="sw-sect">Ce qui compte pour Keyan</div>
        <div className="sw-kpi"><div><div className="k">Booking rate</div><div className="v">{bookRate}<small>%</small></div></div><div className="hint">RDV / contacts</div></div>
        <div className="sw-kpi"><div><div className="k">Closing rate</div><div className="v">{closeRate}<small>%</small></div></div><div className="hint">ventes / RDV</div></div>
        <div className="sw-kpi"><div><div className="k">RDV bookés</div><div className="v">{rdv}</div></div><div className="hint">cette semaine</div></div>
        <div className="sw-kpi"><div><div className="k">Ventes</div><div className="v">{vendus}</div></div><div className="hint">closées</div></div>
        <div className="sw-sect">Ton funnel</div>
        <div className="sw-row">
          {funnel.map(([l, n]) => (
            <div key={l} className="sw-fnl">
              <div className="l">{l}</div>
              <div className="bar"><div style={{ width: `${Math.max(6, (n / max) * 100)}%` }} /></div>
              <div className="n">{n}</div>
            </div>
          ))}
        </div>
        <div className="sw-note-mini">CAC et LTV nécessitent tes coûts d'acquisition et paniers — on les ajoutera dans le dashboard de Keyan.</div>
      </div>
    </div>
  );
}

/* ═══════════ Vivier : CRM complet ═══════════ */
function Vivier({ rows, onOpen, onRelance }: { rows: Prospect[]; onOpen: (p: Prospect) => void; onRelance: (p: Prospect) => void }) {
  const [q, setQ] = useState("");
  const [stg, setStg] = useState<string>("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of rows) c[p.stage] = (c[p.stage] || 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((p) => (stg === "all" ? true : p.stage === stg))
      .filter((p) => (!needle ? true : (p.handle + " " + (p.interet || "") + " " + (p.need || "") + " " + (p.note || "")).toLowerCase().includes(needle)))
      .sort((a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime());
  }, [rows, q, stg]);

  const stagesPresent = ALL_STAGES.filter((s) => counts[s.v]);

  return (
    <div className="sw-screen">
      <header className="sw-head">
        <div className="sw-top"><div className="sw-mark">Ton <b>vivier</b></div><div className="sw-date">{rows.length} prospects</div></div>
        <div className="sw-hello">Tout ton pipeline.</div>
        <div className="sw-searchbar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <input placeholder="Chercher un @pseudo, un besoin…" value={q} autoCapitalize="none" autoCorrect="off" onChange={(e) => setQ(e.target.value)} />
          {q && <button className="sw-clr" onClick={() => setQ("")}>✕</button>}
        </div>
      </header>

      <div className="sw-fils">
        <button className={"sw-fil" + (stg === "all" ? " on" : "")} onClick={() => setStg("all")}>Tous <span className="sw-cnt">{rows.length}</span></button>
        {stagesPresent.map((s) => (
          <button key={s.v} className={"sw-fil" + (stg === s.v ? " on" : "")} onClick={() => setStg(stg === s.v ? "all" : s.v)}>
            {s.l}<span className="sw-cnt">{counts[s.v]}</span>
          </button>
        ))}
      </div>

      <div className="sw-list">
        {filtered.length === 0 && (
          <div className="sw-empty"><div className="sw-emark">🔍</div><h3>Rien ici.</h3><p>Aucun prospect ne correspond.</p></div>
        )}
        {filtered.map((p) => {
          const done = DONE_STAGES.includes(p.stage);
          return (
            <div key={p.id} className="sw-vrow" onClick={() => onOpen(p)}>
              <div className={"sw-ava " + (p.stage === "vendu" ? "hot" : p.stage === "rdv_pris" ? "blue" : "")}>{initialOf(p.handle)}</div>
              <div className="sw-rid">
                <div className="sw-rname">@{p.handle}</div>
                <div className="sw-rsub">{p.interet || p.need || p.source}{p.rdv_at ? ` · RDV ${new Date(p.rdv_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}` : ""}</div>
              </div>
              <div className="sw-vstage" data-s={p.stage}>{stageLabel(p.stage)}</div>
              {!done && (
                <button className="sw-vquick" onClick={(e) => { e.stopPropagation(); onRelance(p); }} aria-label="Relancer">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════ Profil : identité, niveau, série, réglages ═══════════ */
function Profil({ first, userName, stats, rows, onFlash }: { first: string; userName?: string; stats: any; rows: Prospect[]; onFlash: (m: string) => void }) {
  const db = getSupabase();
  const s = stats || {};
  const vendus = s.vendus || 0;
  const rdv = s.rdv || 0;

  // niveau simple basé sur les résultats vérifiables (ventes + RDV)
  const score = vendus * 3 + rdv;
  const level = score >= 30 ? { name: "Pro", pct: 100, next: null } :
                score >= 12 ? { name: "Confirmé", pct: Math.round(((score - 12) / 18) * 100), next: "Pro" } :
                { name: "Débutant", pct: Math.round((score / 12) * 100), next: "Confirmé" };

  const totalProspects = rows.length;
  const active = rows.filter((p) => !DONE_STAGES.includes(p.stage)).length;

  async function logout() {
    await db.auth.signOut();
    onFlash("Déconnexion…");
  }

  return (
    <div className="sw-screen">
      <header className="sw-head">
        <div className="sw-top"><div className="sw-mark">Ton <b>profil</b></div></div>
        <div className="sw-pidentity">
          <div className="sw-ava hot" style={{ width: 64, height: 64, fontSize: 26, borderRadius: 20 }}>{initialOf(first)}</div>
          <div>
            <div className="sw-pname">{userName || first}</div>
            <div className="sw-prole">Setter · niveau {level.name}</div>
          </div>
        </div>
      </header>

      <div className="sw-list">
        <div className="sw-sect">Ta progression</div>
        <div className="sw-levelcard">
          <div className="sw-leveltop">
            <span className="sw-levelname">{level.name}</span>
            {level.next && <span className="sw-levelnext">→ {level.next}</span>}
          </div>
          <div className="sw-levelbar"><i style={{ width: `${level.pct}%` }} /></div>
          <div className="sw-levelhint">
            {level.next ? `Encore quelques ventes et RDV pour débloquer ${level.next}.` : "Niveau max atteint. Tu es au sommet 🔥"}
          </div>
        </div>

        <div className="sw-pgrid">
          <div className="sw-pstat"><b>{vendus}</b><span>ventes</span></div>
          <div className="sw-pstat"><b>{rdv}</b><span>RDV</span></div>
          <div className="sw-pstat"><b>{active}</b><span>en cours</span></div>
          <div className="sw-pstat"><b>{totalProspects}</b><span>au total</span></div>
        </div>

        <div className="sw-sect">Réglages</div>
        <button className="sw-prow" onClick={() => onFlash("Bientôt — notifications")}>
          <span>🔔 Notifications</span><span className="sw-parr">›</span>
        </button>
        <button className="sw-prow" onClick={() => onFlash("Bientôt — script froid")}>
          <span>💬 Mon script d'approche</span><span className="sw-parr">›</span>
        </button>
        <button className="sw-prow" onClick={() => onFlash("Bientôt — aide")}>
          <span>❓ Aide & astuces</span><span className="sw-parr">›</span>
        </button>
        <button className="sw-prow logout" onClick={logout}>
          <span>Se déconnecter</span>
        </button>

        <div className="sw-note-mini">SetWar · console setter — connecté à ClipWar.</div>
      </div>
    </div>
  );
}


/* ═══════════ Ajout prospect ═══════════ */
function AddSheet({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const db = getSupabase();
  const [val, setVal] = useState("");
  const [bulk, setBulk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const preview = !bulk ? parseHandle(val) : null;

  async function paste() {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) setVal(clip.trim());
    } catch {
      setErr("Colle manuellement dans le champ.");
    }
  }

  async function save() {
    setErr(null);
    setBusy(true);
    try {
      if (bulk) {
        const handles = val.split(/[\n,]+/).map((x) => parseHandle(x)).filter((x): x is { handle: string; platform: string | null } => !!x).map((x) => x.handle);
        if (!handles.length) { setErr("Aucun pseudo valide."); setBusy(false); return; }
        const { error } = await db.rpc("add_prospects_bulk", { p_handles: handles, p_source: "froid" });
        if (error) throw error;
        onDone(`${handles.length} prospects ajoutés`);
      } else {
        const h = parseHandle(val);
        if (!h) { setErr("Pseudo invalide. Colle un lien ou tape @pseudo."); setBusy(false); return; }
        const { error } = await db.rpc("add_prospect", { p_handle: h.handle, p_clipper: null, p_need: null, p_source: "froid" });
        if (error) throw error;
        onDone(`@${h.handle} ajouté`);
      }
    } catch (e: any) {
      setErr(e?.message || "Impossible d'ajouter — réessaie.");
      setBusy(false);
    }
  }

  return (
    <div className="sw-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sw-sheet">
        <div className="sw-grab" />
        <h3>Noter un prospect</h3>
        <div className="sw-seg">
          <button className={!bulk ? "on" : ""} onClick={() => setBulk(false)}>Un</button>
          <button className={bulk ? "on" : ""} onClick={() => setBulk(true)}>En lot</button>
        </div>
        {!bulk ? (
          <>
            <label className="sw-lbl">Colle un lien Insta/TikTok, ou tape un @pseudo</label>
            <div className="sw-fldrow">
              <input className="sw-fld" autoFocus inputMode="text" autoCapitalize="none" autoCorrect="off"
                placeholder="@le.pseudo" value={val} onChange={(e) => setVal(e.target.value)} />
              <button type="button" className="sw-paste" onClick={paste}>Coller</button>
            </div>
            {preview && <div className="sw-prev">→ <b>@{preview.handle}</b>{preview.platform ? ` · ${preview.platform}` : ""}</div>}
          </>
        ) : (
          <>
            <label className="sw-lbl">Colle plusieurs liens/pseudos (un par ligne)</label>
            <textarea className="sw-fld" rows={5} autoCapitalize="none" autoCorrect="off"
              placeholder={"instagram.com/lea.fit\ntiktok.com/@marc.ugc\n@sami.k"} value={val} onChange={(e) => setVal(e.target.value)} />
          </>
        )}
        {err && <div className="sw-err">{err}</div>}
        <button className="sw-act sw-save" disabled={busy || (!bulk && !preview)} onClick={save}>
          {busy ? "…" : bulk ? "Ajouter le lot" : "Ajouter"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════ Styles ═══════════ */
function SetWarStyle() {
  return (
    <style>{`
    .sw-root{--bg:#FBFAF8;--bg2:#F2F1EC;--card:#FFFFFF;--card2:#F7F6F2;--line:#ECEAE3;--line2:#E1DED5;--txt:#15140F;--mut:#6E6B62;--mut2:#A6A399;--lime:#3A6B2E;--lime-dim:#EAF3E4;--lime-ink:#FFFFFF;--hot:#C4551F;--blue:#2F6FD6;--blue-dim:#E6EFFB;--track:#EDEBE4;--sh:0 1px 3px rgba(20,18,10,.05),0 4px 16px rgba(20,18,10,.04);font-family:"Manrope","Inter",system-ui,sans-serif;color:var(--txt);background:var(--bg);min-height:100dvh;max-width:520px;margin:0 auto;position:relative;-webkit-tap-highlight-color:transparent;-webkit-font-smoothing:antialiased}
    .sw-root *{box-sizing:border-box}
    .sw-screen{display:flex;flex-direction:column;min-height:100dvh;padding-bottom:96px;animation:sw-fade .3s}
    @keyframes sw-fade{from{opacity:0}to{opacity:1}}
    .sw-head{padding:32px 22px 12px}
    .sw-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px}
    .sw-mark{font-weight:800;font-size:17px}.sw-mark b{color:var(--lime)}
    .sw-date{font-size:12px;font-weight:700;color:var(--mut);background:var(--card);border:1px solid var(--line);padding:6px 11px;border-radius:20px;text-transform:capitalize}
    .sw-hello{font-size:29px;font-weight:800;letter-spacing:-.03em;line-height:1.05}
    .sw-sub{margin-top:8px;font-size:14px;color:var(--mut);font-weight:500}.sw-sub b{color:var(--lime);font-weight:700}
    .sw-prog{margin-top:18px}
    .sw-bar{height:5px;border-radius:20px;background:var(--track);overflow:hidden}
    .sw-bar i{display:block;height:100%;background:var(--lime);border-radius:20px;transition:width .5s;}
    .sw-plbl{display:flex;justify-content:space-between;margin-top:8px;font-size:11.5px;color:var(--mut2);font-weight:600}.sw-plbl b{color:var(--txt)}
    .sw-brief{margin:14px 22px 0;background:linear-gradient(160deg,var(--lime-dim),transparent);border:1px solid rgba(58,107,46,.2);border-radius:20px;padding:18px}
    .sw-brief h3{font-size:15px;font-weight:800;margin-bottom:5px}
    .sw-brief p{font-size:13px;color:var(--mut);line-height:1.5;margin-bottom:14px}
    .sw-go{width:100%;background:var(--lime);color:var(--lime-ink);font-weight:800;font-size:15px;padding:15px;border:none;border-radius:14px;cursor:pointer}
    .sw-fils{display:flex;gap:8px;padding:14px 22px 4px;overflow-x:auto}
    .sw-fils::-webkit-scrollbar{display:none}
    .sw-fil{flex:none;display:flex;align-items:center;gap:7px;background:var(--card);border:1px solid var(--line);padding:9px 14px;border-radius:12px;font-size:13px;font-weight:600;color:var(--mut);cursor:pointer;font-family:inherit}
    .sw-fil.on{background:var(--txt);color:var(--bg)}
    .sw-cnt{font-size:11px;font-weight:800;min-width:18px;height:18px;padding:0 5px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:var(--lime);color:var(--lime-ink)}
    .sw-fil.on .sw-cnt{background:var(--bg);color:var(--lime)}
    .sw-fil.zero{opacity:.4}.sw-fil.zero .sw-cnt{background:var(--line2);color:var(--mut)}
    .sw-list{padding:14px 16px 0}
    .sw-loading{padding:40px;text-align:center;color:var(--mut2)}
    .sw-sect{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--mut2);padding:14px 8px 10px}
    .sw-row{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:15px;margin-bottom:10px;cursor:pointer;box-shadow:var(--sh);transition:transform .2s,box-shadow .2s}
    .sw-row:active{transform:scale(.99);border-color:var(--line2)}
    .sw-rtop{display:flex;align-items:center;gap:12px}
    .sw-ava{width:44px;height:44px;border-radius:13px;flex:none;background:var(--card2);border:1px solid var(--line2);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px;color:var(--mut)}
    .sw-ava.hot{background:var(--lime-dim);border-color:rgba(58,107,46,.3);color:var(--lime)}
    .sw-ava.blue{background:var(--blue-dim);border-color:rgba(107,167,255,.3);color:var(--blue)}
    .sw-rid{flex:1;min-width:0}
    .sw-rname{font-weight:700;font-size:16px;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sw-rsub{font-size:12.5px;color:var(--mut2);margin-top:2px;font-weight:500}
    .sw-rtag{font-size:10px;font-weight:800;letter-spacing:.02em;color:var(--mut);border:1px solid var(--line2);padding:4px 8px;border-radius:7px;text-transform:uppercase;white-space:nowrap}
    .sw-rtag.hot{color:var(--lime);border-color:rgba(58,107,46,.3)}
    .sw-rtag.blue{color:var(--blue);border-color:rgba(107,167,255,.3)}
    .sw-chev{color:var(--mut2);font-size:20px;margin-left:2px}
    .sw-rbody{font-size:13.5px;color:var(--mut);line-height:1.5;margin:11px 2px 0;font-style:italic}
    .sw-rwhen{font-size:12.5px;margin:10px 2px 0;font-weight:600;color:var(--lime)}
    .sw-rwhen.hot{color:var(--hot)}.sw-rwhen.calm{color:var(--mut2);font-weight:500}
    .sw-act{margin-top:13px;width:100%;border:none;border-radius:13px;padding:13px;font-family:inherit;font-weight:700;font-size:14.5px;cursor:pointer;background:var(--lime);color:var(--lime-ink);letter-spacing:-.01em}
    .sw-act.ghost{background:transparent;color:var(--txt);border:1px solid var(--line2)}
    .sw-act:active{transform:scale(.98)}.sw-act:disabled{opacity:.5}
    .sw-empty{text-align:center;padding:56px 30px}
    .sw-emark{width:56px;height:56px;border-radius:18px;margin:0 auto 16px;background:var(--lime-dim);border:1px solid rgba(58,107,46,.25);display:flex;align-items:center;justify-content:center;font-size:26px}
    .sw-empty h3{font-size:18px;font-weight:800}
    .sw-empty p{font-size:13.5px;color:var(--mut2);margin-top:6px;line-height:1.5}
    /* fiche */
    .sw-fiche{min-height:100dvh;padding-bottom:96px;animation:sw-fade .3s}
    .sw-fhead{padding:26px 22px 18px;background:linear-gradient(160deg,var(--card),transparent);border-bottom:1px solid var(--line)}
    .sw-fnav{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
    .sw-back{width:38px;height:38px;border-radius:12px;background:var(--card);border:1px solid var(--line2);color:var(--txt);font-size:20px;cursor:pointer}
    .sw-fwho{display:flex;align-items:center;gap:14px}
    .sw-fwho .sw-ava{width:56px;height:56px;font-size:22px;border-radius:17px}
    .sw-fwho h2{font-size:22px;font-weight:800;letter-spacing:-.02em}
    .sw-fwho p{font-size:13px;color:var(--mut2);margin-top:2px}
    .sw-stagebar{display:flex;gap:5px;margin-top:18px}
    .sw-stg{flex:1;text-align:center;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--mut2);padding:7px 2px;border-radius:8px;background:var(--card);border:1px solid var(--line)}
    .sw-stg.done{color:var(--lime-ink);background:var(--lime);border-color:var(--lime)}
    .sw-stg.cur{color:var(--lime);border-color:var(--lime)}
    .sw-fbody{padding:20px 22px}
    .sw-coachbox{background:var(--blue-dim);border:1px solid rgba(107,167,255,.2);border-radius:14px;padding:14px 16px;margin-bottom:14px;font-size:13px;color:#2A5599;line-height:1.55}
    .sw-coachbox b{color:#1E3F70}
    .sw-qcard{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px;margin-bottom:16px;box-shadow:var(--sh)}
    .sw-qcard h4{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--mut2);margin-bottom:8px}
    .sw-qitem{display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}
    .sw-qitem:last-child{border-bottom:none}
    .sw-qcheck{width:26px;height:26px;border-radius:8px;border:2px solid var(--line2);flex:none;display:flex;align-items:center;justify-content:center;margin-top:2px;transition:all .2s}
    .sw-qcheck.on{background:var(--lime);border-color:var(--lime)}
    .sw-qcheck svg{width:15px;height:15px;opacity:0;transition:opacity .2s}
    .sw-qcheck.on svg{opacity:1}
    .sw-qlabel{flex:1;min-width:0}
    .sw-q{font-size:14px;font-weight:600;margin-bottom:3px}
    .sw-qinput{width:100%;background:transparent;border:none;color:var(--txt);font-family:inherit;font-size:13px;outline:none;padding:0}
    .sw-qinput::placeholder{color:var(--mut2);font-style:italic}
    .sw-lbl{font-size:12px;color:var(--mut);display:block;margin-bottom:8px}
    .sw-fld{width:100%;background:var(--bg2);border:1px solid var(--line2);border-radius:12px;padding:13px 14px;color:var(--txt);font-family:inherit;font-size:16px;outline:none;resize:none}
    .sw-fld:focus{border-color:var(--lime)}
    .sw-factions{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:520px;padding:14px 22px calc(16px + env(safe-area-inset-bottom));background:linear-gradient(to top,var(--bg) 70%,transparent);display:flex;gap:10px}
    .sw-fbtn{flex:1;border:none;border-radius:15px;padding:15px;font-family:inherit;font-weight:800;font-size:14.5px;cursor:pointer;text-align:center}
    .sw-fbtn.lime{background:var(--lime);color:var(--lime-ink)}
    .sw-fbtn.ghost{background:transparent;border:1px solid var(--line2);color:var(--txt)}
    .sw-fbtn:disabled{opacity:.5}
    /* modale */
    .sw-scrim{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.65);display:flex;align-items:flex-end;justify-content:center}
    .sw-sheet{width:100%;max-width:520px;background:var(--card);border-radius:24px 24px 0 0;padding:10px 22px calc(26px + env(safe-area-inset-bottom));border-top:1px solid var(--line2);animation:sw-up .3s cubic-bezier(.2,.9,.3,1)}
    @keyframes sw-up{from{transform:translateY(100%)}to{transform:none}}
    .sw-grab{width:38px;height:4px;border-radius:3px;background:var(--mut2);margin:6px auto 16px;opacity:.5}
    .sw-sheet h3{font-size:19px;font-weight:800;margin-bottom:4px}
    .sw-subh{font-size:13px;color:var(--mut);margin-bottom:18px}
    .sw-slots{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
    .sw-slot{background:var(--bg2);border:1px solid var(--line2);border-radius:13px;padding:13px;text-align:center;font-weight:700;font-size:14px;color:var(--txt);font-family:inherit;cursor:pointer;text-transform:capitalize}
    .sw-slot.on{background:var(--lime);color:var(--lime-ink);border-color:var(--lime)}
    .sw-slot small{display:block;font-size:11px;opacity:.7;margin-top:2px;font-weight:600}
    .sw-seg{display:flex;gap:6px;background:var(--bg2);border-radius:12px;padding:4px;margin-bottom:16px}
    .sw-seg button{flex:1;border:none;background:transparent;color:var(--mut);font-family:inherit;font-weight:700;font-size:13px;padding:9px;border-radius:9px;cursor:pointer}
    .sw-seg button.on{background:var(--lime);color:var(--lime-ink)}
    .sw-fldrow{display:flex;gap:8px;align-items:stretch}
    .sw-fldrow .sw-fld{flex:1;min-width:0;width:auto}
    .sw-paste{flex:none;background:var(--card2);border:1px solid var(--line2);border-radius:12px;color:var(--txt);font-family:inherit;font-weight:700;font-size:13px;padding:0 15px;cursor:pointer}
    .sw-prev{margin-top:10px;font-size:14px;color:var(--lime)}.sw-prev b{color:#fff}
    .sw-err{margin-top:12px;font-size:12.5px;color:#C4551F;background:#FBEDE4;border:1px solid #F1D9C9;border-radius:10px;padding:10px 12px;line-height:1.4}
    .sw-save{margin-top:16px}
    /* focus */
    .sw-ftrack{padding:22px 22px 6px;display:flex;align-items:center;gap:12px}
    .sw-fx{width:34px;height:34px;border-radius:11px;border:1px solid var(--line2);background:var(--card);color:var(--mut);font-size:16px;cursor:pointer}
    .sw-fsteps{flex:1;display:flex;gap:5px}
    .sw-fseg{flex:1;height:5px;border-radius:20px;background:var(--track);overflow:hidden}
    .sw-fseg i{display:block;height:100%;width:0;background:var(--lime);border-radius:20px;transition:width .5s}
    .sw-fseg.done i{width:100%}
    .sw-fcount{font-size:12px;font-weight:700;color:var(--mut)}.sw-fcount b{color:var(--txt)}
    .sw-fstage{flex:1;display:flex;flex-direction:column;justify-content:center;padding:8px 22px 0}
    .sw-fkick{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--lime);margin-bottom:14px}
    .sw-fkick.hot{color:var(--hot)}
    .sw-fcard{background:var(--card);border:1px solid var(--line);border-radius:26px;padding:26px 24px;transition:transform .3s cubic-bezier(.2,.9,.3,1),opacity .3s}
    .sw-fcard.enter{animation:sw-enter .4s cubic-bezier(.2,.9,.3,1)}
    .sw-fcard.swipe{transform:translateX(-120%) rotate(-4deg);opacity:0}
    @keyframes sw-enter{from{transform:translateX(60%) rotate(3deg);opacity:0}to{transform:none;opacity:1}}
    .sw-fwho2{display:flex;align-items:center;gap:15px;margin-bottom:18px}
    .sw-fwho2 .sw-ava{width:58px;height:58px;border-radius:18px;font-size:23px}
    .sw-fwho2 h2{font-size:23px;font-weight:800;letter-spacing:-.02em}
    .sw-fwho2 p{font-size:13px;color:var(--mut2);margin-top:3px}
    .sw-fquote{font-size:15.5px;line-height:1.55;margin-bottom:16px;font-weight:500;font-style:italic;color:var(--mut)}
    .sw-fwhy{display:inline-flex;gap:7px;font-size:13px;font-weight:600;color:var(--lime);background:var(--lime-dim);padding:8px 13px;border-radius:20px;margin-bottom:16px}
    .sw-fcoach{padding:14px 16px;background:var(--bg);border:1px solid var(--line);border-radius:16px;font-size:13.5px;color:var(--mut);line-height:1.5}
    .sw-fcoach .l{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--mut2);margin-bottom:6px}
    .sw-fcoach b{color:var(--txt)}
    .sw-fdock{padding:16px 22px calc(20px + env(safe-area-inset-bottom))}
    .sw-fprim{width:100%;border:none;border-radius:17px;padding:17px;font-family:inherit;font-weight:800;font-size:16px;background:var(--lime);color:var(--lime-ink);cursor:pointer}
    .sw-fsec{display:flex;gap:10px;margin-top:10px}
    .sw-fsec button{flex:1;border:1px solid var(--line2);background:transparent;color:var(--mut);border-radius:14px;padding:12px;font-family:inherit;font-weight:600;font-size:13px;cursor:pointer}
    .sw-bilan{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px 30px}
    .sw-bmk{width:76px;height:76px;border-radius:24px;background:var(--lime-dim);border:1px solid rgba(58,107,46,.3);display:flex;align-items:center;justify-content:center;margin-bottom:20px;font-size:36px}
    .sw-bilan h1{font-size:25px;font-weight:800}
    .sw-bp{font-size:14px;color:var(--mut);margin-top:8px;line-height:1.5;max-width:280px}
    .sw-bstats{display:flex;gap:30px;margin-top:26px}
    .sw-bstats div b{display:block;font-size:28px;font-weight:800;color:var(--lime)}
    .sw-bstats div span{font-size:11px;color:var(--mut2);text-transform:uppercase;letter-spacing:.05em;font-weight:700}
    /* stats */
    .sw-kpi{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;box-shadow:var(--sh)}
    .sw-kpi .k{font-size:13px;color:var(--mut)}
    .sw-kpi .v{font-size:26px;font-weight:800;margin-top:2px}
    .sw-kpi .v small{font-size:15px;color:var(--mut)}
    .sw-kpi .hint{font-size:11px;color:var(--mut2);text-align:right;font-weight:600}
    .sw-fnl{display:flex;align-items:center;gap:10px;margin-bottom:8px}
    .sw-fnl .l{width:80px;font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.3px;font-weight:700}
    .sw-fnl .bar{flex:1;height:16px;background:var(--bg2);border-radius:6px;overflow:hidden}
    .sw-fnl .bar div{height:100%;background:var(--lime);border-radius:6px}
    .sw-fnl .n{width:26px;text-align:right;font-weight:800}
    .sw-note-mini{font-size:12px;color:var(--mut2);line-height:1.5;padding:14px 8px;font-style:italic}
    /* vivier */
    .sw-searchbar{display:flex;align-items:center;gap:10px;margin-top:16px;background:var(--card);border:1px solid var(--line2);border-radius:14px;padding:0 14px}
    .sw-searchbar svg{width:18px;height:18px;color:var(--mut2);flex:none}
    .sw-searchbar input{flex:1;background:none;border:none;color:var(--txt);font-family:inherit;font-size:15px;padding:13px 0;outline:none}
    .sw-searchbar input::placeholder{color:var(--mut2)}
    .sw-clr{background:none;border:none;color:var(--mut2);font-size:15px;cursor:pointer;padding:4px}
    .sw-vrow{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px 14px;margin-bottom:9px;cursor:pointer;box-shadow:var(--sh);transition:transform .2s}
    .sw-vrow:active{transform:scale(.99);border-color:var(--line2)}
    .sw-vrow .sw-ava{width:40px;height:40px;font-size:15px;border-radius:12px}
    .sw-vstage{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.02em;color:var(--mut);border:1px solid var(--line2);padding:4px 8px;border-radius:7px;white-space:nowrap}
    .sw-vstage[data-s="vendu"]{color:var(--lime);border-color:rgba(58,107,46,.3)}
    .sw-vstage[data-s="rdv_pris"],.sw-vstage[data-s="rdv_honore"]{color:var(--blue);border-color:rgba(107,167,255,.3)}
    .sw-vstage[data-s="perdu"]{color:var(--mut2);opacity:.7}
    .sw-vquick{flex:none;width:36px;height:36px;border-radius:11px;background:var(--card2);border:1px solid var(--line2);color:var(--mut);display:flex;align-items:center;justify-content:center;cursor:pointer}
    .sw-vquick svg{width:17px;height:17px}
    .sw-vquick:active{background:var(--lime);color:var(--lime-ink)}
    /* profil */
    .sw-pidentity{display:flex;align-items:center;gap:15px;margin-top:14px}
    .sw-pname{font-size:22px;font-weight:800;letter-spacing:-.02em}
    .sw-prole{font-size:13px;color:var(--mut);margin-top:3px;font-weight:500}
    .sw-levelcard{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px;margin-bottom:14px;box-shadow:var(--sh)}
    .sw-leveltop{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
    .sw-levelname{font-size:16px;font-weight:800;color:var(--lime)}
    .sw-levelnext{font-size:12px;font-weight:700;color:var(--mut2)}
    .sw-levelbar{height:8px;border-radius:20px;background:var(--track);overflow:hidden}
    .sw-levelbar i{display:block;height:100%;background:var(--lime);border-radius:20px;;transition:width .5s}
    .sw-levelhint{font-size:12.5px;color:var(--mut);margin-top:10px;line-height:1.5}
    .sw-pgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:6px}
    .sw-pstat{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 6px;text-align:center;box-shadow:var(--sh)}
    .sw-pstat b{display:block;font-size:22px;font-weight:800}
    .sw-pstat span{font-size:10px;color:var(--mut2);text-transform:uppercase;letter-spacing:.03em;font-weight:700}
    .sw-prow{width:100%;display:flex;align-items:center;justify-content:space-between;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:15px 16px;margin-bottom:9px;font-family:inherit;font-size:14.5px;font-weight:600;color:var(--txt);cursor:pointer;box-shadow:var(--sh)}
    .sw-parr{color:var(--mut2);font-size:18px}
    .sw-prow.logout{justify-content:center;color:var(--hot);border-color:rgba(255,139,107,.25);margin-top:6px}
    /* nav */
    .sw-nav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:520px;display:flex;align-items:center;justify-content:space-around;padding:12px 20px calc(14px + env(safe-area-inset-bottom));background:linear-gradient(to top,var(--bg) 60%,transparent);z-index:20}
    .sw-navit{background:none;border:none;color:var(--mut2);display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10px;font-weight:600;cursor:pointer;font-family:inherit}
    .sw-navit.on{color:var(--txt)}
    .sw-navit svg{width:22px;height:22px}
    .sw-navfab{width:52px;height:52px;border-radius:16px;background:var(--lime);border:none;display:flex;align-items:center;justify-content:center;cursor:pointer}
    .sw-navfab svg{width:24px;height:24px}
    .sw-toast{position:fixed;bottom:100px;left:50%;transform:translateX(-50%);z-index:80;background:var(--txt);color:var(--bg);font-weight:700;font-size:13px;padding:11px 18px;border-radius:13px;box-shadow:0 10px 30px rgba(0,0,0,.5);animation:sw-tin .28s ease}
    @keyframes sw-tin{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}
    `}</style>
  );
}
