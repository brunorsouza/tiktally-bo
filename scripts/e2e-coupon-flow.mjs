#!/usr/bin/env node
// ============================================================================
// E2E do fluxo COM CUPOM — checkout + comissão + renovação + estorno. Custo zero.
// ============================================================================
//
//   # 1) webhook local (terminal A):
//   cd tiktok-shop-tally
//   ASAAS_ENV=sandbox ASAAS_WEBHOOK_TOKEN_SANDBOX=e2e-token-local ASAAS_API_KEY_SANDBOX=x \
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   npx deno@2 run --allow-net --allow-env supabase/functions/asaas-webhook-receiver/index.ts
//
//   # 2) checkout local (terminal B) — porta 8001:
//   cd tiktok-shop-tally
//   ASAAS_ENV=sandbox ASAAS_API_KEY_SANDBOX=x SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   npx deno@2 run --allow-net --allow-env --port 8001 \
//     supabase/functions/billing-create-payment/index.ts
//
//   # 3) o teste (terminal C):
//   WEBHOOK_URL=http://localhost:8000 CHECKOUT_URL=http://localhost:8001 \
//   ASAAS_WEBHOOK_TOKEN=e2e-token-local SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   SUPABASE_ANON_KEY=... node scripts/e2e-coupon-flow.mjs
//
// POR QUE NENHUMA COBRANÇA É CRIADA
//
// No checkout, TODA validação de cupom (anti-fraude, parceiro suspenso,
// unicidade vitalícia) roda ANTES de falar com a Asaas. Quando o cupom é
// recusado, a função devolve 422 e para. Quando o cupom PASSA, ela segue e
// esbarra em "Cadastro incompleto" (o perfil de teste não tem CPF) — que é
// justamente o nosso sinal de "cupom aceito", ainda antes da Asaas.
//
// A parte pós-pagamento (resgate, comissão, estorno) é exercitada pelo webhook,
// como nos outros scripts.
// ============================================================================

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const HOOK = process.env.ASAAS_WEBHOOK_TOKEN;
const WEBHOOK_URL = (process.env.WEBHOOK_URL ?? `${URL}/functions/v1/asaas-webhook-receiver`).replace(/\/$/, '');
const CHECKOUT_URL = process.env.CHECKOUT_URL?.replace(/\/$/, '') ?? null;

