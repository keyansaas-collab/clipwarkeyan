-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ClipWar — patch 19 : raison du gel visible sur les clips     ║
-- ╚══════════════════════════════════════════════════════════════╝

drop function if exists public.admin_clips();
create or replace function public.admin_clips()
returns table (
  id uuid, clipper_id uuid, clipper_name text,
  campaign_id uuid, campaign_name text, rate numeric,
  asset_id uuid, asset_title text,
  platform text, url text, status text, submitted_at timestamptz,
  vues bigint, net_7d bigint, paid_views bigint, due bigint, gain numeric,
  hold_reason text
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
    round(greatest(0, least(coalesce(n.current_views, 0), public.view_cap()) - c.paid_views) / 1000.0 * coalesce(cam.rate_per_1000, 1), 2) as gain,
    case when c.status = 'hold' then
      (select f.detail from public.fraud_flags f
        where f.clip_id = c.id and f.kind = 'negative_progress'
        order by f.created_at desc limit 1)
    else null end as hold_reason
  from public.clips c
  left join public.profiles  p   on p.id  = c.clipper_id
  left join public.campaigns cam on cam.id = c.campaign_id
  left join public.assets    a   on a.id  = c.asset_id
  left join public.clip_net_7d n on n.clip_id = c.id
  order by c.submitted_at desc nulls last;
end; $$;
