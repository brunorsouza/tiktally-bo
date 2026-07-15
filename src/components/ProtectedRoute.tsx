import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { CenteredSpinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { loading, session, isAdmin, signOut } = useAuth();

  if (loading) return <CenteredSpinner label="Carregando…" />;
  if (!session) return <Navigate to="/login" replace />;

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <div>
          <h1 className="text-lg font-semibold">Acesso restrito</h1>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Esta conta não tem permissão de administrador. O backoffice é exclusivo da equipe
            TikTally (profiles.is_admin).
          </p>
        </div>
        <Button variant="outline" onClick={() => signOut()}>
          Sair
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
