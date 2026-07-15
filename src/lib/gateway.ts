import { supabase } from "./supabase";

/**
 * Helper compartilhado p/ chamar as edge functions gateway do backoffice
 * (`bo-fiscal`, `bo-coupons`, …). Cada gateway roda com service-role e valida
 * profiles.is_admin server-side; aqui só mandamos o JWT do admin logado.
 *
 * Modo preview de dev: pula login + serve dados mock (sem backend). Travado em
 * `import.meta.env.DEV` — um build de produção SEMPRE ignora a flag, então não
 * há risco de subir o app sem auth / com dados mock.
 */
export const PREVIEW_MODE =
  import.meta.env.DEV && import.meta.env.VITE_DEV_PREVIEW === "true";

/**
 * Cria um cliente tipado para uma edge function gateway.
 *
 * @param fnName  nome da function (ex.: "bo-fiscal").
 * @param urlOverride  aponta o front pra function rodando via
 *   `supabase functions serve` (ex.: http://localhost:54321/functions/v1/bo-fiscal),
 *   enquanto auth/DB continuam no projeto real. Em produção, deixe vazio — aí
 *   usamos supabase.functions.invoke (resolve a URL pelo VITE_SUPABASE_URL).
 */
export function createGateway(fnName: string, urlOverride?: string) {
  async function callInvoke(action: string, params: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke(fnName, {
      body: { action, ...params },
    });
    if (error) {
      let msg = error.message;
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.json();
          if (body?.error) msg = body.error;
        }
      } catch {
        /* ignore */
      }
      throw new Error(msg || `Falha ao chamar ${fnName}`);
    }
    return data;
  }

  async function callDirect(action: string, params: Record<string, unknown>) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch(urlOverride!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ action, ...params }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok && body?.error) throw new Error(body.error);
    if (!res.ok) throw new Error(`Falha ao chamar ${fnName} (HTTP ${res.status})`);
    return body;
  }

  return async function call<T>(
    action: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    const data = urlOverride ? await callDirect(action, params) : await callInvoke(action, params);
    if (!data?.success) {
      throw new Error(data?.error || `Erro desconhecido no gateway ${fnName}`);
    }
    return data.data as T;
  };
}
