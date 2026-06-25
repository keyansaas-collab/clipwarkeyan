-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ClipWar — patch 21 : Anti-triche actionnable                 ║
-- ║  L'écran montre l'URL du clip + permet de valider l'anomalie. ║
-- ╚══════════════════════════════════════════════════════════════╝

-- admin_fraud : ajoute l'URL du clip + ne renvoie que les alertes non résolues
drop function if exists public.admin_fraud();
create or replace function public.admin_fraud()
returns table (
  id bigint, clip_id uuid, kind text, detail text, resolved boolean,
  created_at timestamptz, clipper_name text, platform text, asset_title text, url text, clip_status text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  return query
  select
    f.id, f.clip_id, f.kind, f.detail, f.resolved, f.created_at,
    p.display_name, c.platform, a.title, c.url, c.status
  from public.fraud_flags f
  left join public.clips    c on c.id = f.clip_id
  left join public.profiles p on p.id = c.clipper_id
  left join public.assets   a on a.id = c.asset_id
  where f.resolved = false
  order by f.created_at desc;
end; $$;

-- Valider une anomalie : résout l'alerte ; réactive le clip si fausse alerte.
create or replace function public.resolve_fraud(p_id bigint, p_reactivate boolean)
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  select clip_id into cid from public.fraud_flags where id = p_id;
  update public.fraud_flags set resolved = true where id = p_id;
  if p_reactivate and cid is not null then
    update public.clips set status = 'track' where id = cid and status = 'hold';
  end if;
end; $$;
grant execute on function public.resolve_fraud(bigint, boolean) to authenticated;
