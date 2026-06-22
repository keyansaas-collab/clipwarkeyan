-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ClipWar — patch 03 : fiche clipper (onboarding)             ║
-- ║  À coller dans Supabase → SQL Editor → Run.                  ║
-- ╚══════════════════════════════════════════════════════════════╝

alter table public.profiles
  add column if not exists tiktok         text,
  add column if not exists instagram      text,
  add column if not exists youtube        text,
  add column if not exists payout_method  text,    -- 'paypal' | 'iban' | 'autre'
  add column if not exists payout_detail  text,    -- email PayPal ou IBAN
  add column if not exists country        text,
  add column if not exists is_minor       boolean default false,
  add column if not exists guardian_email text,    -- requis si mineur
  add column if not exists onboarded      boolean default false;

-- Note : payout_detail (IBAN/PayPal) est une donnée sensible. Pour la prod,
-- prévoir un chiffrement ou un prestataire de paiement. La RLS limite déjà
-- la lecture au clipper concerné et au staff.
