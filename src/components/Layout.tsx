import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Store,
  Webhook,
  LogOut,
  Receipt,
  BarChart3,
  Ticket,
  Gift,
  DollarSign,
  Users,
  Building2,
  Coins,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMe } from "@/hooks/useBoCoupons";
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

/** Nav de quem NÃO é admin (business / afiliado): só o próprio escopo. */
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
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { data: me } = useMe();
  const navigate = useNavigate();
  const sections =
    me?.role === "admin" ? adminSections : me?.role === "business" ? businessSections : affiliateSections;

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const papel =
    me?.role === "admin" ? "Administração" : me?.role === "business" ? "Parceiro" : "Afiliado";

  return (
    <div className="flex min-h-screen bg-base">
      <aside className="sticky top-0 flex h-screen w-[15rem] shrink-0 flex-col border-r border-line bg-surface-1">
        {/* Marca: monograma sólido na cor do produto, não um ícone genérico */}
        <div className="flex items-center gap-2.5 px-4 py-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-[0.8125rem] font-bold text-brand-foreground shadow-1">
            T
          </div>
          <div className="min-w-0 leading-tight">
            <p className="text-[0.8125rem] font-semibold text-strong">TikTally</p>
            <p className="t-caption truncate">{papel}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-2">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="t-overline px-2.5 pb-1.5">{section.title}</p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[0.8125rem]",
                        "transition-colors duration-ds ease-ds",
                        isActive
                          ? "bg-surface-3 font-medium text-strong"
                          : "text-subtle hover:bg-surface-2 hover:text-strong"
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {/* Marcador na marca: indica o ativo sem pintar o item inteiro */}
                        <span
                          className={cn(
                            "absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r bg-brand transition-opacity duration-ds",
                            isActive ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <item.icon
                          className={cn("h-4 w-4 shrink-0", isActive ? "text-brand-strong" : "text-subtle")}
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

        <div className="border-t border-line p-2">
          <div className="flex items-center gap-2 rounded-md px-2.5 py-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[0.625rem] font-semibold uppercase text-subtle">
              {(user?.email ?? "?").slice(0, 2)}
            </div>
            <p className="t-caption min-w-0 flex-1 truncate" title={user?.email ?? ""}>
              {user?.email}
            </p>
            <button
              onClick={handleSignOut}
              title="Sair"
              aria-label="Sair"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-subtle transition-colors duration-ds ease-ds hover:bg-surface-3 hover:text-danger"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[80rem] animate-fade-in px-7 py-6">{children}</div>
      </main>
    </div>
  );
}
