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
      <div className="flex min-h-screen items-center justify-center bg-base p-6">
        <div className="w-full max-w-[23rem] animate-fade-in rounded-lg border border-line bg-surface-1 shadow-2">
          <div className="flex items-center gap-2 border-b border-line-strong bg-surface-2 px-5 py-3">
            <ShieldAlert className="h-3.5 w-3.5 text-danger" />
            <p className="t-overline text-danger">Acesso restrito</p>
          </div>
          <div className="px-5 py-5">
            <p className="t-title">Esta conta não tem acesso</p>
            <p className="t-body mt-2 leading-relaxed">
              O backoffice é da equipe TikTally, parceiros e afiliados. Fale com o administrador
              para liberar o seu acesso.
            </p>
            <Button variant="outline" size="sm" className="mt-5" onClick={() => signOut()}>
              Sair
            </Button>
          </div>
        </div>
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