if (!URL || !KEY) { console.error('✖ Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const args = process.argv.slice(2);
const KEEP = args.includes('--keep');
const ONLY_CLEANUP = args.includes('--cleanup');
// As duas edge functions escutam na porta 8000 (fixa no std/serve), então não
// sobem juntas. O teste roda em DUAS passadas:
//   passada 1 (só checkout no ar):  --skip-webhook --keep
//   passada 2 (só webhook no ar):   --skip-checkout --reuse
const SKIP_WEBHOOK = args.includes('--skip-webhook');
const SKIP_CHECKOUT = args.includes('--skip-checkout');
const REUSE = args.includes('--reuse');
if (!HOOK && !ONLY_CLEANUP && !SKIP_WEBHOOK) { console.error('✖ Falta ASAAS_WEBHOOK_TOKEN.'); process.exit(1); }

const db = createClient(URL, KEY);
const TAG = 'E2E_CUP';
const DAY = 864e5;
const users = {
  comprador: 'e2e-cup-comprador@teste.local',
  afiliado1: 'e2e-cup-afiliado1@teste.local',
  afiliado2: 'e2e-cup-afiliado2@teste.local',
  dono: 'e2e-cup-dono@teste.local',
};
const SENHA = 'E2E-teste-9x7!aQ';

let pass = 0, fail = 0;
const ok = (l, c, d = '') => { console.log(`${c ? '  ✔' : '  ✖'} ${l}${c ? '' : `\n      ${d}`}`); c ? pass++ : fail++; return c; };
const eq = (l, a, b) => ok(l, JSON.stringify(a) === JSON.stringify(b), `esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`);
const brl = (c) => `R$ ${(c / 100).toFixed(2)}`;

async function idsDeTeste() {
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return (data?.users ?? []).filter((u) => Object.values(users).includes(u.email));
}

async function cleanup() {
  const us = await idsDeTeste();
  const uids = us.map((u) => u.id);
  if (uids.length) {
    const { data: bills } = await db.from('billings').select('id').in('user_id', uids);
    const billIds = (bills ?? []).map((b) => b.id);
    if (billIds.length) {
      const { data: reds } = await db.from('coupon_redemptions').select('id').in('billing_id', billIds);
      const rIds = (reds ?? []).map((r) => r.id);
      if (rIds.length) await db.from('commissions').delete().in('redemption_id', rIds);
      await db.from('coupon_redemptions').delete().in('billing_id', billIds);
    }
    await db.from('coupon_redemptions').delete().in('user_id', uids);
    await db.from('billings').delete().in('user_id', uids);
    await db.from('subscriptions').delete().in('user_id', uids);
  }
  const { data: affs } = await db.from('affiliates').select('id').like('name', `${TAG}%`);
  const affIds = (affs ?? []).map((a) => a.id);
  if (affIds.length) {
    const { data: reds } = await db.from('coupon_redemptions').select('id').in('affiliate_id', affIds);
    const rIds = (reds ?? []).map((r) => r.id);
    if (rIds.length) await db.from('commissions').delete().in('redemption_id', rIds);
    await db.from('coupon_redemptions').delete().in('affiliate_id', affIds);
  }
  await db.from('coupons').delete().like('code', `${TAG}%`);
  if (affIds.length) await db.from('affiliates').delete().in('id', affIds);
  await db.from('businesses').delete().like('name', `${TAG}%`);
  for (const u of us) await db.auth.admin.deleteUser(u.id).catch(() => {});
  console.log('🧹 limpeza concluída');
}

async function criarUsuario(email) {
  const { data, error } = await db.auth.admin.createUser({ email, password: SENHA, email_confirm: true });
  if (error) throw new Error(`criar ${email}: ${error.message}`);
  return data.user.id;
}

/** JWT do usuário — precisa da anon key (login normal). */
async function jwtDe(email) {
  if (!ANON) return null;
  const pub = createClient(URL, ANON);
  const { data, error } = await pub.auth.signInWithPassword({ email, password: SENHA });
  if (error) return null;
  return data.session?.access_token ?? null;
}

async function fire(event, payment) {
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'asaas-access-token': HOOK },
    body: JSON.stringify({ id: `evt_${TAG}_${Date.now()}_${Math.random().toString(36).slice(2)}`, event, payment }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** Tenta o checkout com cupom. Devolve {status, code}. Nunca chega na Asaas. */
async function tentarCheckout(jwt, coupon, method = 'PIX') {
  const res = await fetch(CHECKOUT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ plan: 'pro', cycle: 'yearly', method, coupon }),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, code: body?.error_code ?? null, error: body?.error ?? null };
}

/** Cria um billing pago com cupom e confirma pelo webhook. */
async function comprarComCupom({ uid, couponId, gross, descontoPct, method, kind = 'purchase' }) {
  const descontoCents = Math.round((gross * descontoPct) / 100);
  let net = gross - descontoCents;
  if (method === 'PIX') net = Math.round((net * 95) / 100); // −5% PIX
  const extId = `${TAG}_${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const payId = `pay_${extId}`;
  const { data: b } = await db.from('billings').insert({
    user_id: uid, plan: 'pro', cycle: 'yearly',
    amount_cents: net, original_amount_cents: gross, discount_cents: descontoCents,
    status: 'pending', gateway: 'asaas', gateway_payment_id: payId, external_id: extId,
    metadata: { method, kind, coupon_id: couponId, coupon_discount_cents: descontoCents },
  }).select('id').single();
  const hoje = new Date().toISOString().slice(0, 10);
  await fire('PAYMENT_RECEIVED', {
    id: payId, customer: 'cus_e2e', value: net / 100,
    billingType: method === 'PIX' ? 'PIX' : 'CREDIT_CARD', status: 'RECEIVED',
    dueDate: hoje, paymentDate: hoje, externalReference: extId,
  });
  return { billingId: b.id, payId, extId, net, gross, descontoCents };
}

async function main() {
  console.log(`\n🔗 ${URL}\n   webhook:  ${WEBHOOK_URL}\n   checkout: ${CHECKOUT_URL ?? '(não informado — fase 1 será pulada)'}\n`);
  if (ONLY_CLEANUP) return cleanup();
  if (!REUSE) await cleanup();

  const { data: setts } = await db.from('settings').select('key, value');
  const S = Object.fromEntries((setts ?? []).map((s) => [s.key, s.value]));
  const pool = Number(S.commission_pool_percent ?? 30);
  const DESC = 15;
  const comPct = pool - DESC;
  console.log(`⚙️  pool ${pool}% · cupom ${DESC}% ⇒ comissão ${comPct}%\n`);

  // ── Cenário ──────────────────────────────────────────────────────────────
  console.log(`0) Cenário${REUSE ? ' (reaproveitando o da passada anterior)' : ''}`);
  let uidComprador, uidAff1, uidAff2, uidDono, biz, aff1, aff2, cupom;

  if (REUSE) {
    const us = await idsDeTeste();
    const byEmail = (e) => us.find((u) => u.email === e)?.id;
    uidComprador = byEmail(users.comprador); uidAff1 = byEmail(users.afiliado1);
    uidAff2 = byEmail(users.afiliado2); uidDono = byEmail(users.dono);
    ({ data: biz } = await db.from('businesses').select('id').like('name', `${TAG}%`).maybeSingle());
    ({ data: aff1 } = await db.from('affiliates').select('id').eq('user_id', uidAff1).maybeSingle());
    ({ data: aff2 } = await db.from('affiliates').select('id').eq('user_id', uidAff2).maybeSingle());
    ({ data: cupom } = await db.from('coupons').select('id, code').like('code', `${TAG}%`).maybeSingle());
    if (!biz || !aff1 || !cupom) throw new Error('--reuse sem cenário anterior. Rode a passada 1 com --keep.');
  } else {
    uidComprador = await criarUsuario(users.comprador);
    uidAff1 = await criarUsuario(users.afiliado1);
    uidAff2 = await criarUsuario(users.afiliado2);
    uidDono = await criarUsuario(users.dono);

    ({ data: biz } = await db.from('businesses')
      .insert({ name: `${TAG} Agência`, status: 'active', owner_user_id: uidDono }).select('id').single());
    ({ data: aff1 } = await db.from('affiliates')
      .insert({ name: `${TAG} Afiliado 1`, business_id: biz.id, status: 'active', user_id: uidAff1,
                default_commission_type: 'percent', default_commission_value: 0 }).select('id').single());
    ({ data: aff2 } = await db.from('affiliates')
      .insert({ name: `${TAG} Afiliado 2`, business_id: biz.id, status: 'active', user_id: uidAff2,
                default_commission_type: 'percent', default_commission_value: 0 }).select('id').single());
    ({ data: cupom } = await db.from('coupons')
      .insert({ code: `${TAG}15`, discount_kind: 'PERCENTAGE', discount: DESC, status: 'ACTIVE',
                max_redeems: -1, affiliate_id: aff1.id, business_id: biz.id, applies_to_renewals: true })
      .select('id, code').single());
  }
  void aff2;

  const { data: plan } = await db.from('plans').select('id').eq('key', 'pro').maybeSingle();
  const { data: price } = await db.from('prices').select('total_amount_cents')
    .eq('plan_id', plan.id).eq('cycle', 'yearly').eq('active', true).maybeSingle();
  const gross = price.total_amount_cents;
  console.log(`   Pro anual ${brl(gross)} · cupom ${cupom.code} (afiliado 1)\n`);

  // ── 1. Anti-fraude no CHECKOUT (código real; rejeição não chama a Asaas) ──
  if (CHECKOUT_URL && ANON && !SKIP_CHECKOUT) {
    console.log('1) Anti-fraude no checkout');
    const jwtAff1 = await jwtDe(users.afiliado1);
    const jwtAff2 = await jwtDe(users.afiliado2);
    const jwtDono = await jwtDe(users.dono);
    const jwtComprador = await jwtDe(users.comprador);

    if (!jwtAff1) {
      ok('login dos usuários de teste', false, 'não consegui JWT — confira SUPABASE_ANON_KEY');
    } else {
      const r1 = await tentarCheckout(jwtAff1, cupom.code);
      eq('afiliado NÃO usa o próprio cupom', [r1.status, r1.code], [422, 'NOT_ELIGIBLE']);

      const r2 = await tentarCheckout(jwtDono, cupom.code);
      eq('dono do business NÃO usa cupom da carteira', [r2.status, r2.code], [422, 'NOT_ELIGIBLE']);

      const r3 = await tentarCheckout(jwtAff2, cupom.code);
      eq('afiliado da MESMA carteira NÃO usa (auto-uso cruzado)', [r3.status, r3.code], [422, 'NOT_ELIGIBLE']);

      // Cliente comum: cupom passa e o fluxo para no cadastro incompleto,
      // ANTES de qualquer chamada à Asaas.
      const r4 = await tentarCheckout(jwtComprador, cupom.code);
      ok('cliente comum: cupom ACEITO (para no cadastro incompleto, sem cobrar)',
         r4.status === 400 && /Cadastro incompleto/i.test(r4.error ?? ''), `obtido: ${r4.status} ${r4.error}`);

      // Cupom pausado deixa de valer
      await db.from('coupons').update({ status: 'INACTIVE' }).eq('id', cupom.id);
      const r5 = await tentarCheckout(jwtComprador, cupom.code);
      ok('cupom INATIVO não aplica desconto (segue sem cupom)',
         r5.status === 400 && /Cadastro incompleto/i.test(r5.error ?? ''), `obtido: ${r5.status} ${r5.error}`);
      await db.from('coupons').update({ status: 'ACTIVE' }).eq('id', cupom.id);
    }
  } else {
    console.log('1) Anti-fraude no checkout — PULADO (defina CHECKOUT_URL e SUPABASE_ANON_KEY)');
  }

  if (SKIP_WEBHOOK) {
    console.log('\n(fases 2–6 puladas: --skip-webhook)');
    if (!KEEP) await cleanup();
    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passou · ${fail} falhou\n`);
    process.exit(fail === 0 ? 0 : 1);
  }

  // ── 2. Compra com cupom no CARTÃO ────────────────────────────────────────
  console.log('\n2) Compra com cupom — cartão');
  const c1 = await comprarComCupom({ uid: uidComprador, couponId: cupom.id, gross, descontoPct: DESC, method: 'CARD' });
  eq('valor cobrado = tabela − 15%', c1.net, gross - Math.round((gross * DESC) / 100));

  const { data: red1 } = await db.from('coupon_redemptions').select('*').eq('billing_id', c1.billingId).maybeSingle();
  ok('resgate gravado', !!red1);
  eq('resgate aponta pro afiliado 1', red1?.affiliate_id, aff1.id);
  eq('snapshot do % aplicado', Number(red1?.discount_percent_applied), DESC);

  const { data: com1 } = red1
    ? await db.from('commissions').select('*').eq('redemption_id', red1.id).maybeSingle() : { data: null };
  ok('comissão criada', !!com1);
  eq(`comissão = ${comPct}% do pago (${brl(Math.round((c1.net * comPct) / 100))})`,
     com1?.amount_cents, Math.round((c1.net * comPct) / 100));

  // ── 3. RENOVAÇÃO com cupom → preço cheio e SEM comissão ─────────────────
  console.log('\n3) Renovação (regra travada: preço cheio, sem comissão)');
  const { count: comAntes } = await db.from('commissions').select('*', { count: 'exact', head: true }).eq('affiliate_id', aff1.id);
  const c2 = await comprarComCupom({
    uid: uidComprador, couponId: cupom.id, gross, descontoPct: 0, method: 'CARD', kind: 'renewal',
  });
  eq('renovação cobra o preço CHEIO', c2.net, gross);
  const { count: comDepois } = await db.from('commissions').select('*', { count: 'exact', head: true }).eq('affiliate_id', aff1.id);
  eq('renovação NÃO gerou comissão nova', comDepois, comAntes);

  // ── 4. Reembolso → comissão cancelada ───────────────────────────────────
  console.log('\n4) Reembolso da compra com cupom');
  await fire('PAYMENT_REFUNDED', {
    id: c1.payId, customer: 'cus_e2e', value: c1.net / 100, billingType: 'CREDIT_CARD',
    status: 'REFUNDED', dueDate: new Date().toISOString().slice(0, 10), externalReference: c1.extId,
  });
  const { data: red1b } = await db.from('coupon_redemptions').select('status').eq('billing_id', c1.billingId).maybeSingle();
  eq('resgate virou refunded', red1b?.status, 'refunded');
  const { data: com1b } = red1
    ? await db.from('commissions').select('status').eq('redemption_id', red1.id).maybeSingle() : { data: null };
  eq('comissão cancelada', com1b?.status, 'cancelled');

  // ── 5. Chargeback → comissão ESTORNADA (diferente de cancelada) ─────────
  console.log('\n5) Chargeback (comissão paga → reversed)');
  await db.from('coupon_redemptions').delete().eq('user_id', uidComprador); // libera a vaga vitalícia
  const c3 = await comprarComCupom({ uid: uidComprador, couponId: cupom.id, gross, descontoPct: DESC, method: 'PIX' });
  eq('PIX: cupom −15% e depois −5%', c3.net, Math.round(((gross - Math.round((gross * DESC) / 100)) * 95) / 100));

  const { data: red3 } = await db.from('coupon_redemptions').select('id').eq('billing_id', c3.billingId).maybeSingle();
  if (red3) await db.from('commissions').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('redemption_id', red3.id);
  await fire('PAYMENT_CHARGEBACK_REQUESTED', {
    id: c3.payId, customer: 'cus_e2e', value: c3.net / 100, billingType: 'PIX',
    status: 'CHARGEBACK_REQUESTED', dueDate: new Date().toISOString().slice(0, 10), externalReference: c3.extId,
  });
  const { data: com3 } = red3
    ? await db.from('commissions').select('status').eq('redemption_id', red3.id).maybeSingle() : { data: null };
  eq('comissão JÁ PAGA vira reversed (não cancelled)', com3?.status, 'reversed');

  // ── 6. Ciclo de vida do cupom ───────────────────────────────────────────
  console.log('\n6) Cupom com resgate não é apagado');
  const { error: delErr } = await db.from('coupons').update({ status: 'ARCHIVED' }).eq('id', cupom.id);
  ok('banco aceita ARCHIVED (soft delete)', !delErr, delErr?.message ?? '');

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
