import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
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
  const [session, setSession] = useState<Session | null>(PREVIEW_MODE ? PREVIEW_SESSION : null);
  const [user, setUser] = useState<User | null>(PREVIEW_MODE ? PREVIEW_USER : null);
  const [isAdmin, setIsAdmin] = useState(PREVIEW_MODE);
  const [loading, setLoading] = useState(!PREVIEW_MODE);

  useEffect(() => {
    if (PREVIEW_MODE) return;
    let active = true;

    async function hydrate(s: Session | null) {
      if (!active) return;
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
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  };

  const signOut = async () => {
    if (PREVIEW_MODE) return; // no preview, não há sessão real pra encerrar
    await supabase.auth.signOut();
    setIsAdmin(false);
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
