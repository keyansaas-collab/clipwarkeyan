-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ClipWar — patch 18 : plafond de monétisation (100k vues)     ║
-- ║  Au-delà du plafond, les vues ne sont plus payées.           ║
-- ║  Les vues AFFICHÉES restent réelles ; seul le gain plafonne. ║
-- ╚══════════════════════════════════════════════════════════════╝

-- plafond paramétrable (réglages → view_cap), défaut 100000
insert into public.settings (key, value) values ('view_cap', '100000')
on conflict (key) do nothing;

create or replace function public.view_cap()
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(nullif((select value from public.settings where key = 'view_cap'), '')::bigint, 100000);
$$;
grant execute on function public.view_cap() to anon, authenticated;

-- ─────────── admin_clippers : gain plafonné (vues affichées = réelles) ───────────
create or replace function public.admin_clippers()
returns table (
  id uuid, name text, rank text, avatar_url text, country text, is_minor boolean,
  tiktok text, instagram text, youtube text,
  payout_method text, payout_detail text,
  clips bigint, vues_total bigint, vues_7 bigint, gain numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  return query
  select
    p.id, coalesce(p.display_name, 'Clipper'), coalesce(p.rank, 'Recrue'), p.avatar_url,
    p.country, coalesce(p.is_minor, false),
    p.tiktok, p.instagram, p.youtube, p.payout_method, p.payout_detail,
    count(c.id)::bigint,
    coalesce(sum(n.current_views), 0)::bigint,
    coalesce(sum(n.net_7d), 0)::bigint,
    coalesce(sum(
      case when c.status = 'track'
        then round(greatest(0, least(coalesce(n.current_views,0), public.view_cap()) - c.paid_views) / 1000.0 * coalesce(cam.rate_per_1000,1), 2)
        else 0 end), 0)
  from public.profiles p
  left join public.clips       c  on c.clipper_id = p.id
  left join public.clip_net_7d n  on n.clip_id    = c.id
  left join public.campaigns  cam on cam.id        = c.campaign_id
  where p.role = 'clipper'
  group by p.id
  order by gain desc;
end; $$;

-- ─────────── admin_clips : due/gain plafonnés ───────────
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
    greatest(0, least(coalesce(n.current_views, 0), public.view_cap()) - c.paid_views)::bigint as due,
    round(greatest(0, least(coalesce(n.current_views, 0), public.view_cap()) - c.paid_views) / 1000.0 * coalesce(cam.rate_per_1000, 1), 2) as gain
  from public.clips c
  left join public.profiles  p   on p.id  = c.clipper_id
  left join public.campaigns cam on cam.id = c.campaign_id
  left join public.assets    a   on a.id  = c.asset_id
  left join public.clip_net_7d n on n.clip_id = c.id
  order by c.submitted_at desc nulls last;
end; $$;

-- ─────────── admin_dashboard : « à verser » = cumul réel plafonné (cohérent avec les lignes) ───────────
create or replace function public.admin_dashboard()
returns table (vues_7 bigint, a_verser numeric, clippers_actifs bigint, pubs_7 bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  return query
  select
    coalesce((select sum(n.net_7d) from public.clip_net_7d n where n.status = 'track'), 0)::bigint,
    coalesce((
      select sum(round(greatest(0, least(coalesce(n.current_views,0), public.view_cap()) - c.paid_views) / 1000.0 * coalesce(cam.rate_per_1000, 1), 2))
      from public.clips c
      join public.clip_net_7d n on n.clip_id = c.id
      left join public.campaigns cam on cam.id = c.campaign_id
      where c.status = 'track'
    ), 0),
    (select count(distinct c.clipper_id) from public.clips c where c.submitted_at > now() - interval '7 days')::bigint,
    (select count(*) from public.clips c where c.submitted_at > now() - interval '7 days')::bigint;
end; $$;

-- ─────────── settle_payment : fige au plafond ───────────
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
  cap     bigint := public.view_cap();
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;

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
    where c.clipper_id = target_clipper and c.status = 'track'
  loop
    cur := least(coalesce(r.cur_views, 0), cap);          -- plafonné
    due := greatest(0, cur - r.paid_views);
    if due > 0 then
      line := round(due / 1000.0 * r.rate, 2);
      insert into public.payment_lines
        (payment_id, clip_id, clipper_id, views_before, views_at, views_paid, rate, amount)
        values (pid, r.id, target_clipper, r.paid_views, cur, due, r.rate, line);
      update public.clips set paid_views = cur where id = r.id;   -- fige au plafond
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

-- ─────────── my_earnings : gain plafonné (vues réelles affichées) ───────────
create or replace function public.my_earnings()
returns table (
  due_total numeric, due_views bigint, paid_total numeric,
  clip_id uuid, asset_title text, platform text, status text,
  vues bigint, paid_views bigint, due bigint, rate numeric, gain numeric
)
language plpgsql stable security definer set search_path = public as $$
declare cap bigint := public.view_cap();
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
      case when status='track' then greatest(0, least(cur, cap) - paid_views) else 0 end as due
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
