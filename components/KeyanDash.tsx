-- ═══════════════════════════════════════════════════════════════
-- KeyanOS · rapport period-aware (Daily / 7 / 15 / 30 jours)
-- À exécuter dans Supabase → SQL Editor.
-- Additif, réservé owner/admin. Retourne tout le rapport en JSON.
--
-- NOTE HONNÊTE : il n'existe pas de lien clip→prospect dans la base,
-- donc le funnel est présenté en 2 étages (acquisition puis setting),
-- pas en attribution vue-par-vue. Les volumes de setting/closing sont
-- attribués par created_at des prospects sur la période.
-- ═══════════════════════════════════════════════════════════════

create or replace function public._is_boss()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('owner','admin'));
$$;

-- calcule les métriques d'UNE fenêtre [since, until)
create or replace function public._keyan_window(p_since timestamptz, p_until timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  -- acquisition
  v_clips int; v_clippers int; v_paid numeric; v_views_gained bigint;
  -- setting / closing (par created_at des prospects)
  v_leads_in int; v_contacted int; v_rdv int; v_honored int; v_ventes int; v_ca numeric;
  v_replied int;
begin
  -- ACQUISITION : clips publiés + clippers actifs sur la période
  select count(*), count(distinct clipper_id)
    into v_clips, v_clippers
    from public.clips
   where submitted_at >= p_since and submitted_at < p_until;

  -- paiements clippers sur la période (coût acquisition)
  select coalesce(sum(amount),0)
    into v_paid
    from public.payments
   where created_at >= p_since and created_at < p_until;

  -- vues GAGNÉES sur la période = (max vues dans la fenêtre) - (dernières vues avant)
  with per_clip as (
    select clip_id,
           max(case when captured_at < p_until then views end) as v_end,
           max(case when captured_at < p_since then views end) as v_start
      from public.view_snapshots
     where captured_at < p_until
     group by clip_id
  )
  select coalesce(sum(greatest(0, coalesce(v_end,0) - coalesce(v_start,0))),0)
    into v_views_gained
    from per_clip;

  -- SETTING / CLOSING : prospects créés sur la période
  select
    count(*) filter (where source = 'inbound'),
    count(*),
    count(*) filter (where stage in ('rdv_pris','rdv_honore','vendu')),
    count(*) filter (where stage in ('rdv_honore','vendu')),
    count(*) filter (where stage = 'vendu'),
    coalesce(sum(sale_amount) filter (where stage = 'vendu'),0),
    count(*) filter (where stage not in ('nouveau','contacte'))
    into v_leads_in, v_contacted, v_rdv, v_honored, v_ventes, v_ca, v_replied
    from public.prospects
   where created_at >= p_since and created_at < p_until;

  return jsonb_build_object(
    'clips', v_clips,
    'clippers', v_clippers,
    'paid', v_paid,
    'views_gained', v_views_gained,
    'leads_in', v_leads_in,
    'contacted', v_contacted,
    'replied', v_replied,
    'rdv', v_rdv,
    'honored', v_honored,
    'ventes', v_ventes,
    'ca', v_ca
  );
end;
$$;

-- RAPPORT COMPLET : période courante + période précédente (pour les deltas)
create or replace function public.keyan_report(p_days int default 7)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  d int := greatest(1, coalesce(p_days,7));
  now_ts timestamptz := now();
  cur jsonb;
  prev jsonb;
begin
  if not public._is_boss() then
    raise exception 'not authorized';
  end if;

  cur  := public._keyan_window(now_ts - make_interval(days => d), now_ts);
  prev := public._keyan_window(now_ts - make_interval(days => d*2), now_ts - make_interval(days => d));

  return jsonb_build_object('days', d, 'current', cur, 'previous', prev);
end;
$$;

grant execute on function public.keyan_report(int) to authenticated;

-- ✔ Usage front : db.rpc('keyan_report', { p_days: 7 })
--   → { days, current:{...}, previous:{...} } pour afficher chiffres + deltas.
