"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

/* ─────────────────────────────────────────────────────────────
   SetWar · Aujourd'hui  —  skin "premium" (nuit encre + accent lime)
   Branché sur les RPC ClipWar existantes — AUCUNE migration requise.
   Un moment = un geste = un chiffre. Le geste avance le prospect ET
   nourrit les chiffres, sans reporting séparé.
────────────────────────────────────────────────────────────── */

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
  next_action?: string | null;
  next_action_due?: string | null;
  contacted_at?: string | null;
  confirmed_at?: string | null;
};

type Bucket = "nouveau" | "relancer" | "confirmer" | "silence";

const RELANCE_STAGES = ["en_convo", "repondu", "pret_appel", "whatsapp"];

function startOfTomorrow(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function bucketOf(p: Prospect): Bucket | null {
  if (p.stage === "nouveau") return "nouveau";
  if (p.stage === "rdv_pris") {
    if (!p.rdv_at) return p.confirmed_at ? null : "confirmer";
    const t = new Date(p.rdv_at).getTime();
    if (t <= startOfTomorrow() + 24 * 3600 * 1000 && !p.confirmed_at) return "confirmer";
    return null;
  }
  if (p.stage === "contacte" && p.stale) return "silence";
  if (RELANCE_STAGES.includes(p.stage)) {
    const due = p.next_action_due
      ? new Date(p.next_action_due).getTime() <= startOfTomorrow()
      : p.stale;
    if (due) return "relancer";
  }
  return null;
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

export default function SetWar({ userName }: { userName?: string }) {
  const db = getSupabase();
  const [rows, setRows] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [cheer, setCheer] = useState<string | null>(null);
  const [doneToday, setDoneToday] = useState(0);
  const [filter, setFilter] = useState<"all" | Bucket>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await db.rpc("setter_prospects");
    setRows((data as Prospect[]) || []);
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

  const total =
    buckets.nouveau.length + buckets.relancer.length + buckets.confirmer.length + buckets.silence.length;
  const dayTotal = total + doneToday;
  const ratio = dayTotal === 0 ? 0 : doneToday / dayTotal;

  async function act(p: Prospect, kind: Bucket) {
    if (busy) return;
    setBusy(p.id);
    try {
      if (kind === "nouveau") {
        await db.rpc("update_prospect", { p_id: p.id, p_stage: "contacte" });
      } else if (kind === "relancer" || kind === "silence") {
        await db.rpc("bump_relance", { p_id: p.id });
      } else if (kind === "confirmer") {
        try {
          await db.rpc("setwar_confirm", { p_id: p.id });
        } catch {
          /* migration pas encore passée — on avance quand même localement */
        }
      }
      setRows((prev) => prev.filter((x) => x.id !== p.id));
      setDoneToday((n) => n + 1);
      flash(CHEERS[Math.floor(Math.random() * CHEERS.length)]);
    } finally {
      setBusy(null);
    }
  }

  const first = (userName || "toi").split(/\s|@/)[0] || "toi";
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });

  const visibleSections = SECTIONS.filter(
    (s) => (filter === "all" || filter === s.key) && buckets[s.key].length > 0
  );

  return (
    <div className="sw-root">
      <SetWarStyle />

      <header className="sw-head">
        <div className="sw-top">
          <div className="sw-mark">
            Set<b>War</b>
          </div>
          <div className="sw-date">{today}</div>
        </div>
        <div className="sw-hello">Salut {first}.</div>
        <div className="sw-sub">
          {loading ? (
            "on charge ta journée…"
          ) : total === 0 ? (
            "tout est traité pour aujourd'hui."
          ) : (
            <>
              <b>
                {total} lead{total > 1 ? "s" : ""}
              </b>{" "}
              {total > 1 ? "t'attendent" : "t'attend"} aujourd'hui.
            </>
          )}
        </div>
        <div className="sw-prog">
          <div className="sw-bar">
            <i style={{ width: `${Math.round(ratio * 100)}%` }} />
          </div>
          <div className="sw-plbl">
            <span>
              <b>{doneToday}</b> traités
            </span>
            <span>{total} restants</span>
          </div>
        </div>
      </header>

      <div className="sw-fils">
        <button className={"sw-fil" + (filter === "all" ? " on" : "")} onClick={() => setFilter("all")}>
          Tout
        </button>
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            className={"sw-fil" + (filter === s.key ? " on" : "") + (buckets[s.key].length === 0 ? " zero" : "")}
            onClick={() => setFilter(filter === s.key ? "all" : s.key)}
          >
            {s.label}
            <span className="sw-cnt">{buckets[s.key].length}</span>
          </button>
        ))}
      </div>

      <div className="sw-list">
        {loading && <div className="sw-loading">…</div>}

        {!loading && total === 0 && (
          <div className="sw-empty">
            <div className="sw-emark">
              <svg viewBox="0 0 24 24" fill="none" stroke="#CDFB5E" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12.5l5 5L20 6.5" />
              </svg>
            </div>
            <h3>Journée bouclée.</h3>
            <p>Rien ne t'a filé entre les doigts. Ajoute des leads ou reviens demain.</p>
          </div>
        )}

        {!loading &&
          visibleSections.map((s) => (
            <React.Fragment key={s.key}>
              <div className="sw-sect">{s.head}</div>
              {buckets[s.key].map((p) => (
                <Post key={p.id} p={p} bucket={s.key} busy={busy === p.id} onAct={() => act(p, s.key)} />
              ))}
            </React.Fragment>
          ))}
      </div>

      <button className="sw-fab" onClick={() => setAddOpen(true)} aria-label="Noter un prospect">
        <svg viewBox="0 0 24 24" fill="none" stroke="#0B0F04" strokeWidth="2.6" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {cheer && (
        <div className="sw-toast">
          <svg viewBox="0 0 16 16" fill="none">
            <path d="M3 8.5l3.2 3L13 4.5" stroke="#0A0B0D" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{cheer}</span>
        </div>
      )}

      {addOpen && (
        <AddSheet
          onClose={() => setAddOpen(false)}
          onDone={(m) => {
            setAddOpen(false);
            flash(m);
            load();
          }}
        />
      )}
    </div>
  );
}

