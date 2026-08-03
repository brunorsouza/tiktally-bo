import { useState } from "react";
import { Pencil } from "lucide-react";
import { usePricing, usePricingMutations } from "@/hooks/useBoCoupons";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { CenteredSpinner } from "@/components/ui/spinner";
import { formatCurrency } from "@/lib/formatters";
import { PLAN_LABELS, CYCLE_LABELS } from "@/lib/coupons";
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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Planos &amp; Preços</h1>
        <p className="text-sm text-muted-foreground">
          Fonte única de preço do checkout (<span className="font-mono">GET /pricing</span>). Alterações valem para
          novas assinaturas e ficam registradas em auditoria.
        </p>
      </div>

      {isLoading ? (
        <CenteredSpinner label="Carregando planos e preços…" />
      ) : error ? (
        <p className="py-8 text-center text-sm text-destructive">{(error as Error).message}</p>
      ) : data ? (
        <>
          <SettingsCard settings={data.settings} />

          <Card>
            <CardContent className="pt-5">
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Plano</TH>
                    <TH>Ciclo</TH>
                    <TH className="text-right">Parcelas</TH>
                    <TH className="text-right">Parcela (cartão)</TH>
                    <TH className="text-right">Total do ciclo</TH>
                    <TH className="text-right">Ações</TH>
                  </TR>
                </THead>
                <TBody>
                  {sortedPrices.map((pr) => (
                    <TR key={pr.id}>
                      <TD className="font-medium">{planLabel(pr.plan_id)}</TD>
                      <TD>{CYCLE_LABELS[pr.cycle] ?? pr.cycle}</TD>
                      <TD className="text-right tabular-nums">{pr.installments}×</TD>
                      <TD className="text-right tabular-nums">{formatCurrency(pr.installment_amount_cents / 100)}</TD>
                      <TD className="text-right tabular-nums">{formatCurrency(pr.total_amount_cents / 100)}</TD>
                      <TD className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(pr)}>
                          <Pencil className="h-4 w-4" /> Editar
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
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

function SettingsCard({ settings }: { settings: Setting[] }) {
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
    <Card>
      <CardContent className="space-y-4 pt-5">
        <p className="text-sm font-medium">Regras de desconto e comissão</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SettingField label="Desconto cupom (%)">
            <Input type="number" min={0} max={100} value={coupon} onChange={(e) => setCoupon(e.target.value)} />
          </SettingField>
          <SettingField label="Desconto PIX (%)">
            <Input type="number" min={0} max={100} value={pix} onChange={(e) => setPix(e.target.value)} />
          </SettingField>
          <SettingField label="Carência comissão (dias)">
            <Input type="number" min={0} value={hold} onChange={(e) => setHold(e.target.value)} />
          </SettingField>
          <SettingField label="Empilhamento">
            <Select value={stacking} onChange={(e) => setStacking(e.target.value)}>
              <option value="multiplicative">Multiplicativo (×0,80×0,95)</option>
              <option value="additive">Aditivo</option>
            </Select>
          </SettingField>
        </div>
        <div className="flex justify-end">
          <Button onClick={save} loading={updateSetting.isPending}>
            Salvar regras
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SettingField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
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
    <Dialog open onClose={onClose} title={`Preço — ${planLabel} ${cycleLabel}`}>
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          {price.installments}× no cartão · o total é a base do PIX à vista. Valores em reais.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <SettingField label="Parcela (R$)">
            <Input type="number" min={0} step="0.01" value={installment} onChange={(e) => setInstallment(e.target.value)} />
          </SettingField>
          <SettingField label="Total do ciclo (R$)">
            <Input type="number" min={0} step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} />
          </SettingField>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={updatePrice.isPending}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={updatePrice.isPending}>
            Salvar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
