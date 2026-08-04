#!/usr/bin/env node
// ============================================================================
// E2E da COMISSÃO — simula o webhook de pagamento, sem gastar nada.
// ============================================================================
//
//   export SUPABASE_URL="https://zgkxtyewmbkupuzeoyya.supabase.co"
//   export SUPABASE_SERVICE_ROLE_KEY="..."   # nunca commitar
//   export ASAAS_WEBHOOK_TOKEN="..."         # mesmo secret que a Asaas usa
//   node scripts/e2e-commission-webhook.mjs
//
//   --keep      não limpa no fim (pra inspecionar as linhas criadas)
//   --cleanup   só apaga sobras de uma execução anterior
//
// POR QUE SIMULAR O WEBHOOK
//
// O que nunca rodou em produção é a NOSSA lógica (resgate + comissão + janela
// + estorno), não o processamento da Asaas — esse já rodou de verdade dezenas
// de vezes. Entrando direto no webhook a gente exercita exatamente o que falta,
// com custo ZERO: nenhuma cobrança é criada, nenhuma chamada vai pra Asaas.
//
// ⚠️ GRAVA EM PRODUÇÃO. Tudo que este script cria é marcado com `E2E_TESTE`
// (ou o e-mail e2e-comprador@teste.local) e apagado no fim — inclusive o
// usuário de teste, a assinatura que o webhook ativar e o billing.
// ============================================================================

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HOOK = process.env.ASAAS_WEBHOOK_TOKEN;
/**
 * Onde está o webhook. Por padrão, o deployado.
 *
 * Dica: dá pra rodar a function LOCALMENTE e evitar precisar do token de
 * produção — você escolhe o token na hora:
 *
 *   cd tiktok-shop-tally
 *   ASAAS_ENV=sandbox ASAAS_WEBHOOK_TOKEN_SANDBOX=meu-token \
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx deno@2 run --allow-net --allow-env \
 *     supabase/functions/asaas-webhook-receiver/index.ts
 *
 *   # noutro terminal:
 *   WEBHOOK_URL=http://localhost:8000 ASAAS_WEBHOOK_TOKEN=meu-token \
 *   node scripts/e2e-commission-webhook.mjs
 *
 * O código é o mesmo do deploy; só o processo é local. Nenhuma chamada vai
 * pra Asaas neste fluxo.
 */
const WEBHOOK_URL = process.env.WEBHOOK_URL
  ? `${process.env.WEBHOOK_URL.replace(/\/$/, '')}`
  : `${URL}/functions/v1/asaas-webhook-receiver`;

