import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Tema: `papel` (claro) ou `tinta` (escuro).
 *
 * Os nomes não são enfeite — são a instrução de projeto. Quem for mexer numa
 * tela precisa lembrar que o claro é PAPEL (fundo quente, tinta quente) e não
 * "o escuro invertido", que é onde tema claro costuma nascer torto.
 *
 * A escolha mora no localStorage; sem escolha, seguimos o sistema. O `<html
 * class="dark">` é aplicado ANTES do React montar (script em index.html), pra
 * a primeira pintura já vir no tema certo.
 */
export type Theme = "papel" | "tinta";

const KEY = "tiktally-bo-tema";

interface ThemeApi {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeApi | undefined>(undefined);

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "tinta");
}

/**
 * Sem escolha salva, abre no CLARO — mesmo com o sistema em escuro.
 *
 * Não é desprezo pela preferência do SO: é que o backoffice foi desenhado como
 * uma interface clara (fundo gelo, cartão branco, acento vivo), e o escuro é
 * uma opção de conforto derivada dela. Seguir o sistema fazia metade das
 * pessoas nunca ver o produto como ele foi projetado.
 *
 * A escolha explícita continua mandando e sobrevive à sessão. Pra voltar a
 * seguir o SO, troque o corpo desta função pelo `matchMedia` — e o mesmo no
 * script anti-FOUC do index.html, que precisa concordar com ela.
 */
function inicial(): Theme {
  const salvo = localStorage.getItem(KEY);
  if (salvo === "papel" || salvo === "tinta") return salvo;
  return "papel";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(inicial);

  useEffect(() => apply(theme), [theme]);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem(KEY, t);
    setThemeState(t);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((atual) => {
      const proximo: Theme = atual === "papel" ? "tinta" : "papel";
      localStorage.setItem(KEY, proximo);
      return proximo;
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme deve ser usado dentro de <ThemeProvider>");
  return ctx;
}
