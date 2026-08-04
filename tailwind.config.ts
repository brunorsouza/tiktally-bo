import type { Config } from "tailwindcss";

/**
 * Tokens do Design System vivem em `src/index.css` (CSS vars) — aqui só os
 * expomos ao Tailwind. Regra: nada de cor literal (`bg-slate-800`) nas telas;
 * sempre um token, pra o tema continuar sendo uma coisa só.
 */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Superfícies
        base: "hsl(var(--surface-base))",
        surface: {
          DEFAULT: "hsl(var(--surface-1))",
          1: "hsl(var(--surface-1))",
          2: "hsl(var(--surface-2))",
          3: "hsl(var(--surface-3))",
        },
        // Texto
        strong: "hsl(var(--text-strong))",
        subtle: "hsl(var(--text-muted))",
        // Linhas
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
        // Semânticos + superfície própria (badge não precisa de /15 no olho)
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
      // Raio quase nulo: instrumento, não app de consumo. O canto arredondado
      // grande é uma das assinaturas do visual "template".
      borderRadius: {
        sm: "0.125rem",
        md: "0.1875rem",
        lg: "0.25rem",
        xl: "0.375rem",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
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
      transitionTimingFunction: {
        // Uma curva só em toda a interface — movimento vira linguagem, não enfeite
        ds: "cubic-bezier(0.2, 0, 0, 1)",
      },
      transitionDuration: {
        ds: "140ms",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(2px)" },
          to: { opacity: "1", transform: "none" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "none" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 140ms cubic-bezier(0.2,0,0,1)",
        "scale-in": "scale-in 140ms cubic-bezier(0.2,0,0,1)",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
