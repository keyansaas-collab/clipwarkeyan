-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ClipWar — patch 10 : challenges & classement réels           ║
-- ║  À coller dans Supabase → SQL Editor → Run (après 09).       ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ─────────── 1. Type de challenge ───────────
alter table public.challenges add column if not exists kind text default 'collectif';
-- 'collectif' = objectif de vues commun · 'sprint' = course individuelle

-- ─────────── 2. CHALLENGES + progression (lisible par tous) ───────────
-- Progression = vues NETTES gagnées dans la fenêtre [starts_at, ends_at]
-- par les clips de la campagne (ou tous les clips si campagne nulle).
-- Pour chaque clip : (vues à la fin de la fenêtre) − (vues au début).
create or replace function public.challenges_list()
returns table (
  id uuid, title text, campaign_id uuid, campaign_name text, kind text,
  goal_views bigint, pot numeric, starts_at timestamptz, ends_at timestamptz,
  active boolean, progress bigint, participants bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select
    ch.id, ch.title, ch.campaign_id, cam.name, coalesce(ch.kind, 'collectif'),
    ch.goal_views, ch.pot, ch.starts_at, ch.ends_at,
    (ch.ends_at is null or ch.ends_at > now()) as active,
    coalesce((
      select sum(greatest(0, coalesce(fin.views, 0) - coalesce(deb.views, 0)))
      from public.clips c
      left join lateral (
        select s.views from public.view_snapshots s
        where s.clip_id = c.id and s.captured_at <= coalesce(ch.ends_at, now())
        order by s.captured_at desc limit 1
      ) fin on true
      left join lateral (
        select s.views from public.view_snapshots s
        where s.clip_id = c.id and s.captured_at <= coalesce(ch.starts_at, '-infinity'::timestamptz)
        order by s.captured_at desc limit 1
      ) deb on true
      where (ch.campaign_id is null or c.campaign_id = ch.campaign_id)
        and c.status <> 'rejected'
    ), 0)::bigint as progress,
    coalesce((
      select count(distinct c.clipper_id) from public.clips c
      where (ch.campaign_id is null or c.campaign_id = ch.campaign_id) and c.status <> 'rejected'
    ), 0)::bigint as participants
  from public.challenges ch
  left join public.campaigns cam on cam.id = ch.campaign_id
  order by (ch.ends_at is null or ch.ends_at > now()) desc, ch.created_at desc;
end; $$;
grant execute on function public.challenges_list() to authenticated;

-- ─────────── 3. CLASSEMENT (lisible par tous les clippers) ───────────
-- Permet à chaque clipper de voir le classement de la communauté.
-- Expose pseudo + compteurs de vues (c'est le principe d'un leaderboard).
create or replace function public.leaderboard()
returns table (id uuid, name text, rank text, clips bigint, vues_7 bigint, vues_total bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select
    p.id, coalesce(p.display_name, 'Clipper'), coalesce(p.rank, 'Recrue'),
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
