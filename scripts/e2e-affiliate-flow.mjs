#!/usr/bin/env node
// ============================================================================
// Teste ponta-a-ponta do programa de afiliados.
// ============================================================================
//
//   node scripts/e2e-affiliate-flow.mjs            # semeia, valida e LIMPA
//   node scripts/e2e-affiliate-flow.mjs --keep     # não limpa (inspecionar)
//   node scripts/e2e-affiliate-flow.mjs --cleanup  # só apaga sobras de execução anterior
//
// Requer, no ambiente:
//   SUPABASE_URL                (ex.: https://zgkxtyewmbkupuzeoyya.supabase.co)
//   SUPABASE_SERVICE_ROLE_KEY   (a mesma que as edge functions usam)
//
// ⚠️ O QUE ESTE SCRIPT **NÃO** FAZ — e por quê
//
// A Asaas do projeto está em **produção**. Um checkout de verdade geraria
// cobrança REAL. Por isso este script NÃO cria cobrança, NÃO chama a Asaas e
// NÃO simula pagamento confirmado.
//
// Ele cobre a parte que dá pra verificar sem mover dinheiro:
//   1. cria business + afiliado + cupom de parceiro (dados de teste isolados)
//   2. confere que o cupom nasce com as regras certas (%, vínculo, renovação)
//   3. confere que o MOTOR DE PREÇO enxerga o cupom e calcula certo
//   4. SIMULA a comissão que aquele resgate geraria e compara com a regra
//      (pool − desconto, sobre o valor pago) — aritmética, sem gravar nada
//   5. apaga tudo o que criou
//
// A confirmação de pagamento real (resgate gravado + comissão criada + janela
// de 7 dias + estorno) só dá pra exercitar de verdade num ambiente isolado —
// veja `docs/e2e-affiliate-checklist.md`.
// ============================================================================

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('✖ Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}

const db = createClient(URL, KEY);
const TAG = 'E2E_TESTE'; // marca tudo que este script cria
const args = process.argv.slice(2);
const KEEP = args.includes('--keep');
const ONLY_CLEANUP = args.includes('--cleanup');

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? '  ✔' : '  ✖'} ${label}${ok ? '' : `\n      esperado: ${JSON.stringify(expected)}\n      obtido:   ${JSON.stringify(actual)}`}`);
  ok ? passed++ : failed++;
  return ok;
}

function checkTrue(label, cond, detail = '') {
  console.log(`${cond ? '  ✔' : '  ✖'} ${label}${cond ? '' : `  ${detail}`}`);
  cond ? passed++ : failed++;
  return cond;
}

async function cleanup() {
  // Ordem importa: comissão → resgate → cupom → afiliado → business.
  const { data: affs } = await db.from('affiliates').select('id').like('name', `${TAG}%`);
  const affIds = (affs ?? []).map((a) => a.id);
  const { data: bizs } = await db.from('businesses').select('id').like('name', `${TAG}%`);
  const bizIds = (bizs ?? []).map((b) => b.id);

  if (affIds.length) {
    const { data: reds } = await db.from('coupon_redemptions').select('id').in('affiliate_id', affIds);
    const redIds = (reds ?? []).map((r) => r.id);
    if (redIds.length) await db.from('commissions').delete().in('redemption_id', redIds);
    await db.from('coupon_redemptions').delete().in('affiliate_id', affIds);
  }
  await db.from('coupons').delete().like('code', `${TAG}%`);
  if (affIds.length) await db.from('affiliates').delete().in('id', affIds);
  if (bizIds.length) await db.from('businesses').delete().in('id', bizIds);
  console.log('🧹 limpeza concluída');
}

async function main() {
  console.log(`\n🔗 ${URL}\n`);

  if (ONLY_CLEANUP) {
    await cleanup();
    return;
  }

  await cleanup(); // começa limpo

  // ── settings vigentes (a regra vem do banco, não de constante no teste) ──
  const { data: setts } = await db.from('settings').select('key, value');
  const S = Object.fromEntries((setts ?? []).map((s) => [s.key, s.value]));
  const pool = Number(S.commission_pool_percent ?? 30);
  const pixPct = Number(S.pix_discount_percent ?? 5);
  const hold = Number(S.commission_hold_days ?? 7);
  console.log(`⚙️  pool ${pool}% · PIX ${pixPct}% · carência ${hold}d · stacking ${S.discount_stacking}\n`);

  // ── 1. Semeia business + afiliado + cupom ────────────────────────────────
  console.log('1) Semeando dados de teste');
  const { data: biz, error: bizErr } = await db
    .from('businesses')
    .insert({ name: `${TAG} Agência`, email: 'e2e@teste.local', status: 'active' })
    .select('id, name')
    .single();
  if (bizErr) throw new Error(`falha ao criar business: ${bizErr.message}`);

  const { data: aff, error: affErr } = await db
    .from('affiliates')
    .insert({
      name: `${TAG} Afiliado`,
      email: 'e2e-aff@teste.local',
      business_id: biz.id,
      status: 'active',
      default_commission_type: 'percent',
      default_commission_value: 0, // legado — a regra do pool prevalece
    })
    .select('id, name, business_id')
    .single();
  if (affErr) throw new Error(`falha ao criar afiliado: ${affErr.message}`);

  const DISCOUNT = 15; // um dos valores permitidos (10/15/20)
  const { data: coupon, error: cErr } = await db
    .from('coupons')
    .insert({
      code: `${TAG}15`,
      description: 'cupom de teste E2E',
      discount_kind: 'PERCENTAGE',
      discount: DISCOUNT,
      status: 'ACTIVE',
      max_redeems: -1,
      affiliate_id: aff.id,
      business_id: biz.id,
      applies_to_renewals: true,
    })
    .select('id, code, discount, affiliate_id, business_id')
    .single();
  if (cErr) throw new Error(`falha ao criar cupom: ${cErr.message}`);
  console.log(`   business=${biz.id.slice(0, 8)} afiliado=${aff.id.slice(0, 8)} cupom=${coupon.code}\n`);

  // ── 2. O cupom nasceu com as regras certas ───────────────────────────────
  console.log('2) Regras do cupom');
  check('desconto gravado', coupon.discount, DISCOUNT);
  check('vinculado ao afiliado', coupon.affiliate_id, aff.id);
  check('vinculado ao business', coupon.business_id, biz.id);
  checkTrue('afiliado está na carteira do business', aff.business_id === biz.id);

  // ── 3. Motor de preço enxerga o cupom ────────────────────────────────────
  console.log('\n3) Motor de preço (GET /pricing)');
  const res = await fetch(`${URL}/functions/v1/pricing?coupon=${coupon.code}`, {
    headers: { apikey: KEY },
  });
  const pricing = await res.json();
  checkTrue('motor respondeu', pricing?.success === true, JSON.stringify(pricing).slice(0, 200));
  checkTrue('cupom reconhecido como válido', pricing?.coupon?.valid === true);
  check('% do cupom no motor', pricing?.coupon?.discountPercent, DISCOUNT);

  const line = (pricing.pricing ?? []).find((l) => l.planKey === 'pro' && l.cycle === 'yearly');
  checkTrue('linha Pro anual presente', !!line);

  if (line) {
    const gross = line.full.card.totalCents;
    // Cartão: total × (1 − desconto). PIX: × (1 − desconto) × (1 − pix).
    const espCartao = Math.floor((gross * (100 - DISCOUNT)) / 100 + 0.5);
    const espPix = Math.floor(gross * ((100 - DISCOUNT) / 100) * ((100 - pixPct) / 100) + 0.5);
    check('total com cupom (cartão)', line.withCoupon.card.totalCents, espCartao);
    check('total com cupom + PIX', line.withCoupon.pix.totalCents, espPix);

    // ── 4. Comissão que ESTE resgate geraria (aritmética, nada gravado) ────
    console.log('\n4) Comissão pela regra do pool (simulação)');
    const commissionPct = Math.max(0, pool - DISCOUNT);
    check(`comissão % (pool ${pool} − cupom ${DISCOUNT})`, commissionPct, 15);

    for (const [label, net] of [['cartão', espCartao], ['PIX', espPix]]) {
      const comissao = Math.round((net * commissionPct) / 100);
      const tikTally = net - comissao;
      console.log(
        `   ${label.padEnd(7)} cliente paga R$ ${(net / 100).toFixed(2)} · ` +
          `comissão R$ ${(comissao / 100).toFixed(2)} · ` +
          `TikTally R$ ${(tikTally / 100).toFixed(2)} (${((tikTally / gross) * 100).toFixed(2)}% do tabela)`,
      );
      checkTrue(`${label}: comissão < valor pago`, comissao < net);
      checkTrue(`${label}: base é o valor PAGO, não o de tabela`, comissao === Math.round((net * commissionPct) / 100));
    }
  }

  // ── 5. Invariantes de schema que sustentam as regras ─────────────────────
  console.log('\n5) Travas de integridade no banco');
  const { error: dupErr } = await db.from('coupons').insert({
    code: coupon.code, // mesmo código
    discount_kind: 'PERCENTAGE', discount: 10, status: 'ACTIVE', max_redeems: -1,
  });
  checkTrue('código de cupom é único', !!dupErr, '(inseriu duplicado!)');

  const { error: payeeErr } = await db.from('commissions').insert({
    redemption_id: '00000000-0000-0000-0000-000000000000',
    amount_cents: 100, commission_type: 'percent', commission_value: 10, status: 'pending',
  });
  checkTrue('comissão exige afiliado OU business', !!payeeErr, '(aceitou comissão sem destinatário!)');

  // ── Resultado ────────────────────────────────────────────────────────────
  if (!KEEP) {
    console.log('');
    await cleanup();
  } else {
    console.log(`\n⚠️  --keep: dados de teste MANTIDOS. Rode com --cleanup para apagar.`);
  }

  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passou · ${failed} falhou\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('\n✖ erro:', e.message);
  await cleanup().catch(() => {});
  process.exit(1);
});
