import { createClient } from "@supabase/supabase-js";

// Client SERVEUR avec la clé service_role : contourne la RLS.
// À n'utiliser QUE côté serveur (routes API / cron). Jamais dans un composant client.
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
