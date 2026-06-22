-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ClipWar — patch 07 : gestion de l'équipe (associés admin)    ║
-- ║  À coller dans Supabase → SQL Editor → Run (après 06).       ║
-- ╚══════════════════════════════════════════════════════════════╝
--
-- Modèle de rôles (rappel) : 'owner' > 'admin' > 'clipper'.
--   • owner  = Keyan, contrôle l'équipe (un seul, en principe).
--   • admin  = les associés : accès complet au cockpit, MAIS ne
--              peuvent pas modifier les rôles (ils ne gèrent pas l'équipe).
--   • clipper = tout le monde par défaut à l'inscription.
-- is_staff() = owner OU admin → c'est ce qui ouvre la War Room.

-- ─────────── 1. PROMOUVOIR / RÉTROGRADER PAR EMAIL (réservé à l'owner) ───────────
-- Appelée depuis l'écran « Équipe » de l'app. Réservée à l'owner pour
-- qu'un associé ne puisse pas s'auto-promouvoir owner ni rétrograder Keyan.
create or replace function public.promote_by_email(target_email text, new_role text)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'owner') then
    raise exception 'Réservé au propriétaire';
  end if;
  if new_role not in ('clipper','admin','owner') then
    raise exception 'Rôle invalide';
  end if;
  select id into uid from auth.users where lower(email) = lower(trim(target_email));
  if uid is null then
    raise exception 'Aucun compte avec cet email. L''associé doit s''être inscrit au moins une fois.';
  end if;
  update public.profiles set role = new_role where id = uid;
  return uid::text;
end; $$;
grant execute on function public.promote_by_email(text, text) to authenticated;

-- ─────────── 2. LISTER L'ÉQUIPE (staff) ───────────
-- Renvoie les membres staff (owner/admin) avec leur email, pour l'écran Équipe.
create or replace function public.team_list()
returns table (id uuid, display_name text, role text, email text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  return query
  select p.id, p.display_name, p.role, u.email::text
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.role in ('owner','admin')
  order by case p.role when 'owner' then 0 else 1 end, p.display_name;
end; $$;
grant execute on function public.team_list() to authenticated;

-- ═══════════════════════════════════════════════════════════════
--  3. AJOUTER TES DEUX ASSOCIÉS EN ADMIN (méthode directe, une fois)
--     Prérequis : chaque associé s'est INSCRIT au moins une fois
--     (email + mot de passe) dans l'app.
--     👉 Remplace les deux emails, décommente, puis Run.
-- ═══════════════════════════════════════════════════════════════
-- update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'associe1@exemple.com');
-- update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'associe2@exemple.com');
--
-- Vérifie le résultat :
-- select u.email, p.role
--   from public.profiles p join auth.users u on u.id = p.id
--   where p.role in ('owner','admin');
