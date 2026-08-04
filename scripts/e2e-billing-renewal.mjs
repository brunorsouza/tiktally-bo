#!/usr/bin/env node
// ============================================================================
// E2E do fluxo BASE de cobrança e renovação (sem cupom). Custo zero.
// ============================================================================
//
//   # 1) sobe o webhook local (noutro terminal), com um token que VOCÊ escolhe:
//   cd tiktok-shop-tally
//   ASAAS_ENV=sandbox ASAAS_WEBHOOK_TOKEN_SANDBOX=e2e-token-local \
//   ASAAS_API_KEY_SANDBOX=x SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   npx deno@2 run --allow-net --allow-env \
//     supabase/functions/asaas-webhook-receiver/index.ts
//
//   # 2) roda o teste
//   WEBHOOK_URL=http://localhost:8000 ASAAS_WEBHOOK_TOKEN=e2e-token-local \
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/e2e-billing-renewal.mjs
//
//   --keep / --cleanup  como nos outros scripts
//
// COBRE (via webhook local — código real, nenhuma chamada à Asaas):
//   1. Renovação recorrente (cartão à vista): cobrança da Asaas estende o
//      período A PARTIR DO FIM ANTIGO, não de hoje — quem paga adiantado não
//      perde dias.
//   2. Cobrança em atraso: marca past_due sem cortar o acesso na hora.
//   3. Pagamento sobre billing já reembolsado NÃO reativa a assinatura.
//   4. Expiração após a carência de 3 dias (chama expire_overdue_subscriptions).
//   5. Seleção dos crons de lembrete e de renovação parcelada — replicando a
//      MESMA query, já que invocá-los exige o cron_secret do Vault.
//
// NÃO COBRE (precisa do cron_secret e/ou de Asaas sandbox):
//   - o envio real do e-mail de lembrete
//   - a cobrança de fato no cron de parcelado (chama a Asaas)
// ============================================================================

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HOOK = process.env.ASAAS_WEBHOOK_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL
  ? process.env.WEBHOOK_URL.replace(/\/$/, '')
  : `${URL}/functions/v1/asaas-webhook-receiver`;

