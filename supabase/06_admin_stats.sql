-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ClipWar — patch 06 : agrégats ADMIN (cockpit réel)          ║
-- ║  À coller dans Supabase → SQL Editor → Run (après 05).       ║
-- ╚══════════════════════════════════════════════════════════════╝
--
-- Toutes ces fonctions sont SECURITY DEFINER (elles lisent à travers
-- la RLS) MAIS verrouillées par un garde is_staff() : seul Keyan
-- (owner/admin) peut les appeler. Elles calculent les KPIs à partir
-- des vraies données : clips, view_snapshots, fenêtre clip_net_7d,
-- campagnes (tarif) et profils. Le « gain » est l'estimation de la
-- fenêtre courante (statut track, progression positive) — le moteur
-- de paiement définitif arrive en tranche 3.

-- ─────────── 1. CLIPS DÉTAILLÉS ───────────
create or replace function public.admin_clips()
returns table (
  id uuid, clipper_id uuid, clipper_name text,
  campaign_id uuid, campaign_name text, rate numeric,
  asset_id uuid, asset_title text,
  platform text, url text, status text, submitted_at timestamptz,
  vues bigint, net_7d bigint, gain numeric
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
    round((case when c.status = 'track' then greatest(0, coalesce(n.net_7d, 0)) else 0 end)
          / 1000.0 * coalesce(cam.rate_per_1000, 1), 2)
  from public.clips c
  left join public.profiles  p   on p.id  = c.clipper_id
  left join public.campaigns cam on cam.id = c.campaign_id
  left join public.assets    a   on a.id  = c.asset_id
  left join public.clip_net_7d n on n.clip_id = c.id
  order by c.submitted_at desc nulls last;
end; $$;
grant execute on function public.admin_clips() to authenticated;

-- ─────────── 2. CLIPPERS AGRÉGÉS ───────────
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
    coalesce(sum(round((case when c.status = 'track' then greatest(0, coalesce(n.net_7d, 0)) else 0 end)
               / 1000.0 * coalesce(cam.rate_per_1000, 1), 2)), 0)
  from public.profiles p
  left join public.clips      c   on c.clipper_id = p.id
  left join public.clip_net_7d n  on n.clip_id    = c.id
  left join public.campaigns  cam on cam.id        = c.campaign_id
  where p.role = 'clipper'
  group by p.id
  order by vues_7 desc;
end; $$;
grant execute on function public.admin_clippers() to authenticated;

-- ─────────── 3. KPIs DASHBOARD ───────────
create or replace function public.admin_dashboard()
returns table (vues_7 bigint, a_verser numeric, clippers_actifs bigint, pubs_7 bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  return query
  select
    coalesce((select sum(n.net_7d) from public.clip_net_7d n where n.status = 'track'), 0)::bigint,
    coalesce((
      select sum(round(greatest(0, n.net_7d) / 1000.0 * coalesce(cam.rate_per_1000, 1), 2))
      from public.clips c
      join public.clip_net_7d n on n.clip_id = c.id
      left join public.campaigns cam on cam.id = c.campaign_id
      where c.status = 'track'
    ), 0),
    (select count(distinct c.clipper_id) from public.clips c where c.submitted_at > now() - interval '7 days')::bigint,
    (select count(*) from public.clips c where c.submitted_at > now() - interval '7 days')::bigint;
end; $$;
grant execute on function public.admin_dashboard() to authenticated;

-- ─────────── 4. VUES NETTES PAR JOUR (7 derniers jours) ───────────
-- Pour chaque clip, on prend sa dernière valeur de vues à la fin de
-- chaque jour, puis on somme les hausses jour à jour sur l'ensemble.
create or replace function public.admin_views_7d()
returns table (day date, net bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  return query
  with days as (
    -- 8 points : le plus ancien sert de base au calcul de delta
    select generate_series((current_date - 7), current_date, interval '1 day')::date as d
  ),
  eod as (
    select c.id as clip_id, days.d,
      (select s.views from public.view_snapshots s
       where s.clip_id = c.id and s.captured_at < days.d + 1
       order by s.captured_at desc limit 1) as views
    from public.clips c cross join days
  ),
  delta as (
    select d,
      greatest(0, coalesce(views, 0)
               - coalesce(lag(views) over (partition by clip_id order by d), 0)) as net
    from eod
  )
  select d as day, coalesce(sum(net), 0)::bigint as net
  from delta
  where d >= current_date - 6
  group by d
  order by d;
end; $$;
grant execute on function public.admin_views_7d() to authenticated;

-- ─────────── 5. TOP ASSETS (pépites : vues / téléchargement) ───────────
create or replace function public.admin_assets()
returns table (id uuid, title text, campaign_id uuid, vues bigint, downloads bigint, clips bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  return query
  select
    a.id, a.title, a.campaign_id,
    coalesce((select sum(n.current_views) from public.clips c
              join public.clip_net_7d n on n.clip_id = c.id
              where c.asset_id = a.id), 0)::bigint,
    (select count(*) from public.asset_downloads d where d.asset_id = a.id)::bigint,
    (select count(*) from public.clips c where c.asset_id = a.id)::bigint
  from public.assets a;
end; $$;
grant execute on function public.admin_assets() to authenticated;

-- ─────────── 6. ALERTES ANTI-TRICHE ───────────
create or replace function public.admin_fraud()
returns table (
  id bigint, clip_id uuid, kind text, detail text, resolved boolean,
  created_at timestamptz, clipper_name text, platform text, asset_title text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  return query
  select
    f.id, f.clip_id, f.kind, f.detail, f.resolved, f.created_at,
    p.display_name, c.platform, a.title
  from public.fraud_flags f
  left join public.clips    c on c.id = f.clip_id
  left join public.profiles p on p.id = c.clipper_id
  left join public.assets   a on a.id = c.asset_id
  order by f.created_at desc;
end; $$;
grant execute on function public.admin_fraud() to authenticated;
