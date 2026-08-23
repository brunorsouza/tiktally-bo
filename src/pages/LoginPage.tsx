import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Eye, EyeOff, Moon, Sun } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Note, Skeleton } from "@/components/ds";

/**
 * Login.
 *
 * Uma FOLHA pousada na mesa — a mesma linguagem do resto do backoffice, e não
 * o cartão-de-SaaS centralizado com logo em círculo. Quem entra já reconhece o
 * material do produto antes de digitar a primeira letra.
 */
export function LoginPage() {
  const { session, loading, signIn } = useAuth();
  const { theme, toggle } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-base p-6">
        <Skeleton className="h-64 w-full max-w-[23rem]" />
      </div>
    );
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
    <div className="relative flex min-h-screen items-center justify-center bg-base p-6">
      <button
        onClick={toggle}
        aria-label={theme === "tinta" ? "Mudar para tema claro" : "Mudar para tema escuro"}
        className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-md text-subtle transition-colors duration-ds ease-ds hover:bg-surface-3 hover:text-strong"
      >
        {theme === "tinta" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
      </button>

      <div className="w-full max-w-[23rem] animate-fade-in">
        <div className="rounded-lg border border-line bg-surface-1 shadow-2">
          {/* Cabeçalho da ficha: marca em serifa e a régua da casa */}
          <div className="border-b border-line-strong bg-surface-2 px-6 pb-4 pt-5">
            <p className="text-[1.3125rem] font-semibold leading-none tracking-[-0.02em] text-strong">
              TikTally
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <span className="h-px w-4 bg-brand" />
              <p className="t-overline">Backoffice</p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 px-6 py-6">
            <Field label="E-mail">
              <Input
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@tiktally.com.br"
                required
              />
            </Field>

            <Field label="Senha">
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-subtle transition-colors duration-ds ease-ds hover:text-strong"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </Field>

            {error && (
              <Note tone="danger">{error}</Note>
            )}

            <Button type="submit" size="lg" block loading={submitting}>
              Entrar
            </Button>
          </form>
        </div>

        <p className="t-caption mt-4 text-center">Acesso da equipe TikTally, parceiros e afiliados.</p>
      </div>
    </div>
  );
}
