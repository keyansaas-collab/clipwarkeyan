import { createClient } from "@supabase/supabase-js";

// Client NAVIGATEUR avec la clé publique (anon / publishable).
// Sûr à exposer côté front : la RLS protège les données.
export function supabaseBrowser() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
