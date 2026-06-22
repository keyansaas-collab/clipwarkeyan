import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Client NAVIGATEUR (clé publique anon). Singleton + gestion de session
// pour l'auth (lien magique + Google). La RLS protège les données.
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
  );
  return _client;
}
