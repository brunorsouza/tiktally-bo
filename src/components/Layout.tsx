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

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card/40">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <Receipt className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-semibold leading-tight">TikTally</p>
            <p className="text-xs text-muted-foreground">Backoffice</p>
          </div>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {sections.map((section) => (
            <div key={section.title} className="space-y-1">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {section.title}
              </p>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <p className="truncate px-2 pb-2 text-xs text-muted-foreground" title={user?.email ?? ""}>
            {user?.email}
          </p>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-7xl px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
