-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ClipWar — patch 08 : moteur de paiement réel                 ║
-- ║  À coller dans Supabase → SQL Editor → Run (après 07).       ║
-- ╚══════════════════════════════════════════════════════════════╝
--
-- Modèle : on paie le CUMULATIF non encore réglé d'un clip =
--   max(0, vues_actuelles − paid_views).
-- Au versement, on fige les vues du moment comme preuve et on monte
-- paid_views à ce niveau. La prochaine fois, on ne paie que le surplus.
-- Aucun double comptage, rien ne périme. Calcul 100 % serveur.

-- ─────────── 1. Repère « déjà payé » par clip ───────────
alter table public.clips add column if not exists paid_views bigint not null default 0;

-- ─────────── 2. Lignes de paiement (preuve figée) ───────────
create table if not exists public.payment_lines (
  id            bigint generated always as identity primary key,
  payment_id    uuid references public.payments on delete cascade,
  clip_id       uuid references public.clips on delete set null,
  clipper_id    uuid references public.profiles on delete cascade,
  views_before  bigint  not null,   -- paid_views avant ce versement
  views_at      bigint  not null,   -- snapshot figé au moment du paiement (PREUVE)
  views_paid    bigint  not null,   -- views_at − views_before
  rate          numeric not null,   -- € / 1000 vues appliqué
  amount        numeric not null,   -- montant de la ligne
  created_at    timestamptz default now()
);
create index if not exists idx_paylines_payment on public.payment_lines (payment_id);
create index if not exists idx_paylines_clip    on public.payment_lines (clip_id);

alter table public.payment_lines enable row level security;
drop policy if exists paylines_read on public.payment_lines;
create policy paylines_read on public.payment_lines for select
  using (clipper_id = auth.uid() or public.is_staff());
-- pas de policy d'insert : l'écriture passe uniquement par settle_payment (definer).

-- ─────────── 3. RÈGLEMENT ATOMIQUE (staff) ───────────
-- Paie tout le dû d'un clipper d'un coup, fige la preuve, marque payé.
create or replace function public.settle_payment(target_clipper uuid)
returns table (payment_id uuid, clips_paid int, net_views bigint, amount numeric)
language plpgsql security definer set search_path = public as $$
declare
  pid     uuid;
  v_net   bigint  := 0;
  v_amt   numeric := 0;
  v_cnt   int     := 0;
  v_start timestamptz;
  r       record;
  cur     bigint;
  due     bigint;
  line    numeric;
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;

  -- début de période = fin du dernier versement, sinon 1re soumission
  select max(period_end) into v_start from public.payments where clipper_id = target_clipper;
  if v_start is null then
    select min(submitted_at) into v_start from public.clips where clipper_id = target_clipper;
  end if;
  if v_start is null then v_start := now(); end if;

  pid := gen_random_uuid();

  for r in
    select c.id, c.paid_views, coalesce(cam.rate_per_1000, 1) as rate,
      (select s.views from public.view_snapshots s
       where s.clip_id = c.id order by s.captured_at desc limit 1) as cur_views
    from public.clips c
    left join public.campaigns cam on cam.id = c.campaign_id
    where c.clipper_id = target_clipper and c.status = 'track'   -- gelés/rejetés exclus
  loop
    cur := coalesce(r.cur_views, 0);
    due := greatest(0, cur - r.paid_views);
    if due > 0 then
      line := round(due / 1000.0 * r.rate, 2);
      insert into public.payment_lines
        (payment_id, clip_id, clipper_id, views_before, views_at, views_paid, rate, amount)
        values (pid, r.id, target_clipper, r.paid_views, cur, due, r.rate, line);
      update public.clips set paid_views = cur where id = r.id;   -- fige la preuve
      v_net := v_net + due;
      v_amt := v_amt + line;
      v_cnt := v_cnt + 1;
    end if;
  end loop;

  if v_cnt = 0 then raise exception 'Rien à payer pour ce clipper.'; end if;

  insert into public.payments (id, clipper_id, period_start, period_end, net_views, amount, status)
    values (pid, target_clipper, v_start, now(), v_net, v_amt, 'paid');

  return query select pid, v_cnt, v_net, v_amt;
end; $$;
grant execute on function public.settle_payment(uuid) to authenticated;

