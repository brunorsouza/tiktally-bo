import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Faltam VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY no .env (copie de .env.example)."
  );
}

/**
 * Cliente Supabase do backoffice — conecta no MESMO projeto do app TikTally,
 * usando apenas a chave anon. Toda operação privilegiada (leitura cross-tenant,
 * chamadas Spedy) passa pela edge function `bo-fiscal`, que valida
 * profiles.is_admin server-side. A chave anon aqui só serve pra autenticar o
 * admin e carregar o JWT que a edge function verifica.
 */
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "tiktally-backoffice-auth",
  },
});
