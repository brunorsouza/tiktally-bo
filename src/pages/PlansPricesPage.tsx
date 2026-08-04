import { useState } from "react";
import { Pencil, FlaskConical } from "lucide-react";
import { usePricing, usePricingMutations } from "@/hooks/useBoCoupons";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PageHeader, Surface, Field, Note, Money, Status, Switch, ErrorState, TableSkeleton } from "@/components/ds";
import { DataTable, RowActions, type Column } from "@/components/ds/DataTable";
import { CYCLE_LABELS, PLAN_LABELS, INTERNAL_PLAN_KEYS } from "@/lib/coupons";
import { cn } from "@/lib/utils";
import type { Price, Setting, TestPlanState } from "@/types";

const CYCLE_ORDER: Record<string, number> = { yearly: 0, semiannually: 1 };

export function PlansPricesPage() {
  const { data, isLoading, error } = usePricing();
  const [editing, setEditing] = useState<Price | null>(null);

  const planFor = (planId: string) => data?.plans.find((p) => p.id === planId);
  const planLabel = (planId: string) => {
    const p = planFor(planId);
    return (p && (PLAN_LABELS[p.key] ?? p.name)) ?? "—";
  };
  const sortedPrices = (data?.prices ?? [])
    .slice()
    .sort(
      (a, b) =>
        (planFor(a.plan_id)?.sort_order ?? 0) - (planFor(b.plan_id)?.sort_order ?? 0) ||
        (CYCLE_ORDER[a.cycle] ?? 9) - (CYCLE_ORDER[b.cycle] ?? 9)
    );

  /** Plano interno (só validação de fluxo) — não é preço de produto. */
  const isInternal = (planId: string) => INTERNAL_PLAN_KEYS.has(planFor(planId)?.key ?? "");

  const colunas: Column<Price>[] = [
    {
      header: "Plano",
      cell: (pr) => (
        <span className="flex items-center gap-2">
          <span className="font-medium text-strong">{planLabel(pr.plan_id)}</span>
          {/* Um R$10 numa tabela de milhares confunde — deixa explícito */}
          {isInternal(pr.plan_id) && <Status tone="warning">interno</Status>}
        </span>
      ),
    },
    { header: "Ciclo", width: "9rem", cell: (pr) => CYCLE_LABELS[pr.cycle] ?? pr.cycle },
    { header: "Parcelas", align: "right", width: "7rem", cell: (pr) => `${pr.installments}×` },
    {
      header: "Parcela (cartão)",
      align: "right",
      width: "10rem",
      cell: (pr) => <Money cents={pr.installment_amount_cents} />,
    },
    {
      header: "Total do ciclo",
      align: "right",
      width: "10rem",
      cell: (pr) => <Money cents={pr.total_amount_cents} className="font-medium text-strong" />,
    },
    {
      header: "",
      align: "right",
      width: "6rem",
      cell: (pr) => (
        <RowActions>
          <Button variant="ghost" size="sm" onClick={() => setEditing(pr)}>
            <Pencil /> Editar
          </Button>
        </RowActions>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Planos & Preços"
        description={
          <>
            Fonte única de preço do checkout (<span className="font-mono text-strong">GET /pricing</span>). Alterações
            valem para novas assinaturas e ficam registradas em auditoria.
          </>
        }
      />

      {isLoading ? (
        <TableSkeleton cols={6} />
      ) : error ? (
        <ErrorState message={(error as Error).message} />
      ) : data ? (
        <>
          <SettingsPanel settings={data.settings} />
          {data.test_plan && <TestPlanPanel state={data.test_plan} />}
          <DataTable rows={sortedPrices} rowKey={(pr) => pr.id} columns={colunas} />
        </>
      ) : null}

      {editing && (
        <PriceDialog price={editing} planLabel={planLabel(editing.plan_id)} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

// ── Settings (percentuais e regras) ─────────────────────────────────────────

function settingNumber(settings: Setting[], key: string, fallback: number): number {
  const v = settings.find((s) => s.key === key)?.value;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function settingString(settings: Setting[], key: string, fallback: string): string {
  const v = settings.find((s) => s.key === key)?.value;
  return typeof v === "string" ? v : fallback;
}

function SettingsPanel({ settings }: { settings: Setting[] }) {
  const { updateSetting } = usePricingMutations();
  const [coupon, setCoupon] = useState(String(settingNumber(settings, "coupon_discount_percent", 20)));
  const [pix, setPix] = useState(String(settingNumber(settings, "pix_discount_percent", 5)));
  const [hold, setHold] = useState(String(settingNumber(settings, "commission_hold_days", 7)));
  const [stacking, setStacking] = useState(settingString(settings, "discount_stacking", "multiplicative"));

  const save = () => {
    updateSetting.mutate({ key: "coupon_discount_percent", value: Number(coupon) });
    updateSetting.mutate({ key: "pix_discount_percent", value: Number(pix) });
    updateSetting.mutate({ key: "commission_hold_days", value: Number(hold) });
    updateSetting.mutate({ key: "discount_stacking", value: stacking });
  };

  return (
    <Surface className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="t-label">Regras de desconto e comissão</p>
        <Button size="sm" onClick={save} loading={updateSetting.isPending}>
          Salvar regras
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Field label="Desconto cupom (%)">
          <Input type="number" min={0} max={100} value={coupon} onChange={(e) => setCoupon(e.target.value)} />
        </Field>
        <Field label="Desconto PIX (%)">
          <Input type="number" min={0} max={100} value={pix} onChange={(e) => setPix(e.target.value)} />
        </Field>
        <Field label="Carência comissão (dias)">
          <Input type="number" min={0} value={hold} onChange={(e) => setHold(e.target.value)} />
        </Field>
        <Field label="Empilhamento">
          <Select value={stacking} onChange={(e) => setStacking(e.target.value)}>
            <option value="multiplicative">Multiplicativo (×0,80×0,95)</option>
            <option value="additive">Aditivo</option>
          </Select>
        </Field>
      </div>

      <Note className="mt-4">
        A carência é a janela de refund: a comissão só fica elegível depois dela. Mexer aqui muda o
        cálculo das próximas comissões, não das já geradas.
      </Note>
    </Surface>
  );
}

// ── Plano de teste (R$10) ───────────────────────────────────────────────────

/**
 * Liga/desliga o plano de teste sem CLI e sem deploy.
 *
 * Salva na hora (não entra no "Salvar regras" em lote): é um interruptor de
 * risco, e um estado que só vale depois de um botão distante é justamente como
 * se deixa algo ligado sem querer.
 *
 * O painel mostra as TRÊS camadas porque operar no escuro é o risco real —
 * desligar aqui e achar que acabou, quando o secret é que estava mandando.
 */
function TestPlanPanel({ state }: { state: TestPlanState }) {
  const { updateSetting } = usePricingMutations();

  const semLista = state.allowed_emails.length === 0;
  // O toggle só manda em quem já passou pelo freio e tem allowlist. Sem isso,
  // ligar não faria nada — e um interruptor que não faz nada é pior que nenhum.
  const inerte = !state.master_enabled || semLista;

  return (
    <Surface
      className={cn(
        "p-4",
        state.effective ? "border-l-2 border-l-warning" : undefined
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="t-label flex items-center gap-2">
            <FlaskConical className="h-3.5 w-3.5" />
            Plano de teste (R$ 10)
          </p>
          <p className="t-caption mt-1 max-w-xl leading-relaxed">
            Cobrança real no Asaas de produção, para validar checkout, webhook, ativação e comissão.
            Libera as features do Pro — por isso só vale para os e-mails autorizados.
          </p>
        </div>
        <Status tone={state.effective ? "warning" : "neutral"}>
          {state.effective ? "Ativo" : "Desativado"}
        </Status>
      </div>

      <div className="mt-4">
        <Switch
          tone="danger"
          checked={state.setting_enabled}
          busy={updateSetting.isPending}
          disabled={inerte}
          onChange={(v) => updateSetting.mutate({ key: "test_plan_enabled", value: v })}
          label={state.setting_enabled ? "Disponível para a allowlist" : "Indisponível"}
          hint="Vale na hora, sem deploy. Fica registrado na auditoria."
        />
      </div>

      <div className="mt-4 space-y-2 border-t border-line pt-3">
        <Camada
          ok={state.master_enabled}
          titulo="Freio de emergência"
          detalhe={
            state.master_enabled
              ? "Secret TEST_PLAN_ENABLED ligado — o toggle acima é quem manda."
              : "Secret TEST_PLAN_ENABLED desligado: o plano está morto, independentemente do toggle."
          }
        />
        <Camada
          ok={!semLista}
          titulo="Quem pode usar"
          detalhe={
            semLista
              ? "Nenhum e-mail autorizado — ninguém consegue usar o plano."
              : state.allowed_emails.join(", ")
          }
        />
      </div>

      <Note className="mt-4">
        Esta tela só <strong className="text-strong">desliga e religa</strong>. Mudar o freio ou{" "}
        <strong className="text-strong">quem pode usar</strong> exige os secrets no Supabase — de
        propósito, para que um acesso ao backoffice não consiga ampliar quem compra Pro por R$ 10.
      </Note>
    </Surface>
  );
}

/** Uma camada da trava: sinal de estado + explicação do que ela controla. */
function Camada({ ok, titulo, detalhe }: { ok: boolean; titulo: string; detalhe: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="w-32 shrink-0">
        <Status tone={ok ? "success" : "neutral"}>{titulo}</Status>
      </span>
      <span className="t-caption min-w-0 break-words">{detalhe}</span>
    </div>
  );
}

// ── Editar preço ────────────────────────────────────────────────────────────

function PriceDialog({ price, planLabel, onClose }: { price: Price; planLabel: string; onClose: () => void }) {
  const { updatePrice } = usePricingMutations();
  const [installment, setInstallment] = useState(String(price.installment_amount_cents / 100));
  const [total, setTotal] = useState(String(price.total_amount_cents / 100));

  const cycleLabel = CYCLE_LABELS[price.cycle] ?? price.cycle;
  const submit = () => {
    updatePrice.mutate(
      {
        id: price.id,
        input: {
          installment_amount_cents: Math.round(Number(installment) * 100),
          total_amount_cents: Math.round(Number(total) * 100),
        },
      },
      { onSuccess: onClose }
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${planLabel} · ${cycleLabel}`}
      description={`${price.installments}× no cartão — o total é a base do PIX à vista. Valores em reais.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={updatePrice.isPending}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={updatePrice.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Parcela (R$)">
          <Input
            type="number"
            min={0}
            step="0.01"
            value={installment}
            onChange={(e) => setInstallment(e.target.value)}
          />
        </Field>
        <Field label="Total do ciclo (R$)">
          <Input type="number" min={0} step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
