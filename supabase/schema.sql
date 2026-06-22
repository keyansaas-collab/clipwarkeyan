-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ClipWar — schéma Supabase (PostgreSQL)                       ║
-- ║  À coller dans Supabase → SQL Editor → Run.                   ║
-- ║  Encode la logique : 1 lien = 1 clip, snapshots de vues,     ║
-- ║  paiement net sur fenêtre 7 j glissants, anti-triche.        ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ─────────── 1. PROFILS & RÔLES ───────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  role         text not null default 'clipper' check (role in ('owner','admin','clipper')),
  rank         text default 'Recrue',
  created_at   timestamptz default now()
);

-- helper : l'utilisateur courant est-il staff (admin/owner) ?
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('owner','admin')
  );
$$;

-- crée automatiquement un profil à chaque inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────── 2. CAMPAGNES ───────────
create table if not exists public.campaigns (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  description    text,
  rate_per_1000  numeric not null default 1.0,   -- € pour 1000 vues nettes
  accent         text,                            -- gradient/couleur pour l'UI
  is_active      boolean default true,
  created_at     timestamptz default now()
);

-- ─────────── 3. ASSETS (le fichier vit sur R2/Drive) ───────────
create table if not exists public.assets (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid references public.campaigns on delete set null,
  title        text not null,
  duration     text,
  storage_url  text,                              -- lien R2 ou Drive
  source       text default 'r2' check (source in ('r2','drive')),
  created_by   uuid references public.profiles on delete set null,
  created_at   timestamptz default now()
);

-- téléchargements : attribution asset→clip + pré-remplissage soumission
create table if not exists public.asset_downloads (
  id            bigint generated always as identity primary key,
  asset_id      uuid references public.assets on delete cascade,
  clipper_id    uuid references public.profiles on delete cascade,
  downloaded_at timestamptz default now()
);
create index if not exists idx_dl_clipper on public.asset_downloads (clipper_id, downloaded_at desc);

-- ─────────── 4. CLIPS (1 lien = 1 clip) ───────────
create table if not exists public.clips (
  id           uuid primary key default gen_random_uuid(),
  clipper_id   uuid references public.profiles on delete cascade,
  campaign_id  uuid references public.campaigns on delete set null,
  asset_id     uuid references public.assets on delete set null,  -- null = "aucun / original"
  platform     text not null check (platform in ('tiktok','instagram','youtube')),
  url          text not null,
  status       text not null default 'track' check (status in ('track','paid','hold','rejected')),
  submitted_at timestamptz default now(),
  unique (platform, url)                          -- anti-doublon intra-plateforme
);
create index if not exists idx_clips_clipper on public.clips (clipper_id);

-- ─────────── 5. SNAPSHOTS DE VUES (cœur de la fenêtre glissante) ───────────
create table if not exists public.view_snapshots (
  id          bigint generated always as identity primary key,
  clip_id     uuid references public.clips on delete cascade,
  views       bigint not null,
  captured_at timestamptz default now()
);
-- index critique : le cron et le calcul de paiement lisent par clip + date
create index if not exists idx_snap_clip_time on public.view_snapshots (clip_id, captured_at desc);

-- ─────────── 6. CHALLENGES (surcouche temporaire d'une campagne) ───────────
create table if not exists public.challenges (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns on delete cascade,
  title       text not null,
  starts_at   timestamptz,
  ends_at     timestamptz,
  goal_views  bigint,
  pot         numeric,
  created_at  timestamptz default now()
);

-- ─────────── 7. PAIEMENTS ───────────
create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  clipper_id   uuid references public.profiles on delete cascade,
  period_start timestamptz not null,
  period_end   timestamptz not null,
  net_views    bigint not null default 0,
  amount       numeric not null default 0,
  status       text not null default 'pending' check (status in ('pending','held','paid')),
  created_at   timestamptz default now()
);

-- ─────────── 8. FLAGS ANTI-TRICHE ───────────
create table if not exists public.fraud_flags (
  id         bigint generated always as identity primary key,
  clip_id    uuid references public.clips on delete cascade,
  kind       text not null check (kind in ('negative_progress','duplicate','deleted_after_pay','spike')),
  detail     text,
  resolved   boolean default false,
  created_at timestamptz default now()
);

