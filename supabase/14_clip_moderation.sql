-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ClipWar — patch 14 : modération des clips (en masse)         ║
-- ║  Run dans Supabase → SQL Editor (après le tout-en-un).        ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Change le statut de plusieurs clips d'un coup (staff uniquement).
-- 'paid' est volontairement exclu : un paiement passe par settle_payment
-- pour figer la preuve. Ici on gère seulement suivi / pause / refus.
create or replace function public.set_clips_status(p_ids uuid[], p_status text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  if p_status not in ('track', 'hold', 'rejected') then raise exception 'Statut invalide'; end if;
  update public.clips set status = p_status where id = any(p_ids);
  get diagnostics n = row_count;
  return n;
end; $$;
grant execute on function public.set_clips_status(uuid[], text) to authenticated;