if (!URL || !KEY) { console.error('✖ Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const args = process.argv.slice(2);
const KEEP = args.includes('--keep');
const ONLY_CLEANUP = args.includes('--cleanup');
if (!HOOK && !ONLY_CLEANUP) { console.error('✖ Falta ASAAS_WEBHOOK_TOKEN.'); process.exit(1); }

const db = createClient(URL, KEY);
const TAG = 'E2E_BASE';
const BUYER = 'e2e-renovacao@teste.local';
const DAY = 864e5;

let pass = 0, fail = 0;
const ok = (label, cond, detail = '') => {
  console.log(`${cond ? '  ✔' : '  ✖'} ${label}${cond ? '' : `\n      ${detail}`}`);
  cond ? pass++ : fail++; return cond;
};
const eq = (label, a, b) => ok(label, JSON.stringify(a) === JSON.stringify(b), `esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`);
const dias = (a, b) => Math.round((new Date(a) - new Date(b)) / DAY);

async function buyerId() {
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data?.users?.find((u) => u.email === BUYER)?.id ?? null;
}

async function cleanup() {
  const uid = await buyerId();
  if (uid) {
    await db.from('billings').delete().eq('user_id', uid);
    await db.from('subscriptions').delete().eq('user_id', uid);
    await db.auth.admin.deleteUser(uid).catch(() => {});
  }
  await db.from('billings').delete().like('external_id', `${TAG}%`);
  console.log('🧹 limpeza concluída');
}

async function fire(event, payment) {
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'asaas-access-token': HOOK },
    body: JSON.stringify({ id: `evt_${TAG}_${Date.now()}_${Math.random().toString(36).slice(2)}`, event, payment }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function main() {
  console.log(`\n🔗 ${URL}\n   webhook: ${WEBHOOK_URL}\n`);
  if (ONLY_CLEANUP) return cleanup();
  await cleanup();

  const { data: created, error: uErr } = await db.auth.admin.createUser({
    email: BUYER, password: `E2E-${Math.random().toString(36).slice(2)}-x9`, email_confirm: true,
  });
  if (uErr) throw new Error(`falha ao criar usuário: ${uErr.message}`);
  const uid = created.user.id;

  const { data: plan } = await db.from('plans').select('id').eq('key', 'pro').maybeSingle();
  const { data: price } = await db.from('prices')
    .select('total_amount_cents').eq('plan_id', plan.id).eq('cycle', 'semiannually').eq('active', true).maybeSingle();
  const valor = price.total_amount_cents;

  // ── 1. RENOVAÇÃO RECORRENTE (cartão à vista) ────────────────────────────
  console.log('1) Renovação recorrente — cobrança automática da Asaas');
  const asaasSubId = `sub_${TAG}_${Date.now()}`;
  const fimAtual = new Date(Date.now() + 5 * DAY); // vence em 5 dias (pagou adiantado)
  await db.from('subscriptions').upsert({
    user_id: uid, plan: 'pro', cycle: 'semiannually', status: 'active', gateway: 'asaas',
    gateway_subscription_id: asaasSubId,
    current_period_start: new Date(Date.now() - 175 * DAY).toISOString(),
    current_period_end: fimAtual.toISOString(),
  }, { onConflict: 'user_id' });

  const hoje = new Date().toISOString().slice(0, 10);
  const r1 = await fire('PAYMENT_RECEIVED', {
    id: `pay_${TAG}_rec_${Date.now()}`, customer: 'cus_e2e', subscription: asaasSubId,
    value: valor / 100, billingType: 'CREDIT_CARD', status: 'RECEIVED',
    dueDate: hoje, paymentDate: hoje,
  });
  ok('webhook aceitou a cobrança recorrente', r1.status === 200 && r1.body?.success === true, JSON.stringify(r1.body));

  const { data: s1 } = await db.from('subscriptions').select('*').eq('user_id', uid).maybeSingle();
  eq('assinatura segue ativa', s1?.status, 'active');
  const estendido = dias(s1?.current_period_end, fimAtual);
  ok(`período estendido +180d A PARTIR DO FIM ANTIGO (obtido +${estendido}d)`, estendido === 180,
     'se der ~180 a partir de HOJE, o cliente que pagou adiantado perdeu os dias restantes');

  const { count: nBillings } = await db.from('billings').select('*', { count: 'exact', head: true }).eq('user_id', uid);
  ok('billing retroativo foi criado', (nBillings ?? 0) >= 1);

  // ── 2. COBRANÇA EM ATRASO → past_due sem cortar acesso ──────────────────
  console.log('\n2) Cobrança em atraso (PAYMENT_OVERDUE)');
  const r2 = await fire('PAYMENT_OVERDUE', {
    id: `pay_${TAG}_late_${Date.now()}`, customer: 'cus_e2e', subscription: asaasSubId,
    value: valor / 100, billingType: 'CREDIT_CARD', status: 'OVERDUE', dueDate: hoje,
  });
  ok('webhook aceitou', r2.status === 200);
  const { data: s2 } = await db.from('subscriptions').select('status, past_due_since').eq('user_id', uid).maybeSingle();
  ok('marcou past_due', !!s2?.past_due_since, '(dunning não seria disparado)');
  eq('NÃO cortou o acesso na hora', s2?.status, 'active');

  // ── 3. Pagamento sobre billing reembolsado não reativa ──────────────────
  console.log('\n3) Pagamento atrasado sobre cobrança já reembolsada');
  const extRef = `${TAG}_ref_${Date.now()}`;
  const payRef = `pay_${extRef}`;
  await db.from('billings').insert({
    user_id: uid, plan: 'pro', cycle: 'semiannually', amount_cents: valor,
    original_amount_cents: valor, status: 'refunded', gateway: 'asaas',
    gateway_payment_id: payRef, external_id: extRef, metadata: { method: 'PIX', kind: 'purchase' },
  });
  const r3 = await fire('PAYMENT_RECEIVED', {
    id: payRef, customer: 'cus_e2e', value: valor / 100, billingType: 'PIX',
    status: 'RECEIVED', dueDate: hoje, paymentDate: hoje, externalReference: extRef,
  });
  ok('webhook respondeu 200 (não quebra)', r3.status === 200);
  ok('ignorou o pagamento (não reativou)', String(r3.body?.skipped ?? '').startsWith('billing_'),
     `resposta: ${JSON.stringify(r3.body)}`);
  const { data: bref } = await db.from('billings').select('status').eq('external_id', extRef).maybeSingle();
  eq('billing segue refunded', bref?.status, 'refunded');

  // ── 4. Expiração após a carência ────────────────────────────────────────
  console.log('\n4) Expiração após a carência de 3 dias');
  await db.from('subscriptions').update({
    status: 'active', past_due_since: null,
    current_period_end: new Date(Date.now() - 2 * DAY).toISOString(), // venceu há 2d (dentro da carência)
  }).eq('user_id', uid);
  await db.rpc('expire_overdue_subscriptions');
  const { data: s4a } = await db.from('subscriptions').select('status').eq('user_id', uid).maybeSingle();
  eq('vencido há 2d: AINDA ativo (carência de 3d)', s4a?.status, 'active');

  await db.from('subscriptions').update({
    current_period_end: new Date(Date.now() - 5 * DAY).toISOString(), // venceu há 5d (passou da carência)
  }).eq('user_id', uid);
  await db.rpc('expire_overdue_subscriptions');
  const { data: s4b } = await db.from('subscriptions').select('status').eq('user_id', uid).maybeSingle();
  eq('vencido há 5d: expirado', s4b?.status, 'expired');

  // ── 5. Seleção dos crons (RÉPLICA da query — não invoca as functions) ────
  console.log('\n5) Seleção dos crons (réplica da query — cron_secret fica no Vault)');

  // 5a. Lembrete: vence dentro de 7 dias, plano pago, ativo/trial
  await db.from('subscriptions').update({
    status: 'active', current_period_end: new Date(Date.now() + 2 * DAY).toISOString(),
  }).eq('user_id', uid);
  const in7 = new Date(Date.now() + 7 * DAY).toISOString();
  const { data: warn } = await db.from('subscriptions')
    .select('user_id').in('plan', ['pro', 'erp']).in('status', ['active', 'trial'])
    .not('current_period_end', 'is', null)
    .gt('current_period_end', new Date().toISOString())
    .lte('current_period_end', in7);
  ok('lembrete: pega quem vence em 2 dias', (warn ?? []).some((w) => w.user_id === uid));

  await db.from('subscriptions').update({
    current_period_end: new Date(Date.now() + 30 * DAY).toISOString(),
  }).eq('user_id', uid);
  const { data: warn2 } = await db.from('subscriptions')
    .select('user_id').in('plan', ['pro', 'erp']).in('status', ['active', 'trial'])
    .not('current_period_end', 'is', null)
    .gt('current_period_end', new Date().toISOString())
    .lte('current_period_end', new Date(Date.now() + 7 * DAY).toISOString());
  ok('lembrete: NÃO pega quem vence em 30 dias', !(warn2 ?? []).some((w) => w.user_id === uid));

  // 5b. Renovação parcelada: precisa de token + parcelas>=2 + vencido + não cancelado.
  //
  // Antes disso: o banco IMPEDE ter os dois mecanismos de cobrança ao mesmo
  // tempo (recorrência da Asaas E token self-driven) — é o que garante que
  // ninguém seja cobrado duas vezes pelo mesmo ciclo.
  const { error: mutexErr } = await db.from('subscriptions')
    .update({ renewal_card_token: 'tok_e2e_fake' }) // ainda tem gateway_subscription_id
    .eq('user_id', uid);
  ok('banco IMPEDE recorrência Asaas + token self-driven juntos (anti-cobrança-dupla)',
     !!mutexErr && /chk_sub_renewal_mutex/.test(mutexErr.message ?? ''),
     `erro obtido: ${mutexErr?.message ?? '(nenhum — aceitou os dois!)'}`);

  // Cenário self-driven de verdade: sem recorrência na Asaas.
  await db.from('subscriptions').update({
    gateway_subscription_id: null,
    renewal_card_token: 'tok_e2e_fake', renewal_installments: 6, cancel_at_period_end: false,
    gateway_customer_id: 'cus_e2e', current_period_end: new Date(Date.now() - 1 * DAY).toISOString(),
    status: 'active',
  }).eq('user_id', uid);
  const selRenew = () => db.from('subscriptions')
    .select('user_id')
    .not('renewal_card_token', 'is', null).gte('renewal_installments', 2)
    .in('status', ['active', 'trial']).eq('cancel_at_period_end', false)
    .not('gateway_customer_id', 'is', null).not('current_period_end', 'is', null)
    .lte('current_period_end', new Date().toISOString());
  const { data: ren1 } = await selRenew();
  ok('renovação parcelada: pega quem venceu com token', (ren1 ?? []).some((r) => r.user_id === uid));

  await db.from('subscriptions').update({ cancel_at_period_end: true }).eq('user_id', uid);
  const { data: ren2 } = await selRenew();
  ok('renovação parcelada: NÃO recobra quem pediu cancelamento', !(ren2 ?? []).some((r) => r.user_id === uid));

  await db.from('subscriptions').update({ cancel_at_period_end: false, renewal_card_token: null }).eq('user_id', uid);
  const { data: ren3 } = await selRenew();
  ok('renovação parcelada: NÃO tenta sem token (cartão à vista)', !(ren3 ?? []).some((r) => r.user_id === uid));

  if (!KEEP) { console.log(''); await cleanup(); }
  else console.log('\n⚠️  --keep: dados MANTIDOS. Rode com --cleanup pra apagar.');

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passou · ${fail} falhou\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('\n✖ erro:', e.message);
  await cleanup().catch(() => {});
  process.exit(1);
});