if (!URL || !KEY) {
  console.error('✖ Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const args = process.argv.slice(2);
const KEEP = args.includes('--keep');
const ONLY_CLEANUP = args.includes('--cleanup');
if (!HOOK && !ONLY_CLEANUP) {
  console.error('✖ Falta ASAAS_WEBHOOK_TOKEN (o webhook recusa sem ele).');
  process.exit(1);
}

const db = createClient(URL, KEY);
const TAG = 'E2E_TESTE';
const BUYER = 'e2e-comprador@teste.local';

let pass = 0, fail = 0;
const ok = (label, cond, detail = '') => {
  console.log(`${cond ? '  ✔' : '  ✖'} ${label}${cond ? '' : `\n      ${detail}`}`);
  cond ? pass++ : fail++;
  return cond;
};
const eq = (label, actual, expected) =>
  ok(label, JSON.stringify(actual) === JSON.stringify(expected), `esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`);

const brl = (c) => `R$ ${(c / 100).toFixed(2)}`;

async function buyerId() {
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data?.users?.find((u) => u.email === BUYER)?.id ?? null;
}

async function cleanup() {
  const uid = await buyerId();
  if (uid) {
    const { data: bills } = await db.from('billings').select('id').eq('user_id', uid);
    const billIds = (bills ?? []).map((b) => b.id);
    if (billIds.length) {
      const { data: reds } = await db.from('coupon_redemptions').select('id').in('billing_id', billIds);
      const redIds = (reds ?? []).map((r) => r.id);
      if (redIds.length) await db.from('commissions').delete().in('redemption_id', redIds);
      await db.from('coupon_redemptions').delete().in('billing_id', billIds);
    }
    await db.from('coupon_redemptions').delete().eq('user_id', uid);
    await db.from('billings').delete().eq('user_id', uid);
    await db.from('subscriptions').delete().eq('user_id', uid);
    await db.auth.admin.deleteUser(uid).catch(() => {});
  }
  const { data: affs } = await db.from('affiliates').select('id').like('name', `${TAG}%`);
  const affIds = (affs ?? []).map((a) => a.id);
  if (affIds.length) {
    const { data: reds } = await db.from('coupon_redemptions').select('id').in('affiliate_id', affIds);
    const redIds = (reds ?? []).map((r) => r.id);
    if (redIds.length) await db.from('commissions').delete().in('redemption_id', redIds);
    await db.from('coupon_redemptions').delete().in('affiliate_id', affIds);
  }
  await db.from('coupons').delete().like('code', `${TAG}%`);
  if (affIds.length) await db.from('affiliates').delete().in('id', affIds);
  await db.from('businesses').delete().like('name', `${TAG}%`);
  console.log('🧹 limpeza concluída');
}

/** Dispara um evento no webhook, como a Asaas faria. */
async function fireWebhook(event, payment) {
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'asaas-access-token': HOOK },
    body: JSON.stringify({ id: `evt_${TAG}_${Date.now()}_${Math.random().toString(36).slice(2)}`, event, payment }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function main() {
  console.log(`\n🔗 ${URL}\n`);
  if (ONLY_CLEANUP) return cleanup();
  await cleanup();

  // ── Regras vigentes (do banco) ───────────────────────────────────────────
  const { data: setts } = await db.from('settings').select('key, value');
  const S = Object.fromEntries((setts ?? []).map((s) => [s.key, s.value]));
  const pool = Number(S.commission_pool_percent ?? 30);
  const hold = Number(S.commission_hold_days ?? 7);
  const DISCOUNT = 15;
  const commissionPct = pool - DISCOUNT;
  console.log(`⚙️  pool ${pool}% · cupom de teste ${DISCOUNT}% ⇒ comissão ${commissionPct}% · carência ${hold}d\n`);

  // ── Cenário ──────────────────────────────────────────────────────────────
  console.log('1) Montando cenário');
  const { data: biz } = await db.from('businesses')
    .insert({ name: `${TAG} Agência`, status: 'active' }).select('id').single();
  const { data: aff } = await db.from('affiliates')
    .insert({ name: `${TAG} Afiliado`, business_id: biz.id, status: 'active',
              default_commission_type: 'percent', default_commission_value: 0 })
    .select('id').single();
  const { data: coupon } = await db.from('coupons')
    .insert({ code: `${TAG}15`, discount_kind: 'PERCENTAGE', discount: DISCOUNT, status: 'ACTIVE',
              max_redeems: -1, affiliate_id: aff.id, business_id: biz.id, applies_to_renewals: true })
    .select('id, code').single();

  const { data: created, error: uErr } = await db.auth.admin.createUser({
    email: BUYER, password: `E2E-${Math.random().toString(36).slice(2)}-x9`, email_confirm: true,
  });
  if (uErr) throw new Error(`falha ao criar comprador: ${uErr.message}`);
  const uid = created.user.id;

  // Preço real da tabela (Pro anual)
  const { data: plan } = await db.from('plans').select('id').eq('key', 'pro').maybeSingle();
  const { data: price } = await db.from('prices')
    .select('total_amount_cents').eq('plan_id', plan.id).eq('cycle', 'yearly').eq('active', true).maybeSingle();
  const gross = price.total_amount_cents;
  const discountCents = Math.round((gross * DISCOUNT) / 100);
  const net = gross - discountCents;
  console.log(`   Pro anual ${brl(gross)} − cupom ${DISCOUNT}% (${brl(discountCents)}) = ${brl(net)}\n`);

  // Billing pendente, igual ao que o checkout cria
  const extId = `${TAG}_${Date.now()}`;
  const payId = `pay_${TAG}_${Date.now()}`;
  const { data: billing } = await db.from('billings').insert({
    user_id: uid, plan: 'pro', cycle: 'yearly',
    amount_cents: net, original_amount_cents: gross, discount_cents: discountCents,
    coupon_code: coupon.code, status: 'pending', gateway: 'asaas',
    gateway_payment_id: payId, external_id: extId,
    metadata: { method: 'CARD', kind: 'purchase', coupon_id: coupon.id, coupon_discount_cents: discountCents },
  }).select('id').single();

  // ── 2. Pagamento confirmado ──────────────────────────────────────────────
  console.log('2) Webhook: PAYMENT_RECEIVED');
  const paidAt = new Date().toISOString().slice(0, 10);
  const r1 = await fireWebhook('PAYMENT_RECEIVED', {
    id: payId, customer: 'cus_e2e', value: net / 100, billingType: 'CREDIT_CARD',
    status: 'RECEIVED', dueDate: paidAt, paymentDate: paidAt, externalReference: extId,
  });
  ok('webhook aceitou', r1.status === 200 && r1.body?.success === true, JSON.stringify(r1.body));

  const { data: bill2 } = await db.from('billings').select('status, paid_at').eq('id', billing.id).maybeSingle();
  eq('billing virou paid', bill2?.status, 'paid');

  const { data: red } = await db.from('coupon_redemptions')
    .select('*').eq('billing_id', billing.id).maybeSingle();
  ok('resgate foi gravado', !!red);
  if (red) {
    eq('snapshot: afiliado', red.affiliate_id, aff.id);
    eq('snapshot: business', red.business_id, biz.id);
    eq('snapshot: plano/ciclo', [red.plan_key, red.cycle], ['pro', 'yearly']);
    eq('snapshot: bruto', red.gross_amount_cents, gross);
    eq('snapshot: líquido (pago)', red.net_amount_cents, net);
    eq('snapshot: % aplicado', Number(red.discount_percent_applied), DISCOUNT);
    eq('status do resgate', red.status, 'active');
  }

  console.log('\n3) Comissão');
  const { data: com } = red
    ? await db.from('commissions').select('*').eq('redemption_id', red.id).maybeSingle()
    : { data: null };
  ok('comissão foi criada', !!com);
  if (com) {
    const esperado = Math.round((net * commissionPct) / 100);
    eq(`valor = ${commissionPct}% do PAGO (${brl(esperado)})`, com.amount_cents, esperado);
    ok(`NÃO é ${commissionPct}% do tabela (${brl(Math.round((gross * commissionPct) / 100))})`,
       com.amount_cents !== Math.round((gross * commissionPct) / 100));
    eq('snapshot da regra', Number(com.commission_value), commissionPct);
    eq('nasce pending', com.status, 'pending');
    eq('destinatário: afiliado', com.affiliate_id, aff.id);

    const dias = (new Date(com.eligible_at) - new Date(bill2.paid_at)) / 864e5;
    ok(`elegível em ${hold} dias a partir do pagamento (obtido ${dias.toFixed(1)}d)`, Math.abs(dias - hold) < 0.05);
    ok('ainda NÃO elegível hoje', new Date(com.eligible_at) > new Date());
  }

  // ── 4. Idempotência: o mesmo evento de novo ──────────────────────────────
  console.log('\n4) Idempotência (webhook repetido)');
  await fireWebhook('PAYMENT_RECEIVED', {
    id: payId, customer: 'cus_e2e', value: net / 100, billingType: 'CREDIT_CARD',
    status: 'RECEIVED', dueDate: paidAt, paymentDate: paidAt, externalReference: extId,
  });
  const { count: nReds } = await db.from('coupon_redemptions')
    .select('*', { count: 'exact', head: true }).eq('billing_id', billing.id);
  eq('continua com 1 resgate', nReds, 1);
  const { count: nComs } = red
    ? await db.from('commissions').select('*', { count: 'exact', head: true }).eq('redemption_id', red.id)
    : { count: 0 };
  eq('continua com 1 comissão', nComs, 1);

  // ── 5. Reembolso ─────────────────────────────────────────────────────────
  console.log('\n5) Webhook: PAYMENT_REFUNDED');
  const r2 = await fireWebhook('PAYMENT_REFUNDED', {
    id: payId, customer: 'cus_e2e', value: net / 100, billingType: 'CREDIT_CARD',
    status: 'REFUNDED', dueDate: paidAt, externalReference: extId,
  });
  ok('webhook aceitou', r2.status === 200);

  const { data: red2 } = await db.from('coupon_redemptions').select('status').eq('billing_id', billing.id).maybeSingle();
  eq('resgate virou refunded', red2?.status, 'refunded');
  const { data: com2 } = red
    ? await db.from('commissions').select('status, notes').eq('redemption_id', red.id).maybeSingle()
    : { data: null };
  eq('comissão foi cancelada', com2?.status, 'cancelled');
  ok('motivo registrado', !!com2?.notes, '(sem nota do estorno)');

  // ── 6. Unicidade vitalícia ───────────────────────────────────────────────
  console.log('\n6) Unicidade vitalícia (1 cupom de parceiro por cliente)');
  const { error: dupErr } = await db.from('coupon_redemptions').insert({
    coupon_id: coupon.id, user_id: uid, discount_cents: 1, affiliate_id: aff.id,
  });
  ok('2º resgate de parceiro é recusado pelo banco', !!dupErr, '(aceitou um segundo!)');

  if (!KEEP) { console.log(''); await cleanup(); }
  else console.log(`\n⚠️  --keep: dados MANTIDOS. Rode com --cleanup pra apagar.`);

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passou · ${fail} falhou\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('\n✖ erro:', e.message);
  await cleanup().catch(() => {});
  process.exit(1);
});
