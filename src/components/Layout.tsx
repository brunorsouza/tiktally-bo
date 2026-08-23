import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Store,
  Webhook,
  LogOut,
  BarChart3,
  Ticket,
  Gift,
  DollarSign,
  Users,
  Building2,
  Coins,
  Wallet,
  ShieldCheck,
  Sun,
  Moon,
  PanelRight,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useMe } from "@/hooks/useBoCoupons";
import { AttentionRail } from "@/components/AttentionRail";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}
interface NavSection {
  title: string;
  items: NavItem[];
}

/** Business: gere a própria carteira (afiliados + cupons). */
const businessSections: NavSection[] = [
  {
    title: "Minha carteira",
    items: [
      { to: "/business", label: "Visão geral", icon: Wallet },
      { to: "/affiliates", label: "Afiliados", icon: Users },
      { to: "/coupons", label: "Cupons", icon: Ticket },
    ],
  },
];

/** Afiliado: só o próprio desempenho (read-only). */
const affiliateSections: NavSection[] = [
  {
    title: "Meu programa",
    items: [{ to: "/affiliate", label: "Meu desempenho", icon: Wallet }],
  },
];

const adminSections: NavSection[] = [
  {
    title: "Fiscal",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/invoices", label: "Notas (NF-e)", icon: FileText },
      { to: "/sellers", label: "Sellers", icon: Store },
      { to: "/accounts", label: "Contas e ambiente", icon: Users },
      { to: "/companies", label: "Empresas (Spedy)", icon: Building2 },
      { to: "/webhooks", label: "Webhooks", icon: Webhook },
    ],
  },
  {
    title: "Cupons",
    items: [
      { to: "/coupons-overview", label: "Visão geral", icon: BarChart3 },
      { to: "/coupons", label: "Cupons", icon: Ticket },
      { to: "/redemptions", label: "Resgates", icon: Gift },
      { to: "/pricing", label: "Planos & Preços", icon: DollarSign },
    ],
  },
  {
    title: "Afiliados",
    items: [
      { to: "/affiliates", label: "Afiliados", icon: Users },
      { to: "/businesses", label: "Businesses", icon: Building2 },
      { to: "/commissions", label: "Comissões", icon: Coins },
    ],
  },
  {
    // Seção própria: quem entra no backoffice não é assunto de Fiscal, de
    // Cupons nem de Afiliados — e enfiar em qualquer uma delas esconderia a
    // tela mais sensível do console dentro de um menu que fala de outra coisa.
    title: "Sistema",
    items: [{ to: "/admins", label: "Administradores", icon: ShieldCheck }],
  },
];

const RAIL_KEY = "tiktally-bo-painel";

/**
 * Relógio da barra de topo.
 *
 * Todo console de back-office desse padrão abre com hora e data — e não é
 * enfeite: o operador carimba horário em ligação, prazo e emissão o tempo
 * todo, e tirar isso do relógio do sistema é um desvio de atenção por vez.
 *
 * Atualiza a cada 30s (a precisão exibida é o minuto), não a cada segundo:
 * um render por segundo em toda a árvore pra mexer dois dígitos é desperdício.
 */
function Relogio() {
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(agora);
  const data = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(agora);

  return (
    <div className="flex items-baseline gap-2.5">
      <span className="tabular text-[0.9375rem] font-medium leading-none text-strong">{hora}</span>
      <span className="t-caption first-letter:uppercase">{data}</span>
    </div>
  );
}

