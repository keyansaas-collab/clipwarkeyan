-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ClipWar — patch 12 : photos de profil (avatars) + polish     ║
-- ║  À coller dans Supabase → SQL Editor → Run (après le tout-en-1)║
-- ╚══════════════════════════════════════════════════════════════╝

-- ─────────── 1. Colonne avatar sur les profils ───────────
alter table public.profiles add column if not exists avatar_url text;

-- ─────────── 2. Bucket de stockage public "avatars" ───────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Lecture publique (le bucket est public) ; écriture limitée à SON dossier.
drop policy if exists "avatars_read"   on storage.objects;
drop policy if exists "avatars_write"  on storage.objects;
drop policy if exists "avatars_update" on storage.objects;
drop policy if exists "avatars_delete" on storage.objects;

create policy "avatars_read" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "avatars_write" on storage.objects
  for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_update" on storage.objects
  for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_delete" on storage.objects
  for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ─────────── 3. avatar_url dans le classement (lisible par tous) ───────────
drop function if exists public.leaderboard();
create or replace function public.leaderboard()
returns table (id uuid, name text, rank text, avatar_url text, clips bigint, vues_7 bigint, vues_total bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select
    p.id, coalesce(p.display_name, 'Clipper'), coalesce(p.rank, 'Recrue'), p.avatar_url,
    count(c.id)::bigint,
    coalesce(sum(n.net_7d), 0)::bigint,
    coalesce(sum(n.current_views), 0)::bigint
  from public.profiles p
  left join public.clips       c on c.clipper_id = p.id
  left join public.clip_net_7d n on n.clip_id    = c.id
  where p.role = 'clipper'
  group by p.id
  order by vues_7 desc, vues_total desc;
end; $$;
grant execute on function public.leaderboard() to authenticated;

-- ─────────── 4. avatar_url dans la liste admin des clippers ───────────
drop function if exists public.admin_clippers();
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
