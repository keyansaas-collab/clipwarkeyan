-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ClipWar — patch 05 : stats catalogue (compteurs réels)       ║
-- ║  À coller dans Supabase → SQL Editor → Run (après schema.sql).║
-- ╚══════════════════════════════════════════════════════════════╝
--
-- Pourquoi : la RLS limite asset_downloads à « ses propres lignes ».
-- Un clipper ne pourrait donc voir QUE ses téléchargements, pas le
-- total communautaire. Cette fonction SECURITY DEFINER renvoie des
-- compteurs GLOBAUX par asset (téléchargements + clips), lisibles par
-- tout utilisateur connecté, sans exposer les lignes individuelles.

create or replace function public.asset_stats()
returns table (asset_id uuid, downloads bigint, clips bigint)
language sql stable security definer set search_path = public as $$
  select
    a.id as asset_id,
    (select count(*) from public.asset_downloads d where d.asset_id = a.id) as downloads,
    (select count(*) from public.clips c        where c.asset_id = a.id) as clips
  from public.assets a;
$$;

grant execute on function public.asset_stats() to authenticated;

-- (Optionnel) compteurs agrégés par campagne, même logique.
create or replace function public.campaign_stats()
returns table (campaign_id uuid, assets bigint, clips bigint)
language sql stable security definer set search_path = public as $$
  select
    c.id as campaign_id,
    (select count(*) from public.assets a where a.campaign_id = c.id) as assets,
    (select count(*) from public.clips  k where k.campaign_id = c.id) as clips
  from public.campaigns c;
$$;

grant execute on function public.campaign_stats() to authenticated;
