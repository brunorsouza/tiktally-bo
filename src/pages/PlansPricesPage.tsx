import { useState } from "react";
import { Pencil } from "lucide-react";
import { usePricing, usePricingMutations } from "@/hooks/useBoCoupons";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PageHeader, Surface, Field, Note, Money, Status, ErrorState, TableSkeleton } from "@/components/ds";
import { DataTable, RowActions, type Column } from "@/components/ds/DataTable";
import { CYCLE_LABELS, PLAN_LABELS, INTERNAL_PLAN_KEYS } from "@/lib/coupons";
import type { Price, Setting } from "@/types";

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
