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
  const [err, setErr] = useState<string | null>(null);

  const preview = !bulk ? parseHandle(val) : null;

  // Coller à la demande (bouton), pas automatiquement — évite le menu iOS bloquant.
  async function paste() {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) setVal(clip.trim());
    } catch {
      setErr("Colle manuellement dans le champ (le presse-papier n'est pas accessible ici).");
    }
  }

  async function save() {
    setErr(null);
    setBusy(true);
    try {
      if (bulk) {
        const handles = val
          .split(/[\n,]+/)
          .map((x) => parseHandle(x))
          .filter((x): x is { handle: string; platform: string | null } => !!x)
          .map((x) => x.handle);
        if (handles.length === 0) {
          setErr("Aucun pseudo valide détecté.");
          setBusy(false);
          return;
        }
        const { error } = await db.rpc("add_prospects_bulk", { p_handles: handles, p_source: "froid" });
        if (error) throw error;
        onDone(`${handles.length} prospects ajoutés`);
      } else {
        const h = parseHandle(val);
        if (!h) {
          setErr("Pseudo invalide. Colle un lien Insta/TikTok ou tape @pseudo.");
          setBusy(false);
          return;
        }
        const { error } = await db.rpc("add_prospect", {
          p_handle: h.handle,
          p_clipper: null,
          p_need: null,
          p_source: "froid",
        });
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
          <button className={!bulk ? "on" : ""} onClick={() => setBulk(false)}>
            Un
          </button>
          <button className={bulk ? "on" : ""} onClick={() => setBulk(true)}>
            En lot
          </button>
        </div>

        {!bulk ? (
          <>
            <label className="sw-lbl">Colle un lien Insta/TikTok, ou tape un @pseudo</label>
            <div className="sw-fldrow">
              <input
                className="sw-fld"
                autoFocus
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="@le.pseudo ou instagram.com/le.pseudo"
                value={val}
                onChange={(e) => setVal(e.target.value)}
              />
              <button type="button" className="sw-paste" onClick={paste}>
                Coller
              </button>
            </div>
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
              autoCapitalize="none"
              autoCorrect="off"
              placeholder={"instagram.com/lea.fit\ntiktok.com/@marc.ugc\n@sami.k"}
              value={val}
              onChange={(e) => setVal(e.target.value)}
            />
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
    .sw-fldrow{display:flex;gap:8px;align-items:stretch}
    .sw-fldrow .sw-fld{flex:1;min-width:0;width:auto}
    .sw-fld{width:100%;background:var(--bg2);border:1px solid var(--line2);border-radius:12px;padding:13px 14px;color:var(--txt);font-family:inherit;font-size:16px;outline:none}
    .sw-fld:focus{border-color:var(--lime)}
    .sw-paste{flex:none;background:var(--card2);border:1px solid var(--line2);border-radius:12px;color:var(--txt);font-family:inherit;font-weight:700;font-size:13px;padding:0 15px;cursor:pointer}
    .sw-paste:active{background:var(--line2)}
    .sw-prev{margin-top:10px;font-size:14px;color:var(--lime)}
    .sw-prev b{color:#fff}
    .sw-err{margin-top:12px;font-size:12.5px;color:#FF8B6B;background:rgba(255,139,107,.1);border:1px solid rgba(255,139,107,.25);border-radius:10px;padding:10px 12px;line-height:1.4}
    .sw-save{margin-top:16px}
    `}</style>
  );
}function parseHandle(raw: string): { handle: string; platform: string | null } | null {
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
}