-- ─────────── 4. HISTORIQUE DES PAIEMENTS (staff) ───────────
create or replace function public.admin_payments()
returns table (
  id uuid, clipper_id uuid, clipper_name text,
  period_start timestamptz, period_end timestamptz,
  net_views bigint, amount numeric, status text, created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  return query
  select pay.id, pay.clipper_id, p.display_name, pay.period_start, pay.period_end,
         pay.net_views, pay.amount, pay.status, pay.created_at
  from public.payments pay
  left join public.profiles p on p.id = pay.clipper_id
  order by pay.created_at desc;
end; $$;
grant execute on function public.admin_payments() to authenticated;

-- ─────────── 5. GAINS DU CLIPPER (sa propre vue, modèle cumulatif) ───────────
create or replace function public.my_earnings()
returns table (
  due_total numeric, due_views bigint, paid_total numeric,
  clip_id uuid, asset_title text, platform text, status text,
  vues bigint, paid_views bigint, due bigint, rate numeric, gain numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
  with mine as (
    select c.id, a.title, c.platform, c.status, c.paid_views,
      coalesce(cam.rate_per_1000, 1) as rate,
      coalesce((select s.views from public.view_snapshots s where s.clip_id=c.id order by s.captured_at desc limit 1),0) as cur
    from public.clips c
    left join public.assets a on a.id = c.asset_id
    left join public.campaigns cam on cam.id = c.campaign_id
    where c.clipper_id = auth.uid()
  ),
  calc as (
    select id, title, platform, status, paid_views, rate, cur,
      case when status='track' then greatest(0, cur - paid_views) else 0 end as due
    from mine
  )
  select
    coalesce(sum(round(due/1000.0*rate,2)) over (),0)::numeric as due_total,
    coalesce(sum(due) over (),0)::bigint as due_views,
    coalesce((select sum(amount) from public.payments where clipper_id=auth.uid() and status='paid'),0)::numeric as paid_total,
    id, title, platform, status, cur::bigint, paid_views::bigint, due::bigint, rate,
    round(due/1000.0*rate,2) as gain
  from calc;
end; $$;
grant execute on function public.my_earnings() to authenticated;

-- ═══════════════ 6. MISE À JOUR DES AGRÉGATS ADMIN (modèle cumulatif) ═══════════════
-- On bascule « à verser » du modèle 7 j glissants vers le dû cumulatif réel.

-- admin_clips : ajoute paid_views + due ; gain = due × tarif (sur tous les clips, l'app décide du payable)
drop function if exists public.admin_clips();
create or replace function public.admin_clips()
returns table (
  id uuid, clipper_id uuid, clipper_name text,
  campaign_id uuid, campaign_name text, rate numeric,
  asset_id uuid, asset_title text,
  platform text, url text, status text, submitted_at timestamptz,
  vues bigint, net_7d bigint, paid_views bigint, due bigint, gain numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  return query
  select
    c.id, c.clipper_id, p.display_name,
    c.campaign_id, cam.name, coalesce(cam.rate_per_1000, 1),
    c.asset_id, a.title,
    c.platform, c.url, c.status, c.submitted_at,
    coalesce(n.current_views, 0)::bigint,
    coalesce(n.net_7d, 0)::bigint,
    c.paid_views::bigint,
    greatest(0, coalesce(n.current_views, 0) - c.paid_views)::bigint as due,
    round(greatest(0, coalesce(n.current_views, 0) - c.paid_views) / 1000.0 * coalesce(cam.rate_per_1000, 1), 2) as gain
  from public.clips c
  left join public.profiles  p   on p.id  = c.clipper_id
  left join public.campaigns cam on cam.id = c.campaign_id
  left join public.assets    a   on a.id  = c.asset_id
  left join public.clip_net_7d n on n.clip_id = c.id
  order by c.submitted_at desc nulls last;
end; $$;
grant execute on function public.admin_clips() to authenticated;

-- admin_clippers : gain = dû cumulatif des clips en suivi (track)
create or replace function public.admin_clippers()
returns table (
  id uuid, name text, rank text, country text, is_minor boolean,
  tiktok text, instagram text, youtube text,
  payout_method text, payout_detail text,
  clips bigint, vues_total bigint, vues_7 bigint, gain numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  return query
  select
    p.id, coalesce(p.display_name, 'Clipper'), coalesce(p.rank, 'Recrue'),
    p.country, coalesce(p.is_minor, false),
    p.tiktok, p.instagram, p.youtube, p.payout_method, p.payout_detail,
    count(c.id)::bigint,
    coalesce(sum(n.current_views), 0)::bigint,
    coalesce(sum(n.net_7d), 0)::bigint,
    coalesce(sum(
      case when c.status = 'track'
        then round(greatest(0, coalesce(n.current_views,0) - c.paid_views) / 1000.0 * coalesce(cam.rate_per_1000,1), 2)
        else 0 end), 0)
  from public.profiles p
  left join public.clips       c  on c.clipper_id = p.id
  left join public.clip_net_7d n  on n.clip_id    = c.id
  left join public.campaigns  cam on cam.id        = c.campaign_id
  where p.role = 'clipper'
  group by p.id
  order by gain desc;
end; $$;
grant execute on function public.admin_clippers() to authenticated;

-- admin_dashboard : « à verser » = dû cumulatif (track)
create or replace function public.admin_dashboard()
returns table (vues_7 bigint, a_verser numeric, clippers_actifs bigint, pubs_7 bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  return query
  select
    coalesce((select sum(n.net_7d) from public.clip_net_7d n where n.status = 'track'), 0)::bigint,
    coalesce((
      select sum(round(greatest(0, coalesce(n.current_views,0) - c.paid_views) / 1000.0 * coalesce(cam.rate_per_1000, 1), 2))
      from public.clips c
      join public.clip_net_7d n on n.clip_id = c.id
      left join public.campaigns cam on cam.id = c.campaign_id
      where c.status = 'track'
    ), 0),
    (select count(distinct c.clipper_id) from public.clips c where c.submitted_at > now() - interval '7 days')::bigint,
    (select count(*) from public.clips c where c.submitted_at > now() - interval '7 days')::bigint;
end; $$;
grant execute on function public.admin_dashboard() to authenticated;
