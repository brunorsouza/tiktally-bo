import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMe } from "@/hooks/useBoCoupons";
import { CenteredSpinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import type { BoRole } from "@/types";

/** Rota-raiz de cada papel: pra onde o usuário é mandado ao entrar. */
export const HOME_BY_ROLE: Record<Exclude<BoRole, "none">, string> = {
  admin: "/",
  business: "/business",
  affiliate: "/affiliate",
};

/**
 * Gate de acesso. O papel é resolvido SERVER-SIDE pelo gateway (`me`) — o front
 * só usa pra navegar; todo escopo de dado é forçado no servidor.
 *
 * @param allow  papéis que podem ver a rota. Default: só admin.
 */
export function ProtectedRoute({
  children,
  allow = ["admin"],
}: {
  children: ReactNode;
  allow?: BoRole[];
}) {
  const { loading, session, signOut } = useAuth();
  const { data: me, isLoading: meLoading, error } = useMe();
  const location = useLocation();

  if (loading) return <CenteredSpinner label="Carregando…" />;
  if (!session) return <Navigate to="/login" replace />;
  if (meLoading) return <CenteredSpinner label="Verificando acesso…" />;

  const role: BoRole = error ? "none" : me?.role ?? "none";

  if (role === "none") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <div>
          <h1 className="text-lg font-semibold">Acesso restrito</h1>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Esta conta não tem acesso ao backoffice. Fale com o administrador da TikTally.
          </p>
        </div>
        <Button variant="outline" onClick={() => signOut()}>
          Sair
        </Button>
      </div>
    );
  }

  // Papel válido mas sem permissão nesta rota → manda pra home do papel.
  if (!allow.includes(role)) {
    const home = HOME_BY_ROLE[role as Exclude<BoRole, "none">];
    if (location.pathname !== home) return <Navigate to={home} replace />;
    return <CenteredSpinner label="Redirecionando…" />;
  }

  return <>{children}</>;
}
