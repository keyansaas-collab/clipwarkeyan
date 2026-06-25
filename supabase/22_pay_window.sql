-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ClipWar — patch 22 : fenêtre de paiement (7 j) + challenge   ║
-- ║  Une vidéo rapporte X jours après son post, puis se fige.    ║
-- ║  Exemptée si postée pendant une période de challenge.       ║
-- ║  Durée réglable (réglages → pay_window_days, 0 = illimité). ║
-- ╚══════════════════════════════════════════════════════════════╝

insert into public.settings (key, value) values ('pay_window_days', '7')
on conflict (key) do nothing;

-- Vues payables d'un clip : plafonnées par la fenêtre de jours après le post.
-- Hors fenêtre → on fige aux vues relevées à la fin de la fenêtre.
-- Exempté (vues actuelles) si fenêtre = 0 OU clip posté pendant un challenge.
create or replace function public.payable_views(p_clip uuid)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare win int; sub timestamptz; cur bigint; exempt boolean;
begin
  select coalesce(nullif((select value from public.settings where key = 'pay_window_days'), '')::int, 7) into win;
  select submitted_at into sub from public.clips where id = p_clip;
  select coalesce((select s.views from public.view_snapshots s where s.clip_id = p_clip order by s.captured_at desc limit 1), 0) into cur;

  if win <= 0 or sub is null then return cur; end if;

  select exists (
    select 1 from public.challenges ch
    where sub >= coalesce(ch.starts_at, '-infinity'::timestamptz)
      and sub <= coalesce(ch.ends_at, 'infinity'::timestamptz)
  ) into exempt;
  if exempt then return cur; end if;

  if now() < sub + (win || ' days')::interval then
    return cur;
  end if;
  return coalesce(
    (select s.views from public.view_snapshots s
      where s.clip_id = p_clip and s.captured_at <= sub + (win || ' days')::interval
      order by s.captured_at desc limit 1),
    cur);
end; $$;
grant execute on function public.payable_views(uuid) to authenticated;

