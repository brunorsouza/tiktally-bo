import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { PREVIEW_MODE } from "@/lib/boFiscal";

/** Usuário/sessão fake do modo preview (VITE_DEV_PREVIEW=true). */
const PREVIEW_USER = { id: "dev-preview", email: "preview@tiktally.dev" } as User;
const PREVIEW_SESSION = { user: PREVIEW_USER, access_token: "preview" } as unknown as Session;

interface AuthState {
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

async function checkIsAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("[Auth] erro ao checar is_admin:", error.message);
    return false;
  }
  return Boolean(data?.is_admin);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  /**
   * Quem estava logado na última vez que o estado de auth mudou.
   *
   * Guardado em ref (não em state) de propósito: a comparação precisa
   * acontecer DENTRO do callback do `onAuthStateChange`, antes de qualquer
   * re-render — se virasse state, o render com a sessão nova aconteceria antes
   * de a gente perceber que a identidade trocou.
   */
  const identidadeAnterior = useRef<string | null>(PREVIEW_MODE ? PREVIEW_USER.id : null);
  const [session, setSession] = useState<Session | null>(PREVIEW_MODE ? PREVIEW_SESSION : null);
  const [user, setUser] = useState<User | null>(PREVIEW_MODE ? PREVIEW_USER : null);
  const [isAdmin, setIsAdmin] = useState(PREVIEW_MODE);
  const [loading, setLoading] = useState(!PREVIEW_MODE);

  useEffect(() => {
    if (PREVIEW_MODE) return;
    let active = true;

    async function hydrate(s: Session | null) {
      if (!active) return;

      /**
       * Trocou de identidade → o cache do React Query da sessão anterior não
       * vale mais NADA e precisa morrer aqui, antes do `setSession`.
       *
       * Sem isto: sai do admin, entra como afiliado, e `useMe()` devolve
       * `{role:"admin"}` do cache — com `staleTime` de 5 min, sem nem disparar
       * refetch. O `ProtectedRoute` então libera rota de admin pra um JWT de
       * afiliado, o gateway responde 403, e só um F5 (QueryClient novo)
       * resolvia. O mesmo valia pra `["invoices"]`, `["coupons"]` e as demais:
       * nenhuma chave carrega a identidade de quem pediu o dado.
       *
       * A comparação é pelo ID do usuário, não pelo evento: `SIGNED_IN` e
       * `TOKEN_REFRESHED` disparam o tempo todo para a MESMA pessoa (foco de
       * aba, renovação de token). Limpar a cada evento derrubaria o cache
       * inteiro de minuto em minuto.
       *
       * Ponto único: logout, login de outro usuário e logout feito em outra
       * aba passam todos por aqui.
       */
      const identidade = s?.user?.id ?? null;
      if (identidade !== identidadeAnterior.current) {
        identidadeAnterior.current = identidade;
        queryClient.clear();
      }

      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        const admin = await checkIsAdmin(s.user.id);
        if (active) setIsAdmin(admin);
      } else {
        setIsAdmin(false);
      }
      if (active) setLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => hydrate(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      hydrate(s);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  };

  const signOut = async () => {
    if (PREVIEW_MODE) return; // no preview, não há sessão real pra encerrar
    await supabase.auth.signOut();
    setIsAdmin(false);
    // O cache não é limpo aqui: quem faz isso é o `hydrate`, ao ver a
    // identidade virar `null`. Um só lugar decide — dois pontos limpando
    // acabam divergindo, e o `hydrate` cobre também o logout feito em outra
    // aba, que nunca passa por este botão.
  };

  return (
    <AuthContext.Provider value={{ session, user, isAdmin, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