-- ─────────── 9. VUE : net 7 jours glissants par clip ───────────
-- net = vues actuelles − vues au début de la fenêtre (0 si le clip est plus récent).
-- C'est la référence que lira le moteur de paiement.
create or replace view public.clip_net_7d as
select
  c.id          as clip_id,
  c.clipper_id,
  c.status,
  coalesce(latest.views, 0)                                   as current_views,
  coalesce(base.views, 0)                                     as baseline_views,
  greatest(0, coalesce(latest.views,0) - coalesce(base.views,0)) as net_7d
from public.clips c
left join lateral (
  select views from public.view_snapshots s
  where s.clip_id = c.id
  order by s.captured_at desc limit 1
) latest on true
left join lateral (
  select views from public.view_snapshots s
  where s.clip_id = c.id and s.captured_at <= now() - interval '7 days'
  order by s.captured_at desc limit 1
) base on true;

-- ═══════════════ 10. SÉCURITÉ (RLS) ═══════════════
-- Sans ça, Supabase laisse les tables ouvertes/fermées par défaut.
alter table public.profiles       enable row level security;
alter table public.campaigns      enable row level security;
alter table public.assets         enable row level security;
alter table public.asset_downloads enable row level security;
alter table public.clips          enable row level security;
alter table public.view_snapshots enable row level security;
alter table public.challenges     enable row level security;
alter table public.payments       enable row level security;
alter table public.fraud_flags    enable row level security;

-- PROFILS : chacun voit/modifie le sien ; le staff voit tout.
create policy profiles_self_read   on public.profiles for select using (id = auth.uid() or public.is_staff());
create policy profiles_self_update on public.profiles for update using (id = auth.uid());

-- CATALOGUE (campagnes, assets, challenges) : lecture pour tous les connectés, écriture staff.
create policy campaigns_read  on public.campaigns  for select using (auth.role() = 'authenticated');
create policy campaigns_write on public.campaigns  for all    using (public.is_staff()) with check (public.is_staff());
create policy assets_read     on public.assets     for select using (auth.role() = 'authenticated');
create policy assets_write    on public.assets     for all    using (public.is_staff()) with check (public.is_staff());
create policy challenges_read on public.challenges for select using (auth.role() = 'authenticated');
create policy challenges_write on public.challenges for all   using (public.is_staff()) with check (public.is_staff());

-- TÉLÉCHARGEMENTS : le clipper crée/voit les siens, le staff voit tout.
create policy dl_insert on public.asset_downloads for insert with check (clipper_id = auth.uid());
create policy dl_read   on public.asset_downloads for select using (clipper_id = auth.uid() or public.is_staff());

-- CLIPS : le clipper soumet/voit les siens, le staff voit/gère tout.
create policy clips_insert on public.clips for insert with check (clipper_id = auth.uid());
create policy clips_read   on public.clips for select using (clipper_id = auth.uid() or public.is_staff());
create policy clips_staff  on public.clips for update using (public.is_staff());

-- SNAPSHOTS : lecture de ses propres clips ; l'écriture est faite par le cron
-- via la clé "service_role" (qui contourne la RLS) — pas de policy d'insert ici.
create policy snap_read on public.view_snapshots for select
  using (public.is_staff() or exists (
    select 1 from public.clips c where c.id = clip_id and c.clipper_id = auth.uid()
  ));

-- PAIEMENTS : le clipper voit les siens, le staff gère tout.
create policy pay_read  on public.payments for select using (clipper_id = auth.uid() or public.is_staff());
create policy pay_write on public.payments for all    using (public.is_staff()) with check (public.is_staff());

-- ANTI-TRICHE : staff uniquement.
create policy fraud_staff on public.fraud_flags for all using (public.is_staff()) with check (public.is_staff());

-- ═══════════════ 11. DONNÉES DE DÉPART (optionnel) ═══════════════
insert into public.campaigns (name, description, rate_per_1000, accent) values
  ('Lifestyle',        'Quotidien, voyages, behind-the-scenes', 1.0, 'linear-gradient(135deg,#2DE2E6,#8B6CFF)'),
  ('Coaching',         'Mindset, méthode, motivation',          1.2, 'linear-gradient(135deg,#8B6CFF,#AB8DFF)'),
  ('Le Business Paie', 'Argent, entreprise, finance',           1.5, 'linear-gradient(135deg,#FF6A45,#FFB23E)')
on conflict do nothing;
