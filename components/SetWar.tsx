"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

/* ─────────────────────────────────────────────────────────────
   SetWar · Aujourd'hui
   Le carnet de setting, façon app sociale (Apple Sommeil + Flo + Insta).
   Branché sur les RPC ClipWar existantes — AUCUNE migration requise.
   Récolte : chaque geste (contacté / relancé / confirmé) avance le
   prospect ET nourrit les chiffres, sans reporting séparé.
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
  // colonnes ajoutées par la migration optionnelle (peuvent être absentes)
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

/* Range un prospect dans exactement une mission du jour, ou null (pas aujourd'hui). */
function bucketOf(p: Prospect): Bucket | null {
  if (p.stage === "nouveau") return "nouveau";
  if (p.stage === "rdv_pris") {
    // à confirmer si le RDV est aujourd'hui/demain, sinon on laisse hors du jour
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

/* Extrait un pseudo depuis un lien Insta/TikTok, un @pseudo, ou un pseudo brut. */
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

const CHEERS = ["💛 Noté", "🔥 Une de moins", "✨ Nickel", "💫 Ça avance", "👏 Bien joué"];

export default function SetWar({ userName }: { userName?: string }) {
  const db = getSupabase();
  const [rows, setRows] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [cheer, setCheer] = useState<string | null>(null);
  const [doneToday, setDoneToday] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await db.rpc("setter_prospects");
    setRows(((data as Prospect[]) || []));
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

  /* Un geste = on avance le prospect via une RPC existante, puis on retire de la liste. */
  async function act(p: Prospect, kind: Bucket) {
    if (busy) return;
    setBusy(p.id);
    try {
      if (kind === "nouveau") {
        await db.rpc("update_prospect", { p_id: p.id, p_stage: "contacte" });
      } else if (kind === "relancer" || kind === "silence") {
        await db.rpc("bump_relance", { p_id: p.id });
      } else if (kind === "confirmer") {
        // best-effort : persiste confirmed_at si la migration a été passée, sinon geste local.
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

  return (
    <div className="sw-root">
      <SetWarStyle />

      <header className="sw-head">
        <Ring ratio={ratio} done={doneToday} total={dayTotal} />
        <div className="sw-hi">
          <h1>
            Salut <span>{first}</span>
          </h1>
          <p>
            {loading
              ? "on charge ta journée…"
              : total === 0
              ? "tout est traité — journée bouclée 🏆"
              : `${total} lead${total > 1 ? "s" : ""} t'attend${total > 1 ? "ent" : ""} aujourd'hui.`}
          </p>
        </div>
      </header>

      <div className="sw-stories">
        <Story emoji="✨" label="Nouveaux" n={buckets.nouveau.length} tone="warm" />
        <Story emoji="💬" label="À relancer" n={buckets.relancer.length} tone="warm" />
        <Story emoji="📅" label="Confirmer" n={buckets.confirmer.length} tone="cool" />
        <Story emoji="🌙" label="Silence" n={buckets.silence.length} tone="warm" />
      </div>

      <div className="sw-divide" />

      <div className="sw-feed">
        {loading && <div className="sw-empty">…</div>}

        {!loading && total === 0 && (
          <div className="sw-clap">
            <div className="sw-clap-e">🏆</div>
            <div className="sw-clap-t">Journée bouclée.</div>
            <div className="sw-clap-s">Rien ne t'a filé entre les doigts. Reviens demain.</div>
          </div>
        )}

        {buckets.nouveau.length > 0 && <FeedHead label="À contacter maintenant" />}
        {buckets.nouveau.map((p) => (
          <Post
            key={p.id}
            p={p}
            tone="warm"
            chip="Nouveau"
            urgent="⚡ Réponds vite — un lead frais convertit bien mieux."
            coach={
              <>
                <b>Ouvre avec une question, pas un pitch.</b> Ex : « Hey, c'est quoi ton objectif en ce moment ? »
              </>
            }
            cta="J'ai contacté"
            busy={busy === p.id}
            onAct={() => act(p, "nouveau")}
          />
        ))}

        {buckets.relancer.length > 0 && <FeedHead label="À relancer" />}
        {buckets.relancer.map((p) => (
          <Post
            key={p.id}
            p={p}
            tone="warm"
            chip="Relance"
            when="à relancer aujourd'hui"
            coach={
              <>
                Il est chaud. <b>Propose direct 2 créneaux</b> plutôt que « quand es-tu dispo ? »
              </>
            }
            cta="J'ai relancé"
            busy={busy === p.id}
            onAct={() => act(p, "relancer")}
          />
        ))}

        {buckets.confirmer.length > 0 && <FeedHead label="RDV à confirmer" />}
        {buckets.confirmer.map((p) => (
          <Post
            key={p.id}
            p={p}
            tone="cool"
            chip="Confirmer"
            urgent="⏰ Confirme la veille — sinon 1 RDV sur 3 ne vient pas."
            coach={
              <>
                <b>Un petit mot suffit :</b> « On est bien on demain ? Hâte 🙌 »
              </>
            }
            cta="RDV confirmé"
            busy={busy === p.id}
            onAct={() => act(p, "confirmer")}
          />
        ))}

        {buckets.silence.length > 0 && <FeedHead label="Silence radio" />}
        {buckets.silence.map((p) => (
          <Post
            key={p.id}
            p={p}
            tone="mut"
            chip="Silence"
            whenCalm="une dernière relance avant de lâcher ?"
            cta="J'ai relancé"
            busy={busy === p.id}
            onAct={() => act(p, "silence")}
          />
        ))}
      </div>

      <button className="sw-fab" onClick={() => setAddOpen(true)} aria-label="Noter un prospect">
        <span>+</span>
      </button>

      {cheer && <div className="sw-cheer">{cheer}</div>}

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

/* ── anneau de progression (Flo / Apple Sommeil) ── */
function Ring({ ratio, done, total }: { ratio: number; done: number; total: number }) {
  const C = 175.9; // 2πr, r=28
  return (
    <div className="sw-ring">
      <svg width="66" height="66">
        <circle cx="33" cy="33" r="28" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="6" />
        <circle
          cx="33"
          cy="33"
          r="28"
          fill="none"
          stroke="url(#swg)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - ratio)}
          transform="rotate(-90 33 33)"
          style={{ transition: "stroke-dashoffset .5s cubic-bezier(.2,.8,.2,1)" }}
        />
        <defs>
          <linearGradient id="swg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FF8BA7" />
            <stop offset="1" stopColor="#FFB27A" />
          </linearGradient>
        </defs>
      </svg>
      <div className="sw-ring-v">
        <b>{done}</b>
        <s>/ {total}</s>
      </div>
    </div>
  );
}

function Story({ emoji, label, n, tone }: { emoji: string; label: string; n: number; tone: "warm" | "cool" }) {
  return (
    <div className="sw-story">
      <div className={"sw-st-ring " + (n === 0 ? "done" : tone)}>
        <div className="sw-st-in">{n === 0 ? "✓" : emoji}</div>
        {n > 0 && <div className="sw-st-badge">{n}</div>}
      </div>
      <span>{label}</span>
    </div>
  );
}

function FeedHead({ label }: { label: string }) {
  return <div className="sw-feed-h">{label}</div>;
}

function Post({
  p,
  tone,
  chip,
  when,
  whenCalm,
  urgent,
  coach,
  cta,
  busy,
  onAct,
}: {
  p: Prospect;
  tone: "warm" | "cool" | "mut";
  chip: string;
  when?: string;
  whenCalm?: string;
  urgent?: string;
  coach?: React.ReactNode;
  cta: string;
  busy: boolean;
  onAct: () => void;
}) {
  const initial = (p.handle || "?").charAt(0).toUpperCase();
  const sub =
    p.source === "inbound"
      ? p.clipper_name
        ? `clip ${p.clipper_name}`
        : "inbound"
      : p.source === "froid"
      ? "froid"
      : "chaud";
  const body = p.interet || p.need || p.note;
  return (
    <div className="sw-post">
      <div className="sw-p-top">
        <div className={"sw-ava " + tone}>
          <div className="sw-ava-in">{initial}</div>
        </div>
        <div className="sw-p-id">
          <div className="sw-p-name">@{p.handle}</div>
          <div className="sw-p-sub">{sub}</div>
        </div>
        <div className={"sw-chip " + tone}>{chip}</div>
      </div>

      {body && <div className="sw-p-body">« {body} »</div>}
      {urgent && <div className="sw-p-when">{urgent}</div>}
      {when && <div className="sw-p-when">{when}</div>}
      {whenCalm && <div className="sw-p-when calm">{whenCalm}</div>}

      {coach && (
        <div className="sw-coach">
          💡 <span>{coach}</span>
        </div>
      )}

      <button className={"sw-act " + tone} disabled={busy} onClick={onAct}>
        {busy ? "…" : cta}
      </button>
    </div>
  );
}

/* ── capture 3 secondes : colle un lien (ou un lot), le pseudo rentre seul ── */
function AddSheet({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const db = getSupabase();
  const [val, setVal] = useState("");
  const [bulk, setBulk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // pré-remplissage : si un lien Insta/TikTok est déjà dans le presse-papier
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
        onDone(`${handles.length} prospects ajoutés ✨`);
      } else {
        const h = parseHandle(val);
        if (!h) {
          setBusy(false);
          return;
        }
        await db.rpc("add_prospect", { p_handle: h.handle, p_clipper: null, p_need: null, p_source: "froid" });
        onDone(`@${h.handle} ajouté ✨`);
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

        <button className="sw-act warm sw-save" disabled={busy || (!bulk && !preview)} onClick={save}>
          {busy ? "…" : bulk ? "Ajouter le lot" : "Ajouter"}
        </button>
      </div>
    </div>
  );
}

/* ── styles scopés SetWar (préfixe sw-), n'affecte pas ClipWar ── */
function SetWarStyle() {
  return (
    <style>{`
    .sw-root{
      --sw-bg0:#1A1530;--sw-bg1:#241A3E;--sw-card:rgba(255,255,255,.055);--sw-cardb:rgba(255,255,255,.09);
      --sw-text:#F4EEFF;--sw-mut:#B9AEDB;--sw-mut2:#82789F;--sw-rose:#FF8BA7;--sw-peach:#FFB27A;--sw-lilac:#B78BFF;--sw-aqua:#7FE6D0;
      --sw-gwarm:linear-gradient(135deg,#FF8BA7,#FFB27A);--sw-gcool:linear-gradient(135deg,#B78BFF,#7FA8FF);--sw-gmint:linear-gradient(135deg,#7FE6D0,#9BE8A8);
      font-family:"Manrope",system-ui,-apple-system,sans-serif;color:var(--sw-text);
      min-height:100dvh;position:relative;padding:0 0 108px;max-width:520px;margin:0 auto;
      background:
        radial-gradient(130% 80% at 15% -5%, #3A2A66 0%, transparent 55%),
        radial-gradient(120% 70% at 100% 8%, #5A2E5E 0%, transparent 50%),
        linear-gradient(180deg,var(--sw-bg1),var(--sw-bg0) 60%);
      background-attachment:fixed;-webkit-tap-highlight-color:transparent;
    }
    .sw-root *{box-sizing:border-box}
    .sw-head{padding:26px 22px 6px;display:flex;align-items:center;gap:16px}
    .sw-ring{position:relative;width:66px;height:66px;flex:none}
    .sw-ring-v{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .sw-ring-v b{font-size:16px;font-weight:800;line-height:1}
    .sw-ring-v s{font-size:8.5px;color:var(--sw-mut2);text-decoration:none;margin-top:1px}
    .sw-hi h1{margin:0;font-size:23px;font-weight:800;letter-spacing:-.02em}
    .sw-hi h1 span{background:var(--sw-gwarm);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
    .sw-hi p{margin:5px 0 0;font-size:13px;color:var(--sw-mut)}
    .sw-stories{display:flex;gap:15px;padding:20px 22px 8px;overflow-x:auto}
    .sw-stories::-webkit-scrollbar{display:none}
    .sw-story{flex:none;width:70px;text-align:center}
    .sw-st-ring{width:66px;height:66px;border-radius:50%;padding:2.5px;margin:0 auto 7px;position:relative}
    .sw-st-ring.warm{background:var(--sw-gwarm)}
    .sw-st-ring.cool{background:var(--sw-gcool)}
    .sw-st-ring.done{background:rgba(255,255,255,.14)}
    .sw-st-in{width:100%;height:100%;border-radius:50%;background:var(--sw-bg0);display:flex;align-items:center;justify-content:center;font-size:25px}
    .sw-st-badge{position:absolute;top:-3px;right:-3px;min-width:20px;height:20px;padding:0 5px;border-radius:11px;background:#fff;color:#1A1530;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.35)}
    .sw-story span{font-size:11px;color:var(--sw-mut);font-weight:500;display:block}
    .sw-divide{height:1px;background:linear-gradient(90deg,transparent,var(--sw-cardb),transparent);margin:14px 22px 4px}
    .sw-feed{padding:8px 16px 0}
    .sw-feed-h{padding:12px 6px 10px;font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--sw-mut2);text-transform:uppercase}
    .sw-empty{padding:30px;text-align:center;color:var(--sw-mut2)}
    .sw-post{background:var(--sw-card);border:1px solid var(--sw-cardb);border-radius:22px;padding:15px 16px 14px;margin-bottom:14px;position:relative;backdrop-filter:blur(8px)}
    .sw-p-top{display:flex;align-items:center;gap:12px}
    .sw-ava{width:46px;height:46px;border-radius:50%;flex:none;padding:2px;display:flex}
    .sw-ava.warm{background:var(--sw-gwarm)}.sw-ava.cool{background:var(--sw-gcool)}.sw-ava.mut{background:var(--sw-gmint)}
    .sw-ava-in{width:100%;height:100%;border-radius:50%;background:var(--sw-bg1);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px}
    .sw-p-id{flex:1;min-width:0}
    .sw-p-name{font-weight:700;font-size:16px;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sw-p-sub{font-size:12px;color:var(--sw-mut2);margin-top:2px}
    .sw-chip{font-size:10px;font-weight:700;letter-spacing:.03em;padding:5px 10px;border-radius:20px;white-space:nowrap;text-transform:uppercase}
    .sw-chip.warm{background:rgba(255,139,167,.16);color:var(--sw-rose)}
    .sw-chip.cool{background:rgba(183,139,255,.16);color:var(--sw-lilac)}
    .sw-chip.mut{background:rgba(255,255,255,.08);color:var(--sw-mut)}
    .sw-p-body{font-size:14px;color:var(--sw-text);opacity:.92;line-height:1.45;margin:12px 2px 0}
    .sw-p-when{font-size:12px;color:var(--sw-peach);margin:9px 2px 0;font-weight:600}
    .sw-p-when.calm{color:var(--sw-mut2);font-weight:500}
    .sw-coach{display:flex;gap:9px;align-items:flex-start;margin:12px 2px 0;padding:10px 12px;background:rgba(127,230,208,.09);border:1px solid rgba(127,230,208,.16);border-radius:14px;font-size:12.5px;color:var(--sw-aqua);line-height:1.4}
    .sw-coach b{color:#A9F0E1}
    .sw-act{margin-top:13px;width:100%;border:none;border-radius:16px;padding:14px;font-family:inherit;font-weight:800;font-size:15px;color:#22103A;cursor:pointer;background:var(--sw-gwarm);transition:transform .12s}
    .sw-act.cool{background:var(--sw-gcool)}
    .sw-act.mut{background:rgba(255,255,255,.12);color:var(--sw-text)}
    .sw-act:active{transform:scale(.97)}
    .sw-act:disabled{opacity:.6}
    .sw-clap{text-align:center;padding:40px 20px}
    .sw-clap-e{font-size:48px}
    .sw-clap-t{font-size:20px;font-weight:800;margin-top:10px}
    .sw-clap-s{font-size:13px;color:var(--sw-mut);margin-top:6px}
    .sw-fab{position:fixed;bottom:26px;left:50%;transform:translateX(-50%);z-index:30;width:60px;height:60px;border-radius:22px;border:none;background:var(--sw-gwarm);color:#22103A;font-size:30px;font-weight:700;cursor:pointer;box-shadow:0 10px 28px rgba(255,139,167,.4);display:flex;align-items:center;justify-content:center}
    .sw-fab span{margin-top:-3px}
    .sw-cheer{position:fixed;bottom:100px;left:50%;transform:translateX(-50%);z-index:40;background:rgba(255,255,255,.96);color:#1A1530;font-weight:700;font-size:13.5px;padding:11px 20px;border-radius:22px;box-shadow:0 10px 30px rgba(0,0,0,.4);animation:sw-in .3s ease}
    @keyframes sw-in{from{opacity:0;transform:translate(-50%,14px)}to{opacity:1;transform:translate(-50%,0)}}
    .sw-scrim{position:fixed;inset:0;z-index:50;background:rgba(10,6,20,.55);display:flex;align-items:flex-end;justify-content:center}
    .sw-sheet{width:100%;max-width:520px;background:var(--sw-bg1);border-radius:26px 26px 0 0;padding:10px 22px calc(28px + env(safe-area-inset-bottom));border-top:1px solid var(--sw-cardb)}
    .sw-grab{width:38px;height:4px;border-radius:3px;background:var(--sw-mut2);margin:6px auto 14px;opacity:.6}
    .sw-sheet h3{margin:0 0 14px;font-size:18px;font-weight:800}
    .sw-seg{display:flex;gap:6px;background:rgba(255,255,255,.06);border-radius:14px;padding:4px;margin-bottom:16px}
    .sw-seg button{flex:1;border:none;background:transparent;color:var(--sw-mut);font-family:inherit;font-weight:700;font-size:13px;padding:9px;border-radius:11px;cursor:pointer}
    .sw-seg button.on{background:var(--sw-gwarm);color:#22103A}
    .sw-lbl{font-size:12px;color:var(--sw-mut);display:block;margin-bottom:8px}
    .sw-fld{width:100%;background:rgba(255,255,255,.06);border:1px solid var(--sw-cardb);border-radius:14px;padding:13px 14px;color:var(--sw-text);font-family:inherit;font-size:15px;outline:none}
    .sw-fld:focus{border-color:var(--sw-rose)}
    .sw-prev{margin-top:10px;font-size:14px;color:var(--sw-aqua)}
    .sw-prev b{color:#fff}
    .sw-save{margin-top:16px}
    `}</style>
  );
}
