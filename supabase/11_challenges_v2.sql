-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ClipWar — patch 11 : challenges modulables (v2)              ║
-- ║  À coller dans Supabase → SQL Editor → Run (après 10).       ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ─────────── 1. Nouvelles dimensions ───────────
alter table public.challenges add column if not exists metric      text default 'views'; -- views | clips | manual
alter table public.challenges add column if not exists reward_type text default 'cash';  -- cash | cadeau | bonus | autre
alter table public.challenges add column if not exists reward_label text;                  -- ex. "AirPods", "100€ PayPal"
alter table public.challenges add column if not exists winner_id   uuid references public.profiles on delete set null;
alter table public.challenges add column if not exists awarded_at  timestamptz;
-- kind (déjà là) : collectif | sprint (course/classement) | palier (chacun qui atteint)
update public.challenges set kind = coalesce(kind, 'collectif');

-- ─────────── 2. Liste des challenges + progression selon la métrique ───────────
drop function if exists public.challenges_list();
create or replace function public.challenges_list()
returns table (
  id uuid, title text, campaign_id uuid, campaign_name text,
  kind text, metric text, reward_type text, reward_label text,
  goal_views bigint, pot numeric,
  starts_at timestamptz, ends_at timestamptz,
  active boolean, progress bigint, participants bigint,
  winner_id uuid, winner_name text, awarded_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select
    ch.id, ch.title, ch.campaign_id, cam.name,
    coalesce(ch.kind, 'collectif'), coalesce(ch.metric, 'views'),
    coalesce(ch.reward_type, 'cash'), ch.reward_label,
    ch.goal_views, ch.pot, ch.starts_at, ch.ends_at,
    (ch.awarded_at is null and (ch.ends_at is null or ch.ends_at > now())) as active,
    case coalesce(ch.metric, 'views')
      when 'clips' then coalesce((
        select count(*) from public.clips c
        where (ch.campaign_id is null or c.campaign_id = ch.campaign_id)
          and c.status <> 'rejected'
          and c.submitted_at >= coalesce(ch.starts_at, '-infinity'::timestamptz)
          and c.submitted_at <= coalesce(ch.ends_at, now())
      ), 0)
      when 'manual' then 0
      else coalesce((
        select sum(greatest(0, coalesce(fin.views, 0) - coalesce(deb.views, 0)))
        from public.clips c
        left join lateral (select s.views from public.view_snapshots s
          where s.clip_id = c.id and s.captured_at <= coalesce(ch.ends_at, now())
          order by s.captured_at desc limit 1) fin on true
        left join lateral (select s.views from public.view_snapshots s
          where s.clip_id = c.id and s.captured_at <= coalesce(ch.starts_at, '-infinity'::timestamptz)
          order by s.captured_at desc limit 1) deb on true
        where (ch.campaign_id is null or c.campaign_id = ch.campaign_id) and c.status <> 'rejected'
      ), 0)
    end::bigint as progress,
    coalesce((
      select count(distinct c.clipper_id) from public.clips c
      where (ch.campaign_id is null or c.campaign_id = ch.campaign_id) and c.status <> 'rejected'
        and c.submitted_at <= coalesce(ch.ends_at, now())
    ), 0)::bigint as participants,
    ch.winner_id, w.display_name, ch.awarded_at
  from public.challenges ch
  left join public.campaigns cam on cam.id = ch.campaign_id
  left join public.profiles  w   on w.id  = ch.winner_id
  order by (ch.awarded_at is null and (ch.ends_at is null or ch.ends_at > now())) desc, ch.created_at desc;
end; $$;
grant execute on function public.challenges_list() to authenticated;

-- ─────────── 3. Classement d'un challenge (qui mène) ───────────
create or replace function public.challenge_leaderboard(cid uuid)
returns table (clipper_id uuid, name text, score bigint)
language plpgsql stable security definer set search_path = public as $$
declare ch public.challenges%rowtype;
begin
  select * into ch from public.challenges where id = cid;
  if not found then return; end if;

  if coalesce(ch.metric, 'views') = 'clips' then
    return query
    select c.clipper_id, p.display_name, count(*)::bigint
    from public.clips c join public.profiles p on p.id = c.clipper_id
    where (ch.campaign_id is null or c.campaign_id = ch.campaign_id) and c.status <> 'rejected'
      and c.submitted_at >= coalesce(ch.starts_at, '-infinity'::timestamptz)
      and c.submitted_at <= coalesce(ch.ends_at, now())
    group by c.clipper_id, p.display_name
    order by 3 desc;
  else
    return query
    select c.clipper_id, p.display_name,
      coalesce(sum(greatest(0, coalesce(fin.views, 0) - coalesce(deb.views, 0))), 0)::bigint
    from public.clips c join public.profiles p on p.id = c.clipper_id
    left join lateral (select s.views from public.view_snapshots s
      where s.clip_id = c.id and s.captured_at <= coalesce(ch.ends_at, now())
      order by s.captured_at desc limit 1) fin on true
    left join lateral (select s.views from public.view_snapshots s
      where s.clip_id = c.id and s.captured_at <= coalesce(ch.starts_at, '-infinity'::timestamptz)
      order by s.captured_at desc limit 1) deb on true
    where (ch.campaign_id is null or c.campaign_id = ch.campaign_id) and c.status <> 'rejected'
    group by c.clipper_id, p.display_name
    order by 3 desc;
  end if;
end; $$;
grant execute on function public.challenge_leaderboard(uuid) to authenticated;

-- ─────────── 4. Clôturer & désigner le gagnant (staff) ───────────
-- winner peut être null pour un objectif collectif (on clôture sans gagnant unique).
create or replace function public.award_challenge(cid uuid, winner uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  update public.challenges set winner_id = winner, awarded_at = now() where id = cid;
end; $$;
grant execute on function public.award_challenge(uuid, uuid) to authenticated;