function BotaoIcone({
  onClick,
  title,
  ativo,
  className,
  children,
}: {
  onClick: () => void;
  title: string;
  ativo?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={ativo}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-ds ease-ds",
        "[&_svg]:h-3.5 [&_svg]:w-3.5",
        ativo ? "bg-surface-3 text-strong" : "text-subtle hover:bg-surface-3 hover:text-strong",
        className
      )}
    >
      {children}
    </button>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const { data: me } = useMe();
  const navigate = useNavigate();

  const [railAberto, setRailAberto] = useState(() => localStorage.getItem(RAIL_KEY) !== "0");
  const alternarRail = () => {
    setRailAberto((v) => {
      localStorage.setItem(RAIL_KEY, v ? "0" : "1");
      return !v;
    });
  };

  const sections =
    me?.role === "admin" ? adminSections : me?.role === "business" ? businessSections : affiliateSections;

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const papel =
    me?.role === "admin" ? "Administração" : me?.role === "business" ? "Parceiro" : "Afiliado";

  return (
    /**
     * Três blocos de trabalho, com ROLAGEM INDEPENDENTE em cada um.
     *
     * É isso, e não `position: sticky`, que faz o painel lateral "ficar parado
     * enquanto só o centro muda". Com sticky, rolar uma tabela longa arrasta a
     * página inteira e o painel some junto — exatamente o que o padrão evita.
     * Aqui a janela não rola: cada bloco rola por dentro.
     *
     * Efeito colateral bom: o cabeçalho fixo da tabela passa a grudar no topo
     * do bloco central, logo abaixo da barra, sem precisar de deslocamento
     * chutado em pixel.
     */
    <div className="flex h-screen overflow-hidden bg-base">
      {/* ── Bloco 1: navegação ──────────────────────────────────────────── */}
      <aside className="flex w-[15.5rem] shrink-0 flex-col border-r border-line bg-surface-1">
        <div className="flex h-16 shrink-0 items-center border-b border-line px-5">
          <div>
            <p className="text-[1.0625rem] font-semibold leading-none tracking-[-0.02em] text-strong">
              TikTally
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="h-px w-4 bg-brand" />
              <p className="t-overline">{papel}</p>
            </div>
          </div>
        </div>

        <nav className="min-h-0 flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="t-overline px-2 pb-2">{section.title}</p>
              <div className="space-y-px">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[0.8125rem]",
                        "transition-colors duration-ds ease-ds",
                        isActive
                          ? "bg-brand-muted font-semibold text-brand"
                          : "text-ink hover:bg-surface-3 hover:text-strong"
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon
                          className={cn(
                            "h-[0.9375rem] w-[0.9375rem] shrink-0",
                            isActive ? "text-brand" : "text-subtle"
                          )}
                          strokeWidth={1.75}
                        />
                        {item.label}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Barra de topo: hora, identidade e os controles do console ──── */}
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface-1 px-6">
          <Relogio />

          <div className="flex items-center gap-1">
            {/* Identidade com avatar, como na referência — e na BARRA DE TOPO,
                não no painel lateral: o painel some abaixo de 1280px, e "quem
                está logado" não pode depender da largura da janela. */}
            <div className="mr-3 hidden items-center gap-2.5 sm:flex">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-brand-muted text-[0.6875rem] font-semibold uppercase text-brand">
                {(user?.email ?? "?").slice(0, 2)}
              </div>
              <div className="min-w-0 leading-tight">
                <p className="text-[0.6875rem] text-subtle">Olá,</p>
                <p className="max-w-[13rem] truncate text-[0.8125rem] font-medium text-strong" title={user?.email ?? ""}>
                  {(user?.email ?? "").split("@")[0]}
                </p>
              </div>
            </div>
            {/* Some junto com o painel: abaixo de 1280px não há o que alternar,
                e um botão marcado como ativo sem efeito visível é pior que a
                ausência dele. */}
            <BotaoIcone
              onClick={alternarRail}
              ativo={railAberto}
              className="hidden xl:flex"
              title={railAberto ? "Ocultar painel lateral" : "Mostrar painel lateral"}
            >
              <PanelRight />
            </BotaoIcone>
            <BotaoIcone
              onClick={toggle}
              title={theme === "tinta" ? "Mudar para papel (claro)" : "Mudar para tinta (escuro)"}
            >
              {theme === "tinta" ? <Sun /> : <Moon />}
            </BotaoIcone>
            <button
              onClick={handleSignOut}
              title="Sair"
              aria-label="Sair"
              className="flex h-7 w-7 items-center justify-center rounded-md text-subtle transition-colors duration-ds ease-ds hover:bg-surface-3 hover:text-danger"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* ── Bloco 2: a tela ─────────────────────────────────────────── */}
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[80rem] animate-fade-in px-8 py-7">{children}</div>
          </main>

          {/* ── Bloco 3: painel estático ────────────────────────────────
              Some abaixo de 1280px: nessa largura ele roubaria a coluna das
              tabelas densas (Contas tem 6 colunas) em troca de um resumo. */}
          {railAberto && (
            <aside className="hidden w-[19rem] shrink-0 overflow-y-auto border-l border-line bg-surface-1 px-5 py-6 xl:block">
              <AttentionRail />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
