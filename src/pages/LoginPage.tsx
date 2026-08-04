import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Note, Skeleton } from "@/components/ds";

/**
 * Login.
 *
 * Sem o cartão centralizado de sempre: o formulário se alinha à esquerda numa
 * coluna estreita, com a mesma régua e o mesmo monograma da barra lateral.
 * Quem entra já reconhece o produto antes de digitar.
 */
export function LoginPage() {
  const { session, loading, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Skeleton className="h-40 w-full max-w-[20rem]" />
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
    <div className="flex min-h-screen items-center justify-center bg-base p-6">
      <div className="w-full max-w-[20rem]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-[0.8125rem] font-bold text-brand-foreground">
            T
          </div>
          <div className="leading-tight">
            <p className="text-[0.875rem] font-semibold tracking-tight text-strong">TikTally</p>
            <p className="text-[0.5625rem] font-semibold uppercase tracking-[0.12em] text-subtle">Backoffice</p>
          </div>
        </div>

        <div className="my-6 border-t border-line" />

        <form onSubmit={onSubmit} className="space-y-4">
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
            <Note tone="warning" className="border-l-danger text-danger">
              {error}
            </Note>
          )}

          <Button type="submit" className="w-full" loading={submitting}>
            Entrar
          </Button>
        </form>

        <p className="t-caption mt-6">Acesso da equipe TikTally, parceiros e afiliados.</p>
      </div>
    </div>
  );
}
