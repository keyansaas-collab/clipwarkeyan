-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ClipWar — patch 20 : demande de paiement + validation        ║
-- ║  Le clipper demande, le staff est notifié, valide, paie.     ║
-- ╚══════════════════════════════════════════════════════════════╝

-- pour limiter la fréquence de rafraîchissement par clipper
alter table public.profiles add column if not exists last_views_refresh timestamptz;

-- ─────────── Table des demandes ───────────
create table if not exists public.payout_requests (
  id          bigint generated always as identity primary key,
  clipper_id  uuid not null references public.profiles on delete cascade,
  amount      numeric not null default 0,
  views       bigint  not null default 0,
  status      text    not null default 'pending' check (status in ('pending','paid','cancelled')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_payout_req_pending on public.payout_requests (status, created_at) where status = 'pending';

alter table public.payout_requests enable row level security;
drop policy if exists payout_req_read_own on public.payout_requests;
drop policy if exists payout_req_staff on public.payout_requests;
create policy payout_req_read_own on public.payout_requests for select using (clipper_id = auth.uid());
create policy payout_req_staff    on public.payout_requests for select using (public.is_staff());

-- ─────────── Le clipper demande son paiement ───────────
create or replace function public.request_payout()
returns table (ok boolean, amount numeric, views bigint)
language plpgsql security definer set search_path = public as $$
declare
  cap bigint := public.view_cap();
  v_amt numeric; v_views bigint; nm text; existing bigint;
begin
  select
    coalesce(sum(greatest(0, least(coalesce(cur.v, 0), cap) - c.paid_views)), 0),
    coalesce(sum(round(greatest(0, least(coalesce(cur.v, 0), cap) - c.paid_views) / 1000.0 * coalesce(cam.rate_per_1000, 1), 2)), 0)
    into v_views, v_amt
  from public.clips c
  left join public.campaigns cam on cam.id = c.campaign_id
  left join lateral (
    select s.views v from public.view_snapshots s where s.clip_id = c.id order by s.captured_at desc limit 1
  ) cur on true
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
grant execute on function public.request_payout() to authenticated;

-- ─────────── Vue staff : demandes en attente ───────────
create or replace function public.admin_payout_requests()
returns table (id bigint, clipper_id uuid, clipper text, amount numeric, views bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  return query
  select r.id, r.clipper_id, coalesce(p.display_name, 'Clipper'), r.amount, r.views, r.created_at
  from public.payout_requests r
  join public.profiles p on p.id = r.clipper_id
  where r.status = 'pending'
  order by r.created_at asc;
end; $$;
grant execute on function public.admin_payout_requests() to authenticated;

-- ─────────── settle_payment : marque la demande comme payée ───────────
create or replace function public.settle_payment(target_clipper uuid)
returns table (payment_id uuid, clips_paid int, net_views bigint, amount numeric)
language plpgsql security definer set search_path = public as $$
declare
  pid uuid; v_net bigint := 0; v_amt numeric := 0; v_cnt int := 0;
  v_start timestamptz; r record; cur bigint; due bigint; line numeric;
  cap bigint := public.view_cap();
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;

  select max(period_end) into v_start from public.payments where clipper_id = target_clipper;
  if v_start is null then select min(submitted_at) into v_start from public.clips where clipper_id = target_clipper; end if;
  if v_start is null then v_start := now(); end if;

  pid := gen_random_uuid();

  for r in
    select c.id, c.paid_views, coalesce(cam.rate_per_1000, 1) as rate,
      (select s.views from public.view_snapshots s where s.clip_id = c.id order by s.captured_at desc limit 1) as cur_views
    from public.clips c
    left join public.campaigns cam on cam.id = c.campaign_id
    where c.clipper_id = target_clipper and c.status = 'track'
  loop
    cur := least(coalesce(r.cur_views, 0), cap);
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

  -- clôt la demande de paiement en attente, le cas échéant
  update public.payout_requests set status = 'paid', resolved_at = now()
    where clipper_id = target_clipper and status = 'pending';

  return query select pid, v_cnt, v_net, v_amt;
end; $$;
