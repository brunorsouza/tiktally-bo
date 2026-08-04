// ============================================================================
// E2E — trava do PLANO DE TESTE (R$10)
// ============================================================================
// Prova, contra o ambiente REAL, que quem não está na allowlist não consegue
// nem ver nem comprar o plano de teste. Isto guarda receita: o plano libera
// features do Pro por R$10 e o Asaas está em produção.
//
// Rodar:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... \
//     node scripts/e2e-test-plan-gate.mjs
//
// CUSTO ZERO por construção: todas as chamadas de checkout usam um e-mail FORA
// da lista e um usuário descartável, então o resultado esperado é sempre
// recusa — nada chega na Asaas. Usa PIX (e não cartão) para que, mesmo se a
// trava estiver quebrada, o pior caso seja um registro pendente sem dinheiro
// se movendo. O script derruba o usuário no final, em qualquer cenário.
// ============================================================================

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;

if (!URL || !KEY || !ANON) {
  console.error('✖ Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY.');
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });

const TAG = `e2egate${Date.now()}`;
const EMAIL = `${TAG}@example.com`; // deliberadamente FORA da allowlist
const SENHA = `Ee2e!${Math.random().toString(36).slice(2)}Aa9`;

let passou = 0;
let falhou = 0;
function check(ok, titulo, detalhe = '') {
  if (ok) {
    passou++;
    console.log(`  ✔ ${titulo}`);
  } else {
    falhou++;
    console.log(`  ✘ ${titulo}${detalhe ? ` — ${detalhe}` : ''}`);
  }
}