function Post({ p, bucket, busy, onAct }: { p: Prospect; bucket: Bucket; busy: boolean; onAct: () => void }) {
  const initial = (p.handle || "?").charAt(0).toUpperCase();
  const sub =
    p.source === "inbound"
      ? p.clipper_name
        ? `inbound · clip ${p.clipper_name}`
        : "inbound"
      : p.source === "froid"
      ? "froid"
      : "chaud";
  const body = p.interet || p.need || p.note;
  const hot = bucket === "nouveau";
  const cfg = {
    nouveau: { tag: "Nouveau", cta: "J'ai contacté", ghost: false },
    relancer: { tag: "Relance", cta: "J'ai relancé", ghost: false },
    confirmer: { tag: "Confirmer", cta: "RDV confirmé", ghost: true },
    silence: { tag: "Silence", cta: "J'ai relancé", ghost: true },
  }[bucket];

  return (
    <div className="sw-row">
      <div className="sw-rtop">
        <div className={"sw-ava" + (hot ? " hot" : "")}>{initial}</div>
        <div className="sw-rid">
          <div className="sw-rname">@{p.handle}</div>
          <div className="sw-rsub">{sub}</div>
        </div>
        <div className={"sw-rtag" + (hot ? " hot" : "")}>{cfg.tag}</div>
      </div>

      {body && bucket === "relancer" && <div className="sw-rbody">« {body} »</div>}

      {bucket === "nouveau" && <div className="sw-rwhen">⚡ Réponds vite — un lead frais convertit bien mieux.</div>}
      {bucket === "relancer" && <div className="sw-rwhen">à relancer aujourd'hui</div>}
      {bucket === "confirmer" && <div className="sw-rwhen">⏰ Confirme la veille — sinon 1 RDV sur 3 ne vient pas.</div>}
      {bucket === "silence" && <div className="sw-rwhen calm">une dernière relance avant de lâcher ?</div>}

      {bucket === "nouveau" && (
        <div className="sw-coach">
          <b>Ouvre avec une question, pas un pitch.</b> Ex : « Hey, c'est quoi ton objectif en ce moment ? »
        </div>
      )}
      {bucket === "relancer" && (
        <div className="sw-coach">
          Il est chaud. <b>Propose direct 2 créneaux</b> plutôt que « quand es-tu dispo ? »
        </div>
      )}
      {bucket === "confirmer" && (
        <div className="sw-coach">
          <b>Un petit mot suffit :</b> « On est bien on demain ? Hâte 🙌 »
        </div>
      )}

      <button className={"sw-act" + (cfg.ghost ? " ghost" : "")} disabled={busy} onClick={onAct}>
        {busy ? "…" : cfg.cta}
      </button>
    </div>
  );
}

function AddSheet({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const db = getSupabase();
  const [val, setVal] = useState("");
  const [bulk, setBulk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const clip = await navigator.clipboard.readText();
        if (clip && parseHandle(clip)) setVal(clip.trim());
      } catch {
        /* clipboard non accessible — saisie manuelle */
      }
    })();
  }, []);

  const preview = !bulk ? parseHandle(val) : null;

  async function save() {
    setBusy(true);
    try {
      if (bulk) {
        const handles = val
          .split(/[\n,]+/)
          .map((x) => parseHandle(x))
          .filter((x): x is { handle: string; platform: string | null } => !!x)
          .map((x) => x.handle);
        if (handles.length === 0) {
          setBusy(false);
          return;
        }
        await db.rpc("add_prospects_bulk", { p_handles: handles, p_source: "froid" });
        onDone(`${handles.length} prospects ajoutés`);
      } else {
        const h = parseHandle(val);
        if (!h) {
          setBusy(false);
          return;
        }
        await db.rpc("add_prospect", { p_handle: h.handle, p_clipper: null, p_need: null, p_source: "froid" });
        onDone(`@${h.handle} ajouté`);
      }
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="sw-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sw-sheet">
        <div className="sw-grab" />
        <h3>Noter un prospect</h3>
        <div className="sw-seg">
          <button className={!bulk ? "on" : ""} onClick={() => setBulk(false)}>
            Un
          </button>
          <button className={bulk ? "on" : ""} onClick={() => setBulk(true)}>
            En lot
          </button>
        </div>

        {!bulk ? (
          <>
            <label className="sw-lbl">Colle un lien Insta/TikTok, ou un @pseudo</label>
            <input
              className="sw-fld"
              autoFocus
              placeholder="instagram.com/le.pseudo — ou @le.pseudo"
              value={val}
              onChange={(e) => setVal(e.target.value)}
            />
            {preview && (
              <div className="sw-prev">
                → <b>@{preview.handle}</b>
                {preview.platform ? ` · ${preview.platform}` : ""}
              </div>
            )}
          </>
        ) : (
          <>
            <label className="sw-lbl">Colle plusieurs liens/pseudos (un par ligne)</label>
            <textarea
              className="sw-fld"
              rows={5}
              placeholder={"instagram.com/lea.fit\ntiktok.com/@marc.ugc\n@sami.k"}
              value={val}
              onChange={(e) => setVal(e.target.value)}
            />
          </>
        )}

        <button className="sw-act sw-save" disabled={busy || (!bulk && !preview)} onClick={save}>
          {busy ? "…" : bulk ? "Ajouter le lot" : "Ajouter"}
        </button>
      </div>
    </div>
  );
}