-- Vues payables ET plafonnées (fenêtre + plafond 100k).
create or replace function public.payable_capped(p_clip uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select least(public.payable_views(p_clip), public.view_cap());
$$;
grant execute on function public.payable_capped(uuid) to authenticated;

-- ═══════════ Réécriture des fonctions de paiement avec payable_capped ═══════════

create or replace function public.admin_clippers()
returns table (
  id uuid, name text, rank text, avatar_url text, country text, is_minor boolean,
  tiktok text, instagram text, youtube text, payout_method text, payout_detail text,
  clips bigint, vues_total bigint, vues_7 bigint, gain numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  return query
  select p.id, coalesce(p.display_name, 'Clipper'), coalesce(p.rank, 'Recrue'), p.avatar_url,
    p.country, coalesce(p.is_minor, false),
    p.tiktok, p.instagram, p.youtube, p.payout_method, p.payout_detail,
    count(c.id)::bigint, coalesce(sum(n.current_views), 0)::bigint, coalesce(sum(n.net_7d), 0)::bigint,
    coalesce(sum(
      case when c.status = 'track'
        then round(greatest(0, public.payable_capped(c.id) - c.paid_views) / 1000.0 * coalesce(cam.rate_per_1000,1), 2)
        else 0 end), 0)
  from public.profiles p
  left join public.clips c on c.clipper_id = p.id
  left join public.clip_net_7d n on n.clip_id = c.id
  left join public.campaigns cam on cam.id = c.campaign_id
  where p.role = 'clipper'
  group by p.id
  order by gain desc;
end; $$;

create or replace function public.admin_clips()
returns table (
  id uuid, clipper_id uuid, clipper_name text, campaign_id uuid, campaign_name text, rate numeric,
  asset_id uuid, asset_title text, platform text, url text, status text, submitted_at timestamptz,
  vues bigint, net_7d bigint, paid_views bigint, due bigint, gain numeric, hold_reason text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  return query
  select c.id, c.clipper_id, p.display_name, c.campaign_id, cam.name, coalesce(cam.rate_per_1000, 1),
    c.asset_id, a.title, c.platform, c.url, c.status, c.submitted_at,
    coalesce(n.current_views, 0)::bigint, coalesce(n.net_7d, 0)::bigint, c.paid_views::bigint,
    greatest(0, public.payable_capped(c.id) - c.paid_views)::bigint as due,
    round(greatest(0, public.payable_capped(c.id) - c.paid_views) / 1000.0 * coalesce(cam.rate_per_1000, 1), 2) as gain,
    case when c.status = 'hold' then
      (select f.detail from public.fraud_flags f where f.clip_id = c.id and f.kind = 'negative_progress' order by f.created_at desc limit 1)
    else null end as hold_reason
  from public.clips c
  left join public.profiles p on p.id = c.clipper_id
  left join public.campaigns cam on cam.id = c.campaign_id
  left join public.assets a on a.id = c.asset_id
  left join public.clip_net_7d n on n.clip_id = c.id
  order by c.submitted_at desc nulls last;
end; $$;

create or replace function public.admin_dashboard()
returns table (vues_7 bigint, a_verser numeric, clippers_actifs bigint, pubs_7 bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  return query
  select
    coalesce((select sum(n.net_7d) from public.clip_net_7d n where n.status = 'track'), 0)::bigint,
    coalesce((
      select sum(round(greatest(0, public.payable_capped(c.id) - c.paid_views) / 1000.0 * coalesce(cam.rate_per_1000, 1), 2))
      from public.clips c
      left join public.campaigns cam on cam.id = c.campaign_id
      where c.status = 'track'
    ), 0),
    (select count(distinct c.clipper_id) from public.clips c where c.submitted_at > now() - interval '7 days')::bigint,
    (select count(*) from public.clips c where c.submitted_at > now() - interval '7 days')::bigint;
end; $$;

create or replace function public.settle_payment(target_clipper uuid)
returns table (payment_id uuid, clips_paid int, net_views bigint, amount numeric)
language plpgsql security definer set search_path = public as $$
declare
  pid uuid; v_net bigint := 0; v_amt numeric := 0; v_cnt int := 0;
  v_start timestamptz; r record; cur bigint; due bigint; line numeric;
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  select max(period_end) into v_start from public.payments where clipper_id = target_clipper;
  if v_start is null then select min(submitted_at) into v_start from public.clips where clipper_id = target_clipper; end if;
  if v_start is null then v_start := now(); end if;
  pid := gen_random_uuid();
  for r in
    select c.id, c.paid_views, coalesce(cam.rate_per_1000, 1) as rate
    from public.clips c left join public.campaigns cam on cam.id = c.campaign_id
    where c.clipper_id = target_clipper and c.status = 'track'
  loop
    cur := public.payable_capped(r.id);
    due := greatest(0, cur - r.paid_views);
    if due > 0 then
      line := round(due / 1000.0 * r.rate, 2);
      insert into public.payment_lines (payment_id, clip_id, clipper_id, views_before, views_at, views_paid, rate, amount)
        values (pid, r.id, target_clipper, r.paid_views, cur, due, r.rate, line);
      update public.clips set paid_views = cur where id = r.id;
      v_net := v_net + due; v_amt := v_amt + line; v_cnt := v_cnt + 1;
    end if;
  end loop;
  if v_cnt = 0 then raise exception 'Rien à payer pour ce clipper.'; end if;
  insert into public.payments (id, clipper_id, period_start, period_end, net_views, amount, status)
    values (pid, target_clipper, v_start, now(), v_net, v_amt, 'paid');
  update public.payout_requests set status = 'paid', resolved_at = now()
    where clipper_id = target_clipper and status = 'pending';
  return query select pid, v_cnt, v_net, v_amt;
end; $$;

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
      coalesce((select s.views from public.view_snapshots s where s.clip_id = c.id order by s.captured_at desc limit 1), 0) as cur,
      case when c.status = 'track' then greatest(0, public.payable_capped(c.id) - c.paid_views) else 0 end as due
    from public.clips c
    left join public.assets a on a.id = c.asset_id
    left join public.campaigns cam on cam.id = c.campaign_id
    where c.clipper_id = auth.uid()
  )
  select
    coalesce(sum(round(due/1000.0*rate, 2)) over (), 0)::numeric,
    coalesce(sum(due) over (), 0)::bigint,
    coalesce((select sum(amount) from public.payments where clipper_id = auth.uid() and status = 'paid'), 0)::numeric,
    id, title, platform, status, cur::bigint, paid_views::bigint, due::bigint, rate,
    round(due/1000.0*rate, 2)
  from mine;
end; $$;

create or replace function public.request_payout()
returns table (ok boolean, amount numeric, views bigint)
language plpgsql security definer set search_path = public as $$
declare v_amt numeric; v_views bigint; nm text; existing bigint;
begin
  select
    coalesce(sum(greatest(0, public.payable_capped(c.id) - c.paid_views)), 0),
    coalesce(sum(round(greatest(0, public.payable_capped(c.id) - c.paid_views) / 1000.0 * coalesce(cam.rate_per_1000, 1), 2)), 0)
    into v_views, v_amt
  from public.clips c
  left join public.campaigns cam on cam.id = c.campaign_id
  where c.clipper_id = auth.uid() and c.status = 'track';

  if v_amt <= 0 then raise exception 'Rien à demander pour le moment.'; end if;

  select id into existing from public.payout_requests where clipper_id = auth.uid() and status = 'pending' limit 1;
  if existing is not null then
    update public.payout_requests set amount = v_amt, views = v_views, created_at = now() where id = existing;
  else
    insert into public.payout_requests (clipper_id, amount, views) values (auth.uid(), v_amt, v_views);
  end if;

  select coalesce(display_name, 'Un clipper') into nm from public.profiles where id = auth.uid();
  perform public.notify_staff('payout_request', 'Demande de paiement 💸',
    nm || ' demande ' || replace(to_char(v_amt, 'FM999990.00'), '.', ',') || ' € — à valider.', 'pay');

  return query select true, v_amt, v_views;
end; $$;