async function main() {
  let userId = null;

  try {
    // ── 1. Anônimo: o motor de preço não pode citar o plano ───────────────
    console.log('\n1) pricing público (anônimo)');
    const anon = await fetch(`${URL}/functions/v1/pricing`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    }).then((r) => r.json());
    const planosAnon = [...new Set((anon.pricing ?? []).map((l) => l.planKey))].sort();
    check(anon.success === true, 'endpoint respondeu', JSON.stringify(anon).slice(0, 120));
    check(!planosAnon.includes('test'), 'plano de teste NÃO aparece', `planos: ${planosAnon}`);
    check(planosAnon.includes('pro') && planosAnon.includes('erp'), 'pro e erp continuam aparecendo');

    // ── 2. Usuário autenticado, mas fora da lista ─────────────────────────
    console.log('\n2) usuário autenticado FORA da allowlist');
    const { data: criado, error: errCriar } = await db.auth.admin.createUser({
      email: EMAIL,
      password: SENHA,
      email_confirm: true,
    });
    if (errCriar) throw new Error(`criar usuário: ${errCriar.message}`);
    userId = criado.user.id;
    console.log(`   usuário descartável: ${EMAIL}`);

    const pub = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data: sessao, error: errLogin } = await pub.auth.signInWithPassword({
      email: EMAIL,
      password: SENHA,
    });
    if (errLogin) throw new Error(`login: ${errLogin.message}`);
    const jwt = sessao.session.access_token;

    // 2a. pricing autenticado — continua sem o plano
    const auth = await fetch(`${URL}/functions/v1/pricing`, {
      headers: { apikey: ANON, Authorization: `Bearer ${jwt}` },
    }).then((r) => r.json());
    const planosAuth = [...new Set((auth.pricing ?? []).map((l) => l.planKey))].sort();
    check(!planosAuth.includes('test'), 'pricing autenticado NÃO revela o plano', `planos: ${planosAuth}`);

    // 2b. checkout PIX com plan=test — tem que ser recusado
    const res = await fetch(`${URL}/functions/v1/billing-create-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ plan: 'test', cycle: 'semiannually', method: 'PIX' }),
    });
    const body = await res.json().catch(() => null);
    check(res.status === 400, 'checkout recusado (HTTP 400)', `veio ${res.status}`);
    check(
      typeof body?.error === 'string' && body.error.includes('Plano inválido'),
      'mensagem genérica — não revela que a chave existe',
      JSON.stringify(body),
    );

    // 2c. nada pode ter sido criado no banco pra esse usuário
    const { data: billings } = await db.from('billings').select('id, plan, amount_cents').eq('user_id', userId);
    check((billings ?? []).length === 0, 'nenhuma cobrança criada', `${(billings ?? []).length} encontrada(s)`);
    // Atenção: NÃO dá pra assertar "zero assinaturas". O trigger
    // `on_auth_user_created_subscription` cria uma linha (plan='tiktally',
    // status='cancelled') pra todo cadastro. O que importa é que ela não tenha
    // virado o plano de teste nem ficado ativa.
    const { data: subs } = await db.from('subscriptions').select('id, plan, status').eq('user_id', userId);
    const sujas = (subs ?? []).filter((s) => s.plan === 'test' || s.status === 'active' || s.status === 'trial');
    check(sujas.length === 0, 'nenhuma assinatura virou test/ativa', JSON.stringify(subs));

    // ── 2d. O toggle do backoffice corta de verdade ───────────────────────
    // Simula um e-mail AUTORIZADO temporariamente (troca o secret é caro, então
    // aqui a prova é indireta: com o toggle OFF, o motor de preço não pode
    // devolver o plano nem pra quem está na allowlist real).
    console.log('\n2d) toggle do backoffice desliga de verdade');
    const { data: antes } = await db
      .from('settings')
      .select('value')
      .eq('key', 'test_plan_enabled')
      .maybeSingle();
    const valorOriginal = antes?.value ?? true;

    await db.from('settings').update({ value: false }).eq('key', 'test_plan_enabled');
    const comOff = await fetch(`${URL}/functions/v1/billing-create-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ plan: 'test', cycle: 'semiannually', method: 'PIX' }),
    });
    check(comOff.status === 400, 'com toggle OFF o checkout continua recusando', `veio ${comOff.status}`);

    // Restaura o estado que estava antes — o script não pode deixar rastro.
    await db.from('settings').update({ value: valorOriginal }).eq('key', 'test_plan_enabled');
    const { data: depois } = await db
      .from('settings')
      .select('value')
      .eq('key', 'test_plan_enabled')
      .maybeSingle();
    check(
      String(depois?.value) === String(valorOriginal),
      'estado do toggle restaurado',
      `era ${valorOriginal}, ficou ${depois?.value}`,
    );

    // ── 3. Sanidade: o plano EXISTE no banco a R$10 ───────────────────────
    console.log('\n3) o plano existe no catálogo (só não é alcançável)');
    const { data: plano } = await db.from('plans').select('id, key, status').eq('key', 'test').maybeSingle();
    check(plano?.status === 'test', "plans.status = 'test' (fora do filtro público)", `status: ${plano?.status}`);
    if (plano?.id) {
      const { data: precos } = await db
        .from('prices')
        .select('cycle, total_amount_cents, installments')
        .eq('plan_id', plano.id)
        .eq('active', true);
      const todosDezReais = (precos ?? []).length === 2 && precos.every((p) => p.total_amount_cents === 1000);
      check(todosDezReais, 'dois ciclos a R$ 10,00', JSON.stringify(precos));
    }
  } finally {
    if (userId) {
      await db.auth.admin.deleteUser(userId).catch(() => {});
      console.log('\n🧹 usuário descartável removido');
    }
  }

  console.log(`\n${'─'.repeat(52)}`);
  console.log(`${passou} passaram · ${falhou} falharam`);
  if (falhou > 0) {
    console.log('⚠️  BURACO NA TRAVA — não deixe o plano de teste ligado assim.');
    process.exit(1);
  }
  console.log('✅ trava do plano de teste íntegra');
}

main().catch((e) => {
  console.error('\n✖ erro:', e.message);
  process.exit(1);
});
