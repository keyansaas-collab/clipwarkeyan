-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ClipWar — patch 13 : centre de notifications                 ║
-- ║  Table + RLS + déclencheurs automatiques. Run dans Supabase.  ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ─────────── 1. Table ───────────
create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  link_tab   text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_user on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists notif_read   on public.notifications;
drop policy if exists notif_update on public.notifications;
create policy notif_read   on public.notifications for select using (user_id = auth.uid());
create policy notif_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─────────── 2. Aides d'insertion (bypass RLS) ───────────
create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, kind, title, body, link_tab)
  values (p_user, p_kind, p_title, p_body, p_link);
end; $$;

create or replace function public.notify_staff(p_kind text, p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, kind, title, body, link_tab)
  select id, p_kind, p_title, p_body, p_link
  from public.profiles where role in ('owner', 'admin');
end; $$;

-- ─────────── 3. Déclencheurs ───────────

-- (a) Nouveau clip soumis → clipper rassuré + staff alerté
create or replace function public.trg_clip_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  perform public.notify(NEW.clipper_id, 'clip_validated', 'Clip bien reçu ✓',
    'On suit tes vues automatiquement. Plus elles montent, plus tu gagnes.', 'clips');
  select coalesce(display_name, 'Un clipper') into nm from public.profiles where id = NEW.clipper_id;
  perform public.notify_staff('clip_submitted', 'Nouveau clip à vérifier',
    coalesce(nm, 'Un clipper') || ' vient de soumettre un clip.', 'clips');
  return NEW;
end; $$;
drop trigger if exists clip_insert_notif on public.clips;
create trigger clip_insert_notif after insert on public.clips
  for each row execute function public.trg_clip_insert();

-- (b) Changement de statut d'un clip
create or replace function public.trg_clip_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.status is distinct from OLD.status then
    if NEW.status = 'paid' then
      perform public.notify(NEW.clipper_id, 'clip_paid', 'Clip payé 💰',
        'Un de tes clips vient d''être réglé. Bravo !', 'bilan');
    elsif NEW.status = 'hold' then
      perform public.notify(NEW.clipper_id, 'clip_held', 'Clip en pause ⏸️',
        'Un clip a été gelé (vérifie qu''il est toujours en ligne).', 'clips');
    elsif NEW.status = 'rejected' then
      perform public.notify(NEW.clipper_id, 'clip_rejected', 'Clip refusé',
        'Un clip n''a pas été retenu. Réessaie avec un autre contenu.', 'clips');
    elsif NEW.status = 'track' and OLD.status = 'hold' then
      perform public.notify(NEW.clipper_id, 'clip_validated', 'Clip réactivé ✓',
        'Ton clip est de nouveau suivi. Les vues recommencent à compter.', 'clips');
    end if;
  end if;
  return NEW;
end; $$;
drop trigger if exists clip_status_notif on public.clips;
create trigger clip_status_notif after update on public.clips
  for each row execute function public.trg_clip_status();

-- (c) Paiement enregistré
create or replace function public.trg_payment_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify(NEW.clipper_id, 'clip_paid', 'Paiement reçu 💰',
    'Tu as été payé : ' || round(coalesce(NEW.amount, 0)) || ' €. Détail dans ton bilan.', 'bilan');
  return NEW;
end; $$;
drop trigger if exists payment_insert_notif on public.payments;
create trigger payment_insert_notif after insert on public.payments
  for each row execute function public.trg_payment_insert();

-- (d) Nouveau challenge → tous les clippers
create or replace function public.trg_challenge_new() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, kind, title, body, link_tab)
  select id, 'challenge_new', 'Nouveau challenge 🚀',
    NEW.title || ' — fonce, une prime est en jeu !', 'home'
  from public.profiles where role = 'clipper';
  return NEW;
end; $$;
drop trigger if exists challenge_new_notif on public.challenges;
create trigger challenge_new_notif after insert on public.challenges
  for each row execute function public.trg_challenge_new();

-- (e) Challenge gagné → le gagnant
create or replace function public.trg_challenge_award() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.winner_id is not null and NEW.winner_id is distinct from OLD.winner_id then
    perform public.notify(NEW.winner_id, 'challenge_won', 'Tu as gagné 🏆',
      'Challenge « ' || NEW.title || ' » remporté ! Ta prime t''attend.', 'home');
  end if;
  return NEW;
end; $$;
drop trigger if exists challenge_award_notif on public.challenges;
create trigger challenge_award_notif after update on public.challenges
  for each row execute function public.trg_challenge_award();

-- (f) Alerte anti-triche → staff
create or replace function public.trg_fraud_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_staff('fraud_alert', 'Alerte anti-triche ⚠️',
    coalesce(NEW.detail, 'Signal détecté sur un clip.'), 'fraud');
  return NEW;
end; $$;
drop trigger if exists fraud_insert_notif on public.fraud_flags;
create trigger fraud_insert_notif after insert on public.fraud_flags
  for each row execute function public.trg_fraud_insert();
