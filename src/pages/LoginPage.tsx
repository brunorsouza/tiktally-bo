import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Receipt } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { CenteredSpinner } from "@/components/ui/spinner";

export function LoginPage() {
  const { session, loading, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <CenteredSpinner />;
  if (session) return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6">
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            <Receipt className="h-8 w-8 text-primary" />
            <h1 className="text-lg font-semibold">TikTally Backoffice</h1>
            <p className="text-sm text-muted-foreground">Console fiscal · acesso restrito à equipe</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">E-mail</label>
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Senha</label>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" loading={submitting}>
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
