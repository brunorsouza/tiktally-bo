import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Copy, Pause, Play, Check, Loader2 } from "lucide-react";
import { useCoupons, useCouponMutations, useAffiliates, useMe } from "@/hooks/useBoCoupons";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { boCoupons } from "@/lib/boCoupons";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { CouponStatusBadge, DiscountKindBadge } from "@/components/CouponBadges";
import { CenteredSpinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/formatters";
import {
  discountLabel,
  redeemsLabel,
  PLAN_OPTIONS,
  CYCLE_OPTIONS,
  PLAN_LABELS,
  CYCLE_LABELS,
} from "@/lib/coupons";
import type { Coupon, CouponDiscountKind, CouponInput, CouponStatus } from "@/types";

const STATUS_FILTERS: { value: CouponStatus | ""; label: string }[] = [
  { value: "", label: "Todos os status" },
  { value: "ACTIVE", label: "Ativos" },
  { value: "INACTIVE", label: "Inativos" },
];

const KIND_FILTERS: { value: CouponDiscountKind | ""; label: string }[] = [
  { value: "", label: "Todos os tipos" },
  { value: "PERCENTAGE", label: "Desconto %" },
  { value: "FIXED", label: "Desconto R$" },
  { value: "TRIAL_DAYS", label: "Trial grátis" },
];

export function CouponsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CouponStatus | "">("");
  const [kind, setKind] = useState<CouponDiscountKind | "">("");
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Coupon | null>(null);

  const { data, isLoading, error } = useCoupons({
    status: status || undefined,
    discountKind: kind || undefined,
    search: search || undefined,
  });
  const { update, remove } = useCouponMutations();
  const { data: me } = useMe();
  const isBusiness = me?.role === "business";

  const copyCode = (code: string) => {
    navigator.clipboard?.writeText(code);
    toast.success("Código copiado", code);
  };

  const toggleStatus = (c: Coupon) =>
    update.mutate({ id: c.id, input: { status: c.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" } });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Cupons</h1>
          <p className="text-sm text-muted-foreground">
            {isBusiness
              ? "Cupons dos afiliados da sua carteira. Valem no checkout do TikTally assim que criados."
              : "Cupons de desconto e teste grátis. Criados aqui já valem no checkout/paywall do TikTally."}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Novo cupom
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim());
            }}
            className="relative min-w-[200px] flex-1"
          >
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por código ou descrição…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </form>
          <Select className="w-40" value={kind} onChange={(e) => setKind(e.target.value as CouponDiscountKind | "")}>
            {KIND_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select className="w-40" value={status} onChange={(e) => setStatus(e.target.value as CouponStatus | "")}>
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          {isLoading ? (
            <CenteredSpinner label="Carregando cupons…" />
          ) : error ? (
            <p className="py-8 text-center text-sm text-destructive">{(error as Error).message}</p>
          ) : !data || data.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum cupom encontrado.</p>
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Código</TH>
                  <TH>Tipo</TH>
                  <TH>Desconto</TH>
                  <TH className="text-right">Resgates</TH>
                  <TH>Validade</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Ações</TH>
                </TR>
              </THead>
              <TBody>
                {data.items.map((c) => (
                  <TR key={c.id} className="cursor-pointer" onClick={() => navigate(`/coupons/${c.id}`)}>
                    <TD>
                      <span className="font-mono font-medium">{c.code}</span>
                      {c.description && (
                        <span className="block max-w-[200px] truncate text-xs text-muted-foreground">{c.description}</span>
                      )}
                    </TD>
                    <TD>
                      <DiscountKindBadge kind={c.discount_kind} />
                    </TD>
                    <TD className="tabular-nums">{discountLabel(c.discount_kind, c.discount)}</TD>
                    <TD className="text-right tabular-nums">
                      <span className={c.exhausted ? "text-destructive" : ""}>{redeemsLabel(c)}</span>
                    </TD>
                    <TD className="whitespace-nowrap text-muted-foreground">
                      {c.valid_until ? formatDate(c.valid_until) : "—"}
                    </TD>
                    <TD>
                      <CouponStatusBadge status={c.status} />
                    </TD>
                    <TD onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" title="Copiar código" onClick={() => copyCode(c.code)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={c.status === "ACTIVE" ? "Desativar" : "Ativar"}
                          onClick={() => toggleStatus(c)}
                        >
                          {c.status === "ACTIVE" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>
                          Editar
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleting(c)}>
                          Excluir
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {(creating || editing) && (
        <CouponFormDialog coupon={editing} onClose={() => (editing ? setEditing(null) : setCreating(false))} />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Excluir ${deleting.code}?`}
          confirmLabel="Excluir"
          loading={remove.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() => remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
          description={
            <>
              Se o cupom <strong>já foi resgatado</strong>, ele é <strong>arquivado</strong> em vez de
              excluído: bloqueia novos usos, mas quem já assinou mantém o desconto. Sem resgates, é
              removido de vez.
            </>
          }
        />
      )}
    </div>
  );
}

// ── Form (criar / editar) ──────────────────────────────────────────────────

function CouponFormDialog({ coupon, onClose }: { coupon: Coupon | null; onClose: () => void }) {
  const isEdit = !!coupon;
  const { create, update } = useCouponMutations();

  const [code, setCode] = useState(coupon?.code ?? "");
  const [description, setDescription] = useState(coupon?.description ?? "");
  const [kind, setKind] = useState<CouponDiscountKind>(coupon?.discount_kind ?? "PERCENTAGE");
  // Valor exibido: FIXED em reais (converte p/ centavos ao salvar); demais no valor bruto.
  const [discountInput, setDiscountInput] = useState(
    coupon ? (coupon.discount_kind === "FIXED" ? String(coupon.discount / 100) : String(coupon.discount)) : ""
  );
  const [status, setStatus] = useState<CouponStatus>((coupon?.status as CouponStatus) ?? "ACTIVE");
  const [unlimited, setUnlimited] = useState(coupon ? coupon.max_redeems < 0 : true);
  const [maxRedeems, setMaxRedeems] = useState(coupon && coupon.max_redeems >= 0 ? String(coupon.max_redeems) : "");
  const [validUntil, setValidUntil] = useState(coupon?.valid_until?.slice(0, 10) ?? "");
  const [plans, setPlans] = useState<string[]>(coupon?.applicable_plans ?? []);
  const [cycles, setCycles] = useState<string[]>(coupon?.applicable_cycles ?? []);
  const [affiliateId, setAffiliateId] = useState(coupon?.affiliate_id ?? "");
  const [appliesToRenewals, setAppliesToRenewals] = useState(coupon?.applies_to_renewals ?? true);
  const { data: affData } = useAffiliates();
  const { data: me } = useMe();
  const isBusiness = me?.role === "business";
  const pool = me?.commission_pool_percent ?? 30;
  const percentOptions = me?.coupon_percent_options ?? [10, 15, 20];
  const ownMax = me?.own_coupon_max_percent ?? 10;
  // Sem afiliado o cupom é "da própria conta" → teto menor.
  const maxPercent = affiliateId ? Math.max(...percentOptions) : ownMax;
  const businessPercent = Number(discountInput) || percentOptions[0];

  const [codeCheck, setCodeCheck] = useState<{ checking: boolean; available: boolean | null; reason: string | null }>({
    checking: false,
    available: null,
    reason: null,
  });
  const debounce = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    const norm = code.trim().toUpperCase();
    if (!norm || (isEdit && norm === coupon?.code)) {
      setCodeCheck({ checking: false, available: null, reason: null });
      return;
    }
    setCodeCheck((s) => ({ ...s, checking: true }));
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const res = await boCoupons.checkCode(norm, coupon?.id);
        setCodeCheck({ checking: false, available: res.available, reason: res.reason });
      } catch {
        setCodeCheck({ checking: false, available: null, reason: null });
      }
    }, 400);
    return () => clearTimeout(debounce.current);
  }, [code, isEdit, coupon?.id, coupon?.code]);

  const busy = create.isPending || update.isPending;
  const discountNum = Number(discountInput);
  const discountValid =
    discountInput !== "" &&
    Number.isFinite(discountNum) &&
    (kind === "PERCENTAGE" ? discountNum >= 0 && discountNum <= 100 : discountNum > 0);
  const canSubmit =
    code.trim().length >= 3 &&
    codeCheck.available !== false &&
    // Business: desconto precisa respeitar o teto do tipo de cupom.
    (isBusiness ? businessPercent <= maxPercent : discountValid) &&
    !busy;

  const toggle = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const submit = () => {
    const discount = isBusiness
      ? businessPercent
      : kind === "FIXED"
        ? Math.round(discountNum * 100)
        : Math.round(discountNum);
    const input: CouponInput = {
      code: code.trim().toUpperCase(),
      description: description || null,
      discount_kind: kind,
      discount,
      status,
      max_redeems: unlimited ? -1 : Number(maxRedeems) || 0,
      valid_until: validUntil ? new Date(validUntil + "T23:59:59").toISOString() : null,
      applicable_plans: plans.length ? plans : null,
      applicable_cycles: cycles.length ? cycles : null,
      affiliate_id: affiliateId || null,
      applies_to_renewals: appliesToRenewals,
    };
    if (isEdit) update.mutate({ id: coupon!.id, input }, { onSuccess: onClose });
    else create.mutate(input, { onSuccess: onClose });
  };

  const discountUnit = kind === "PERCENTAGE" ? "%" : kind === "FIXED" ? "R$" : "dias";

  return (
    <Dialog open onClose={onClose} title={isEdit ? `Editar ${coupon?.code}` : "Novo cupom"}>
      <div className="space-y-4">
        <Field label="Código">
          <div className="relative">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="BLACK30"
              className="font-mono uppercase"
              autoFocus={!isEdit}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {codeCheck.checking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {!codeCheck.checking && codeCheck.available === true && <Check className="h-4 w-4 text-success" />}
            </div>
          </div>
          {codeCheck.reason && <p className="mt-1 text-xs text-destructive">{codeCheck.reason}</p>}
        </Field>

        <Field label="Descrição (interna)">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: 30% off Black Friday" />
        </Field>

        {isBusiness ? (
          <div className="space-y-2 rounded-md border border-border p-3">
            <Field label="Desconto do cupom">
              <Select value={String(businessPercent)} onChange={(e) => setDiscountInput(e.target.value)}>
                {percentOptions.map((pct) => (
                  <option key={pct} value={pct} disabled={pct > maxPercent}>
                    {pct}%{pct > maxPercent ? " — requer afiliado" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
              <p>
                Comissão gerada: <strong className="text-foreground">{Math.max(0, pool - businessPercent)}%</strong> do
                valor pago pelo cliente{" "}
                <span className="opacity-70">
                  ({pool}% de gestão − {businessPercent}% de desconto)
                </span>
                .
              </p>
              <p className="mt-1">
                {affiliateId
                  ? "Cupom de afiliado da carteira — até " + Math.max(...percentOptions) + "%."
                  : `Cupom da sua conta — até ${ownMax}%. Vincule um afiliado para liberar descontos maiores.`}
              </p>
              <p className="mt-1 opacity-70">Vale só na 1ª cobrança; renovação é a preço cheio.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo de desconto">
                <Select value={kind} onChange={(e) => setKind(e.target.value as CouponDiscountKind)}>
                  <option value="PERCENTAGE">Desconto %</option>
                  <option value="FIXED">Desconto fixo (R$)</option>
                  <option value="TRIAL_DAYS">Teste grátis (dias)</option>
                </Select>
              </Field>
              <Field label={`Valor (${discountUnit})`}>
                <Input
                  type="number"
                  min={0}
                  step={kind === "FIXED" ? "0.01" : "1"}
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  placeholder={kind === "PERCENTAGE" ? "30" : kind === "FIXED" ? "150,00" : "7"}
                />
              </Field>
            </div>
            {kind === "TRIAL_DAYS" && (
              <p className="-mt-2 text-xs text-muted-foreground">
                Cupom de teste grátis: resgatado na tela de planos, cria um trial sem cobrança.
              </p>
            )}
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as CouponStatus)}>
              <option value="ACTIVE">Ativo</option>
              <option value="INACTIVE">Inativo</option>
            </Select>
          </Field>
          <Field label="Validade (expira em)">
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </Field>
        </div>

        <div className="rounded-md border border-border p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} />
            Resgates ilimitados
          </label>
          {!unlimited && (
            <div className="mt-3">
              <Field label="Limite de resgates">
                <Input type="number" min={0} value={maxRedeems} onChange={(e) => setMaxRedeems(e.target.value)} placeholder="200" />
              </Field>
            </div>
          )}
        </div>

        <div className={`grid grid-cols-2 gap-3 ${isBusiness ? "hidden" : ""}`}>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Planos (vazio = todos)</p>
            <div className="flex flex-wrap gap-2">
              {PLAN_OPTIONS.map((p) => (
                <Chip key={p} active={plans.includes(p)} onClick={() => toggle(plans, p, setPlans)}>
                  {PLAN_LABELS[p]}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Ciclos (vazio = todos)</p>
            <div className="flex flex-wrap gap-2">
              {CYCLE_OPTIONS.map((c) => (
                <Chip key={c} active={cycles.includes(c)} onClick={() => toggle(cycles, c, setCycles)}>
                  {CYCLE_LABELS[c]}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-md border border-border p-3">
          <Field label={isBusiness ? "Afiliado da carteira (opcional)" : "Afiliado (dono do cupom)"}>
            <Select value={affiliateId} onChange={(e) => setAffiliateId(e.target.value)} disabled={isBusiness && isEdit}>
              <option value="">
                {isBusiness ? "— Sem afiliado (cupom da minha conta)" : "— Sem afiliado (cupom da casa)"}
              </option>
              {(affData?.items ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {!isBusiness && a.business_name ? ` · ${a.business_name}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">
            O desconto vale na <strong>1ª cobrança</strong>. A renovação é sempre a preço cheio — e
            só o primeiro pagamento gera comissão.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={busy} disabled={!canSubmit}>
            {isEdit ? "Salvar" : "Criar cupom"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
