-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ClipWar — patch 02 : sécurité des rôles                      ║
-- ║  À coller dans Supabase → SQL Editor → Run (après schema.sql).║
-- ╚══════════════════════════════════════════════════════════════╝

-- 1) VERROU ANTI AUTO-PROMOTION
-- Empêche un utilisateur de modifier son propre `role`.
-- Seul le staff (admin/owner) peut changer un rôle.
create or replace function public.guard_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role) and auth.uid() is not null and not public.is_staff() then
    raise exception 'Modification du rôle non autorisée';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_role on public.profiles;
create trigger trg_guard_role
  before update on public.profiles
  for each row execute function public.guard_role_change();

-- 2) LE STAFF PEUT GÉRER LES PROFILS DES AUTRES (promouvoir / rétrograder)
drop policy if exists profiles_staff_update on public.profiles;
create policy profiles_staff_update
  on public.profiles for update
  using (public.is_staff())
  with check (public.is_staff());

-- (la règle existante "profiles_self_update" reste : chacun édite son nom,
--  mais le trigger ci-dessus bloque le changement de rôle pour les non-staff.)

-- 3) FONCTION PRATIQUE POUR L'ÉCRAN "ÉQUIPE"
-- Keyan (owner) appellera ceci depuis l'app pour promouvoir quelqu'un.
create or replace function public.set_user_role(target uuid, new_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then
    raise exception 'Réservé au staff';
  end if;
  if new_role not in ('clipper','admin','owner') then
    raise exception 'Rôle invalide';
  end if;
  update public.profiles set role = new_role where id = target;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4) PROMOUVOIR KEYAN EN OWNER (à faire UNE fois, APRÈS sa 1re connexion)
--    Remplace l'email, décommente la ligne, puis Run.
-- ─────────────────────────────────────────────────────────────
-- update public.profiles set role = 'owner'
--   where id = (select id from auth.users where email = 'keyan@exemple.com');
