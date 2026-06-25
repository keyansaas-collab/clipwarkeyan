-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ClipWar — patch 17 : réglages admin + suivi emails          ║
-- ║  Run dans Supabase → SQL Editor (après le tout-en-un).        ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ─────────── 1. Réglages (clé / valeur) ───────────
create table if not exists public.settings (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);
alter table public.settings enable row level security;
drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select using (true);

-- écriture réservée au staff
create or replace function public.set_setting(p_key text, p_value text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  insert into public.settings (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end; $$;
grant execute on function public.set_setting(text, text) to authenticated;

-- valeurs par défaut (ne réécrase pas si déjà présentes)
insert into public.settings (key, value) values
  ('drive_url',     'https://drive.google.com/drive/folders/1RDec5PIx54dpEVC0am-o1q7XpervAiAZ'),
  ('ref_bonus',     '5'),
  ('ref_milestone', '10000'),
  ('email_enabled', '1')
on conflict (key) do nothing;

-- ─────────── 2. Suivi de l'envoi des emails ───────────
alter table public.notifications add column if not exists emailed boolean not null default false;
create index if not exists idx_notif_unemailed on public.notifications (emailed, created_at) where emailed = false;

-- ─────────── 3. Parrainage : palier lu depuis les réglages ───────────
drop function if exists public.my_referrals();
create or replace function public.my_referrals()
returns table (id uuid, name text, avatar_url text, vues_total bigint, reached boolean, joined_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare ms bigint;
begin
  select coalesce(nullif(value, '')::bigint, 10000) into ms from public.settings where key = 'ref_milestone';
  ms := coalesce(ms, 10000);
  return query
  select p.id, coalesce(p.display_name, 'Clipper'), p.avatar_url,
    coalesce(sum(n.current_views), 0)::bigint,
    coalesce(sum(n.current_views), 0) >= ms,
    p.created_at
  from public.profiles p
  left join public.clips c on c.clipper_id = p.id
  left join public.clip_net_7d n on n.clip_id = c.id
  where p.referred_by = auth.uid()
  group by p.id
  order by p.created_at desc;
end; $$;
grant execute on function public.my_referrals() to authenticated;

drop function if exists public.admin_referrals();
create or replace function public.admin_referrals()
returns table (parrain_id uuid, parrain text, filleuls bigint, valides bigint)
language plpgsql stable security definer set search_path = public as $$
declare ms bigint;
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  select coalesce(nullif(value, '')::bigint, 10000) into ms from public.settings where key = 'ref_milestone';
  ms := coalesce(ms, 10000);
  return query
  select pr.id, coalesce(pr.display_name, 'Clipper'),
    count(f.id)::bigint,
    count(*) filter (where sub.vues >= ms)::bigint
  from public.profiles pr
  join public.profiles f on f.referred_by = pr.id
  left join lateral (
    select coalesce(sum(n.current_views), 0) as vues
    from public.clips c left join public.clip_net_7d n on n.clip_id = c.id
    where c.clipper_id = f.id
  ) sub on true
  group by pr.id
  having count(f.id) > 0
  order by valides desc, filleuls desc;
end; $$;
grant execute on function public.admin_referrals() to authenticated;
