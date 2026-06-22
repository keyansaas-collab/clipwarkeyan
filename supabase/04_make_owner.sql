-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ClipWar — passer Keyan en OWNER                             ║
-- ║  À coller dans Supabase → SQL Editor → Run.                  ║
-- ║  Prérequis : Keyan s'est connecté au moins une fois.        ║
-- ╚══════════════════════════════════════════════════════════════╝

-- 1) Corrige le verrou : il ne s'applique qu'aux utilisateurs connectés.
--    (L'éditeur SQL doit pouvoir promouvoir le tout premier owner.)
create or replace function public.guard_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role) and auth.uid() is not null and not public.is_staff() then
    raise exception 'Modification du rôle non autorisée';
  end if;
  return new;
end;
$$;

-- 2) Promeut Keyan en OWNER.
--    👉 REMPLACE l'email ci-dessous par celui utilisé à la connexion.
update public.profiles set role = 'owner'
where id = (select id from auth.users where email = 'keyan@exemple.com');

-- Résultat attendu : « Rows: 1 ».
-- Si « Rows: 0 » → l'email ne correspond à aucun compte (faute de frappe,
--   ou Keyan ne s'est pas encore connecté une première fois).