function SetWarStyle() {
  return (
    <style>{`
    .sw-root{
      --bg:#0A0B0D;--bg2:#0F1113;--card:#141619;--card2:#181B1F;
      --line:rgba(255,255,255,.06);--line2:rgba(255,255,255,.10);
      --txt:#F2F3F5;--mut:#9A9EA6;--mut2:#5E636B;
      --lime:#CDFB5E;--lime-dim:rgba(205,251,94,.12);--lime-ink:#0B0F04;
      font-family:"Manrope","Inter",system-ui,-apple-system,sans-serif;
      color:var(--txt);background:var(--bg);min-height:100dvh;position:relative;
      max-width:520px;margin:0 auto;padding:0 0 110px;-webkit-tap-highlight-color:transparent;-webkit-font-smoothing:antialiased;
    }
    .sw-root *{box-sizing:border-box}
    .sw-head{padding:34px 24px 20px}
    .sw-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:26px}
    .sw-mark{font-weight:800;font-size:17px;letter-spacing:-.01em}
    .sw-mark b{color:var(--lime)}
    .sw-date{font-size:12px;font-weight:600;color:var(--mut);background:var(--card);border:1px solid var(--line);padding:6px 11px;border-radius:20px;text-transform:capitalize}
    .sw-hello{font-size:30px;font-weight:800;letter-spacing:-.03em;line-height:1.05}
    .sw-sub{margin-top:9px;font-size:14px;color:var(--mut);font-weight:500}
    .sw-sub b{color:var(--lime);font-weight:700}
    .sw-prog{margin-top:20px}
    .sw-bar{height:5px;border-radius:20px;background:#1C1F23;overflow:hidden}
    .sw-bar i{display:block;height:100%;border-radius:20px;background:var(--lime);transition:width .6s cubic-bezier(.2,.8,.2,1);box-shadow:0 0 12px rgba(205,251,94,.4)}
    .sw-plbl{display:flex;justify-content:space-between;margin-top:9px;font-size:11.5px;color:var(--mut2);font-weight:600}
    .sw-plbl b{color:var(--txt)}
    .sw-fils{display:flex;gap:8px;padding:6px 24px 4px;overflow-x:auto}
    .sw-fils::-webkit-scrollbar{display:none}
    .sw-fil{flex:none;display:flex;align-items:center;gap:7px;background:var(--card);border:1px solid var(--line);padding:9px 14px;border-radius:12px;font-size:13px;font-weight:600;color:var(--mut);cursor:pointer;font-family:inherit;transition:all .15s}
    .sw-fil.on{background:var(--txt);color:var(--bg);border-color:var(--txt)}
    .sw-cnt{font-size:11px;font-weight:800;min-width:18px;height:18px;padding:0 5px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:var(--lime);color:var(--lime-ink)}
    .sw-fil.on .sw-cnt{background:var(--bg);color:var(--lime)}
    .sw-fil.zero{opacity:.4}
    .sw-fil.zero .sw-cnt{background:var(--line2);color:var(--mut)}
    .sw-list{padding:16px 16px 0}
    .sw-loading{padding:40px;text-align:center;color:var(--mut2)}
    .sw-sect{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--mut2);padding:14px 8px 10px}
    .sw-row{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px;margin-bottom:10px;transition:opacity .4s,transform .3s,border-color .2s}
    .sw-row:active{border-color:var(--line2)}
    .sw-rtop{display:flex;align-items:center;gap:13px}
    .sw-ava{width:42px;height:42px;border-radius:13px;flex:none;background:var(--card2);border:1px solid var(--line2);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;color:var(--mut)}
    .sw-ava.hot{background:var(--lime-dim);border-color:rgba(205,251,94,.25);color:var(--lime)}
    .sw-rid{flex:1;min-width:0}
    .sw-rname{font-weight:700;font-size:16px;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sw-rsub{font-size:12.5px;color:var(--mut2);margin-top:2px;font-weight:500}
    .sw-rtag{font-size:10.5px;font-weight:700;letter-spacing:.02em;color:var(--mut);border:1px solid var(--line2);padding:4px 9px;border-radius:8px;white-space:nowrap;text-transform:uppercase}
    .sw-rtag.hot{color:var(--lime);border-color:rgba(205,251,94,.3)}
    .sw-rbody{font-size:14px;color:var(--mut);line-height:1.5;margin:13px 1px 0}
    .sw-rwhen{font-size:12.5px;color:var(--lime);margin:11px 1px 0;font-weight:600}
    .sw-rwhen.calm{color:var(--mut2);font-weight:500}
    .sw-coach{margin:12px 0 0;padding:11px 13px;background:var(--bg2);border:1px solid var(--line);border-radius:12px;font-size:12.5px;color:var(--mut);line-height:1.5}
    .sw-coach b{color:var(--txt);font-weight:600}
    .sw-act{margin-top:14px;width:100%;border:none;border-radius:13px;padding:13px;font-family:inherit;font-weight:700;font-size:14.5px;cursor:pointer;background:var(--lime);color:var(--lime-ink);transition:transform .12s,opacity .2s;letter-spacing:-.01em}
    .sw-act.ghost{background:transparent;color:var(--txt);border:1px solid var(--line2)}
    .sw-act:active{transform:scale(.98)}
    .sw-act:disabled{opacity:.5}
    .sw-empty{text-align:center;padding:60px 30px}
    .sw-emark{width:56px;height:56px;border-radius:18px;margin:0 auto 18px;background:var(--lime-dim);border:1px solid rgba(205,251,94,.25);display:flex;align-items:center;justify-content:center}
    .sw-emark svg{width:26px;height:26px}
    .sw-empty h3{font-size:18px;font-weight:800;letter-spacing:-.02em}
    .sw-empty p{font-size:13.5px;color:var(--mut2);margin-top:7px;font-weight:500;line-height:1.5}
    .sw-fab{position:fixed;bottom:26px;left:50%;transform:translateX(-50%);z-index:30;width:56px;height:56px;border-radius:18px;border:none;background:var(--lime);cursor:pointer;box-shadow:0 8px 24px rgba(205,251,94,.28);display:flex;align-items:center;justify-content:center}
    .sw-fab svg{width:24px;height:24px}
    .sw-toast{position:fixed;bottom:96px;left:50%;transform:translateX(-50%);z-index:40;background:var(--txt);color:var(--bg);font-weight:700;font-size:13px;padding:11px 18px;border-radius:13px;box-shadow:0 10px 30px rgba(0,0,0,.5);display:flex;align-items:center;gap:8px;animation:sw-in .28s ease}
    .sw-toast svg{width:16px;height:16px}
    @keyframes sw-in{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}
    .sw-scrim{position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center}
    .sw-sheet{width:100%;max-width:520px;background:var(--card);border-radius:24px 24px 0 0;padding:10px 22px calc(28px + env(safe-area-inset-bottom));border-top:1px solid var(--line2)}
    .sw-grab{width:38px;height:4px;border-radius:3px;background:var(--mut2);margin:6px auto 16px;opacity:.5}
    .sw-sheet h3{margin:0 0 14px;font-size:18px;font-weight:800;letter-spacing:-.02em}
    .sw-seg{display:flex;gap:6px;background:var(--bg2);border-radius:12px;padding:4px;margin-bottom:16px}
    .sw-seg button{flex:1;border:none;background:transparent;color:var(--mut);font-family:inherit;font-weight:700;font-size:13px;padding:9px;border-radius:9px;cursor:pointer}
    .sw-seg button.on{background:var(--lime);color:var(--lime-ink)}
    .sw-lbl{font-size:12px;color:var(--mut);display:block;margin-bottom:8px}
    .sw-fld{width:100%;background:var(--bg2);border:1px solid var(--line2);border-radius:12px;padding:13px 14px;color:var(--txt);font-family:inherit;font-size:15px;outline:none}
    .sw-fld:focus{border-color:var(--lime)}
    .sw-prev{margin-top:10px;font-size:14px;color:var(--lime)}
    .sw-prev b{color:#fff}
    .sw-save{margin-top:16px}
    `}</style>
  );
}  const [overview, setOverview] = useState<Overview | null>(null);
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
    <div className="wrap">
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
    </div>
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
