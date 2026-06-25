-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ClipWar — patch 16 : pages publiques (vitrine & campagnes)   ║
-- ║  Fonctions lisibles SANS connexion (rôle anon).              ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Stats globales (vitrine). Pas de données sensibles (pas de € versés).
create or replace function public.public_stats()
returns table (clippers bigint, clips bigint, vues bigint, campagnes bigint)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.profiles where role = 'clipper'),
    (select count(*) from public.clips where status <> 'rejected'),
    (select coalesce(sum(current_views), 0)::bigint from public.clip_net_7d),
    (select count(*) from public.campaigns where is_active);
$$;
grant execute on function public.public_stats() to anon, authenticated;

-- Top clippers anonymisés (prénom uniquement) pour la preuve sociale.
create or replace function public.public_top()
returns table (name text, vues bigint)
language sql stable security definer set search_path = public as $$
  select split_part(coalesce(p.display_name, 'Clipper'), ' ', 1),
         coalesce(sum(n.current_views), 0)::bigint as vues
  from public.profiles p
  left join public.clips c on c.clipper_id = p.id
  left join public.clip_net_7d n on n.clip_id = c.id
  where p.role = 'clipper'
  group by p.id
  having coalesce(sum(n.current_views), 0) > 0
  order by 2 desc
  limit 5;
$$;
grant execute on function public.public_top() to anon, authenticated;

-- Liste publique des campagnes actives.
create or replace function public.public_campaigns()
returns table (id uuid, name text, description text, rate numeric, accent text, clips bigint, vues bigint)
language sql stable security definer set search_path = public as $$
  select cam.id, cam.name, cam.description, cam.rate_per_1000, cam.accent,
    count(c.id)::bigint,
    coalesce(sum(n.current_views), 0)::bigint
  from public.campaigns cam
  left join public.clips c on c.campaign_id = cam.id and c.status <> 'rejected'
  left join public.clip_net_7d n on n.clip_id = c.id
  where cam.is_active
  group by cam.id
  order by 7 desc;
$$;
grant execute on function public.public_campaigns() to anon, authenticated;

-- Une campagne publique (page partageable).
create or replace function public.public_campaign(p_id uuid)
returns table (id uuid, name text, description text, rate numeric, accent text, clips bigint, vues bigint, clippers bigint)
language sql stable security definer set search_path = public as $$
  select cam.id, cam.name, cam.description, cam.rate_per_1000, cam.accent,
    count(c.id)::bigint,
    coalesce(sum(n.current_views), 0)::bigint,
    count(distinct c.clipper_id)::bigint
  from public.campaigns cam
  left join public.clips c on c.campaign_id = cam.id and c.status <> 'rejected'
  left join public.clip_net_7d n on n.clip_id = c.id
  where cam.id = p_id and cam.is_active
  group by cam.id;
$$;
grant execute on function public.public_campaign(uuid) to anon, authenticated;
