-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ClipWar — patch 15 : parrainage                              ║
-- ║  Run dans Supabase → SQL Editor (après le tout-en-un).        ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ─────────── 1. Colonnes ───────────
alter table public.profiles add column if not exists referral_code text unique;
alter table public.profiles add column if not exists referred_by   uuid references public.profiles on delete set null;

-- ─────────── 2. Mon code de parrainage (créé à la volée) ───────────
create or replace function public.my_referral_code()
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  select referral_code into c from public.profiles where id = auth.uid();
  if c is null then
    loop
      c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
      exit when not exists (select 1 from public.profiles where referral_code = c);
    end loop;
    update public.profiles set referral_code = c where id = auth.uid();
  end if;
  return c;
end; $$;
grant execute on function public.my_referral_code() to authenticated;

-- ─────────── 3. Lier mon compte à un parrain (1 seule fois, pas soi-même) ───────────
create or replace function public.link_referral(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare ref uuid;
begin
  if p_code is null or length(trim(p_code)) = 0 then return false; end if;
  select id into ref from public.profiles where referral_code = upper(trim(p_code));
  if ref is null or ref = auth.uid() then return false; end if;
  update public.profiles set referred_by = ref
    where id = auth.uid() and referred_by is null;
  if found then
    perform public.notify(ref, 'new_clipper', 'Nouveau filleul 👋',
      'Quelqu''un vient de rejoindre ClipWar grâce à ton lien. Aide-le à décoller !', 'profil');
    return true;
  end if;
  return false;
end; $$;
grant execute on function public.link_referral(text) to authenticated;

-- ─────────── 4. Mes filleuls + leur progression (palier 10 000 vues) ───────────
create or replace function public.my_referrals()
returns table (id uuid, name text, avatar_url text, vues_total bigint, reached boolean, joined_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select p.id, coalesce(p.display_name, 'Clipper'), p.avatar_url,
    coalesce(sum(n.current_views), 0)::bigint,
    coalesce(sum(n.current_views), 0) >= 10000,
    p.created_at
  from public.profiles p
  left join public.clips c on c.clipper_id = p.id
  left join public.clip_net_7d n on n.clip_id = c.id
  where p.referred_by = auth.uid()
  group by p.id
  order by p.created_at desc;
end; $$;
grant execute on function public.my_referrals() to authenticated;

-- ─────────── 5. Vue admin : bonus de parrainage à verser ───────────
create or replace function public.admin_referrals()
returns table (parrain_id uuid, parrain text, filleuls bigint, valides bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  return query
  select pr.id, coalesce(pr.display_name, 'Clipper'),
    count(f.id)::bigint,
    count(*) filter (where sub.vues >= 10000)::bigint
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
