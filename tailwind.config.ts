import type { Config } from "tailwindcss";

/**
 * Os tokens vivem em `src/index.css` (CSS vars) — aqui só os expomos ao
 * Tailwind. Regra da casa: NADA de cor literal (`bg-stone-100`) nas telas.
 * Sempre um token, senão o tema deixa de ser uma coisa só e vira 30 coisas
 * parecidas — que é exatamente como interface começa a parecer gerada.
 */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Superfícies: a mesa, a folha, o rebaixo, o realce
        base: "hsl(var(--surface-base))",
        surface: {
          DEFAULT: "hsl(var(--surface-1))",
          1: "hsl(var(--surface-1))",
          2: "hsl(var(--surface-2))",
          3: "hsl(var(--surface-3))",
        },
        // Tinta
        strong: "hsl(var(--text-strong))",
        subtle: "hsl(var(--text-muted))",
        ink: "hsl(var(--text))",
        // Réguas
        line: {
          DEFAULT: "hsl(var(--line))",
          strong: "hsl(var(--line-strong))",
        },
        // Marca
        brand: {
          DEFAULT: "hsl(var(--brand))",
          strong: "hsl(var(--brand-strong))",
          muted: "hsl(var(--brand-muted))",
          foreground: "hsl(var(--brand-foreground))",
        },
        // Semânticos + superfície própria (chip não precisa depender de /15)
        success: {
          DEFAULT: "hsl(var(--success))",
          surface: "hsl(var(--success-surface))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          surface: "hsl(var(--warning-surface))",
          foreground: "hsl(var(--warning-foreground))",
        },
        danger: {
          DEFAULT: "hsl(var(--danger))",
          surface: "hsl(var(--danger-surface))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          surface: "hsl(var(--info-surface))",
        },

        // Aliases mantidos pro código existente não quebrar de uma vez
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
      },
      // Canto generoso: na referência é ele, junto da sombra, que dá corpo ao
      // cartão. `pill` é o botão — totalmente arredondado.
      borderRadius: {
        sm: "0.25rem",
        md: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
        pill: "9999px",
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        1: "var(--shadow-1)",
        2: "var(--shadow-2)",
        3: "var(--shadow-3)",
      },
      height: {
        control: "var(--control-md)",
        "control-sm": "var(--control-sm)",
        "control-lg": "var(--control-lg)",
      },
      width: {
        control: "var(--control-md)",
        "control-sm": "var(--control-sm)",
        "control-lg": "var(--control-lg)",
      },
      transitionTimingFunction: {
        // Uma curva só na interface inteira — movimento vira linguagem, não enfeite
        ds: "cubic-bezier(0.2, 0, 0, 1)",
      },
      transitionDuration: {
        ds: "140ms",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(3px)" },
          to: { opacity: "1", transform: "none" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.98) translateY(4px)" },
          to: { opacity: "1", transform: "none" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 160ms cubic-bezier(0.2,0,0,1)",
        "scale-in": "scale-in 140ms cubic-bezier(0.2,0,0,1)",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
