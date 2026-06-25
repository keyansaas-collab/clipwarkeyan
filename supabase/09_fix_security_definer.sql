-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ClipWar — patch 09 : corrige l'alerte « Security Definer View »║
-- ║  À coller dans Supabase → SQL Editor → Run.                   ║
-- ╚══════════════════════════════════════════════════════════════╝
--
-- Le linter Supabase signale la vue public.clip_net_7d comme
-- SECURITY DEFINER (elle ignore la RLS de l'appelant). On la passe en
-- security_invoker : elle respecte désormais la RLS de l'utilisateur.
--
-- Sans risque ici :
--   • aucun clipper n'interroge cette vue directement (le calcul
--     « net 7 j » côté clipper se fait à partir des snapshots) ;
--   • les fonctions admin (admin_clips, admin_dashboard, …) qui la
--     lisent sont SECURITY DEFINER et tournent en tant que propriétaire
--     (postgres), qui contourne la RLS de ses propres tables — elles
--     continuent donc de voir toutes les lignes.

alter view public.clip_net_7d set (security_invoker = true);

-- Vérifie : l'alerte « Security Definer View » doit disparaître du
-- rapport (Database → Advisors / Security) après ce Run.
