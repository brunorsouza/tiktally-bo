import { Link } from "react-router-dom";
import { AlertCircle, Clock, FlaskConical, Coins } from "lucide-react";
import { useMetrics } from "@/hooks/useBoFiscal";
import { useCommissions, useMe } from "@/hooks/useBoCoupons";
import { Money, Skeleton } from "@/components/ds";
import { formatRelative } from "@/lib/formatters";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * Painel lateral estático — "Precisa de você"
 * ============================================================================
 * O bloco da direita do padrão de back-office: fica NO LUGAR enquanto o centro
 * troca de tela. "The side panels remain static, enabling access to
 * notifications, current tasks and schedule."
 *
 * A pergunta que ele responde é a que o operador faz o dia inteiro e que hoje
 * exigia abrir o Dashboard pra descobrir: *o que está me esperando?* Deixar
 * isso a um clique de distância de qualquer tela é a diferença entre um console
 * de consulta e um console de trabalho.
 *
 * Cada contador é um LINK pra lista já filtrada — o número não informa, ele
 * leva ao trabalho. Contador que não navega só obriga a pessoa a refazer o
 * filtro na mão.
 *
 * O conteúdo é por PAPEL, e não por gosto: `metrics` é endpoint de admin e
 * responderia 403 no painel de um afiliado. Cada papel puxa só o que o gateway
 * deixa ele ver.
 */

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="t-overline mb-2.5">{titulo}</p>
      {children}
    </div>
  );
}

/** Contador que leva pro trabalho. Zero fica apagado, não some: a ausência de
 *  pendência é informação — some com a linha e o operador não sabe se está
 *  limpo ou se a tela não carregou. */
function Contador({
  to,
  icon,
  label,
  value,
  tone = "neutral",
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: "neutral" | "danger" | "warning" | "brand";
}) {
  const zerado = value === 0;
  const cor = zerado
    ? "text-subtle"
    : { neutral: "text-strong", danger: "text-danger", warning: "text-warning", brand: "text-brand" }[tone];

  return (
    <Link
      to={to}
      className={cn(
        "-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5",
        "transition-colors duration-ds ease-ds hover:bg-surface-3"
      )}
    >
      <span className={cn("shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5", zerado ? "text-subtle" : cor)}>{icon}</span>
      <span className={cn("tabular w-8 shrink-0 text-[0.9375rem] font-medium leading-none", cor)}>{value}</span>
      <span className="min-w-0 flex-1 text-[0.75rem] leading-snug text-ink">{label}</span>
    </Link>
  );
}

function RailAdmin() {
  const { data, isLoading } = useMetrics();

  if (isLoading)
    return (
      <div className="space-y-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7" />
        ))}
      </div>
    );
  if (!data) return null;

  const travadas = data.by_status.pending + data.by_status.processing;

  return (
    <div className="space-y-7">
      <Secao titulo="Precisa de você">
        <div className="space-y-0.5">
          <Contador
            to="/invoices?status=rejected"
            icon={<AlertCircle />}
            value={data.by_status.rejected}
            label="notas rejeitadas pela SEFAZ"
            tone="danger"
          />
          <Contador
            to="/invoices?status=processing"
            icon={<Clock />}
            value={travadas}
            label="aguardando retorno"
            tone="warning"
          />
          <Contador
            to="/accounts"
            icon={<FlaskConical />}
            value={data.sellers_sandbox}
            label="contas em homologação"
            tone="warning"
          />
        </div>
      </Secao>

      {data.recent_rejections.length > 0 && (
        <Secao titulo="Últimas rejeições">
          <div className="-mx-2">
            {data.recent_rejections.slice(0, 5).map((r) => (
              <Link
                key={r.id}
                to={`/invoices/${r.id}`}
                className="block rounded-md border-b border-line/70 px-2 py-2 transition-colors duration-ds ease-ds last:border-0 hover:bg-surface-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[0.75rem] font-medium text-strong">
                    {r.shop_name || r.emitter_name || "Seller"}
                  </span>
                  <span className="t-caption shrink-0 tabular text-[0.6875rem]">
                    {formatRelative(r.created_at)}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[0.6875rem] leading-relaxed text-danger">
                  {r.error_message || "Rejeitada pela SEFAZ"}
                </p>
              </Link>
            ))}
          </div>
        </Secao>
      )}
    </div>
  );
}

function RailCarteira({ afiliado }: { afiliado: boolean }) {
  const { data, isLoading } = useCommissions();

  if (isLoading)
    return (
      <div className="space-y-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-7" />
        ))}
      </div>
    );

  const itens = data?.items ?? [];
  const aReceber = itens
    .filter((c) => c.status === "pending" || c.status === "approved")
    .reduce((a, c) => a + c.amount_cents, 0);
  const aprovadas = itens.filter((c) => c.status === "approved").length;
  const destino = afiliado ? "/affiliate" : "/business";

  return (
    <div className="space-y-7">
      <Secao titulo={afiliado ? "Seu programa" : "Sua carteira"}>
        <div className="space-y-0.5">
          <Contador
            to={destino}
            icon={<Coins />}
            value={<Money cents={aReceber} />}
            label="a receber"
            tone="brand"
          />
          <Contador
            to={destino}
            icon={<Clock />}
            value={aprovadas}
            label="comissões aprovadas, aguardando pagamento"
            tone="warning"
          />
        </div>
      </Secao>
    </div>
  );
}

export function AttentionRail() {
  const { data: me } = useMe();
  if (!me) return null;
  if (me.role === "admin") return <RailAdmin />;
  return <RailCarteira afiliado={me.role === "affiliate"} />;
}
