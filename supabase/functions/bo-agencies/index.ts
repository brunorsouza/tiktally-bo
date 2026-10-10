/**
 * bo-agencies — Gateway do Backoffice de agências.
 *
 * A conta de agência nasce AQUI (decisão de 2026-10-10): o admin cadastra
 * nome, CNPJ e e-mail do dono, e a conta já entra no app como agência, com a
 * carteira como tela inicial. O cadastro público ("Sou agência") vem depois.
 *
 * NÃO cria schema: as tabelas `agencies`, `agency_members`, `agency_sellers` e
 * `agency_audit_log` vêm da migration `20261009000001_agencies.sql`, no
 * repositório do app. O backoffice não faz migration.
 *
 * `provisionar()` é cópia de `provisionAgency()` em
 * `tiktok-shop-tally/supabase/functions/_shared/agency.ts`. Os repositórios são
 * separados e a edge não importa do outro. Mudou lá, muda aqui.
 *
 * Segurança (idêntica ao bo-fiscal / bo-coupons / bo-flags):
 *  - Exige JWT de usuário. Dentro, valida profiles.is_admin via service-role.
 *  - Escrita cross-tenant com service-role, por isso o gate de admin.
 *
 * Contas separadas: um login é seller OU agência. E-mail que já é de seller
 * (loja conectada ou vínculo com agência) é recusado.
 *
 * Secrets: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY; RESEND_API_KEY, FROM_EMAIL
 * e PUBLIC_APP_URL são opcionais (sem Resend, o link de acesso aparece na tela).
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
const ok = (data: unknown) => json({ success: true, data });
const fail = (error: string, status = 400) => json({ success: false, error }, status);

const FLAG_KEY = "agencias";
const COUPON_PERCENT = 5;

function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

const appUrl = () => (Deno.env.get("PUBLIC_APP_URL") ?? "https://tiktally.com.br").replace(/\/$/, "");
const isEmail = (s: unknown): s is string => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

async function emailOf(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await db.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

async function audit(
  db: SupabaseClient,
  row: { agency_id: string; actor_user_id: string; action: string; meta?: Record<string, unknown> },
) {
  const { error } = await db.from("agency_audit_log").insert({ meta: {}, ...row });
  if (error) console.error("[bo-agencies] audit falhou", row.action, error.message);
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Resend. Sem chave vira no-op e devolve false: o link sai na tela do backoffice. */
async function sendEmail(to: string, subject: string, paragraphs: string[], cta?: { label: string; url: string }) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return false;
  const from = Deno.env.get("FROM_EMAIL") ?? "TikTally <noreply@tiktally.com.br>";
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px">${escapeHtml(p)}</p>`).join("");
  const button = cta
    ? `<p style="margin:22px 0"><a href="${encodeURI(cta.url)}" style="background:#FE2C55;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(cta.label)}</a></p>`
    : "";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject,
        html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:520px">${body}${button}<p style="color:#888;font-size:12px">TikTally</p></div>`,
      }),
    });
    if (!r.ok) console.error("[bo-agencies] Resend", r.status, await r.text());
    return r.ok;
  } catch (e) {
    console.error("[bo-agencies] e-mail falhou", e);
    return false;
  }
}

/** Mesmas regras de `canBecomeAgency()` no app. null = pode. */
async function bloqueioParaAgencia(db: SupabaseClient, userId: string): Promise<string | null> {
  const [tok, link, member] = await Promise.all([
    db.from("tiktok_tokens").select("user_id").eq("user_id", userId).limit(1),
    db.from("agency_sellers").select("id").eq("seller_user_id", userId).in("status", ["pending", "active"]).limit(1),
    db.from("agency_members").select("agency_id").eq("user_id", userId).limit(1),
  ]);
  if ((member.data ?? []).length > 0) return "Esse e-mail já é de uma conta de agência.";
  if ((tok.data ?? []).length > 0) return "Esse e-mail é de um seller (tem loja conectada). Use outro e-mail para a agência.";
  if ((link.data ?? []).length > 0) return "Esse e-mail é seller de uma agência. Use outro e-mail para a agência.";
  return null;
}

function couponBase(name: string): string {
  const slug = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  return slug.length >= 3 ? slug : "AGENCIA";
}

/** Cópia de `provisionAgency()` do app. Ver o cabeçalho. */
async function provisionar(
  db: SupabaseClient,
  input: { ownerUserId: string; name: string; cnpj: string | null; actorUserId: string },
) {
  const { data: agency, error: agErr } = await db
    .from("agencies")
    .insert({ name: input.name, cnpj: input.cnpj, created_by: input.actorUserId })
    .select("id, name")
    .single();
  if (agErr) throw new Error(agErr.message);

  const { error: memErr } = await db
    .from("agency_members")
    .insert({ agency_id: agency.id, user_id: input.ownerUserId, role: "owner" });
  if (memErr) {
    await db.from("agencies").delete().eq("id", agency.id);
    throw new Error(memErr.message);
  }

  const { data: u } = await db.auth.admin.getUserById(input.ownerUserId);
  const { error: metaErr } = await db.auth.admin.updateUserById(input.ownerUserId, {
    app_metadata: { ...(u?.user?.app_metadata ?? {}), account_type: "agency" },
  });
  if (metaErr) console.error("[bo-agencies] não marcou account_type", metaErr.message);

  const base = `${couponBase(input.name)}${COUPON_PERCENT}`;
  let couponId: string | null = null;
  let couponCode: string | null = null;
  for (let i = 0; i < 6 && !couponId; i++) {
    const code = i === 0 ? base : `${base}${Math.floor(100 + Math.random() * 900)}`;
    const { data: c, error: cErr } = await db
      .from("coupons")
      .insert({
        code,
        description: `Cupom da agência ${input.name}`,
        discount_kind: "PERCENTAGE",
        discount: COUPON_PERCENT,
        status: "ACTIVE",
        max_redeems: -1,
        applies_to_renewals: true,
        metadata: { agency_id: agency.id, source: "agency" },
      })
      .select("id, code")
      .single();
    if (!cErr) {
      couponId = c.id;
      couponCode = c.code;
    } else if ((cErr as { code?: string }).code !== "23505") {
      console.error("[bo-agencies] cupom falhou", cErr);
      break;
    }
  }
  if (couponId) await db.from("agencies").update({ coupon_id: couponId }).eq("id", agency.id);

  await audit(db, {
    agency_id: agency.id,
    actor_user_id: input.actorUserId,
    action: "agency.create",
    meta: { coupon_code: couponCode, owner_user_id: input.ownerUserId, source: "backoffice" },
  });
  return { id: agency.id as string, name: agency.name as string, coupon_code: couponCode };
}

/** Coloca o dono no piloto do flag `agencias`. Sem isso a conta entra e não vê nada. */
async function liberarNoPiloto(db: SupabaseClient, userId: string, actorId: string) {
  const { data: f, error } = await db.from("feature_flags").select("enabled_user_ids").eq("key", FLAG_KEY).maybeSingle();
  if (error || !f) throw new Error(`Flag ${FLAG_KEY} não encontrada`);
  const ids = (f.enabled_user_ids ?? []) as string[];
  if (ids.includes(userId)) return;
  const { error: upErr } = await db
    .from("feature_flags")
    .update({ enabled_user_ids: [...ids, userId], updated_by: actorId })
    .eq("key", FLAG_KEY);
  if (upErr) throw new Error(upErr.message);
}

// ─────────────────────────────────────────────────────────────────────────
// Ações
// ─────────────────────────────────────────────────────────────────────────

async function actionList(db: SupabaseClient): Promise<Response> {
  const { data: agencies, error } = await db
    .from("agencies")
    .select("id, name, cnpj, status, created_at, coupon:coupons(code, status)")
    .order("created_at", { ascending: false });
  if (error) return fail(error.message, 500);

  const ids = (agencies ?? []).map((a) => a.id as string);
  const [{ data: owners }, { data: links }] = await Promise.all([
    ids.length
      ? db.from("agency_members").select("agency_id, user_id").eq("role", "owner").in("agency_id", ids)
      : Promise.resolve({ data: [] as { agency_id: string; user_id: string }[] }),
    ids.length
      ? db.from("agency_sellers").select("agency_id, status").in("agency_id", ids).in("status", ["active", "pending"])
      : Promise.resolve({ data: [] as { agency_id: string; status: string }[] }),
  ]);

  const ownerEmail = new Map<string, string | null>();
  for (const o of owners ?? []) ownerEmail.set(o.agency_id, await emailOf(db, o.user_id));

  return ok({
    agencies: (agencies ?? []).map((a) => {
      const own = (links ?? []).filter((l) => l.agency_id === a.id);
      const coupon = a.coupon as unknown as { code: string; status: string } | null;
      return {
        id: a.id,
        name: a.name,
        cnpj: a.cnpj,
        status: a.status,
        created_at: a.created_at,
        owner_email: ownerEmail.get(a.id as string) ?? null,
        coupon_code: coupon?.status === "ACTIVE" ? coupon.code : null,
        sellers_active: own.filter((l) => l.status === "active").length,
        sellers_pending: own.filter((l) => l.status === "pending").length,
      };
    }),
  });
}

async function actionCreate(db: SupabaseClient, body: Record<string, unknown>, actorId: string): Promise<Response> {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const cnpj = typeof body.cnpj === "string" ? body.cnpj.replace(/\D/g, "") : "";
  if (name.length < 2 || name.length > 120) return fail("Informe o nome da agência.");
  if (cnpj && cnpj.length !== 14) return fail("CNPJ precisa ter 14 dígitos.");
  if (!isEmail(body.owner_email)) return fail("E-mail do dono inválido.");
  const email = body.owner_email.trim().toLowerCase();

  const { data: existingId, error: lookErr } = await db.rpc("bo_user_id_by_email", { p_email: email });
  if (lookErr) return fail(lookErr.message, 500);

  let ownerId: string;
  let accessUrl: string | null = null;

  if (existingId) {
    // Conta que já existe só vira agência se estiver vazia (contas separadas).
    const bloqueio = await bloqueioParaAgencia(db, existingId as string);
    if (bloqueio) return fail(bloqueio, 409);
    ownerId = existingId as string;
  } else {
    // Conta nova: o link de convite cria o usuário e leva para definir a senha.
    // `generateLink` não manda e-mail (o template do Supabase é em inglês);
    // mandamos o nosso, e o link também volta para a tela.
    const { data: link, error: linkErr } = await db.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: `${appUrl()}/reset-password` },
    });
    if (linkErr || !link?.user) return fail(linkErr?.message ?? "Não foi possível criar a conta.", 500);
    ownerId = link.user.id;
    accessUrl = link.properties?.action_link ?? null;
  }

  const agency = await provisionar(db, { ownerUserId: ownerId, name, cnpj: cnpj || null, actorUserId: actorId });
  await liberarNoPiloto(db, ownerId, actorId);

  const emailSent = accessUrl
    ? await sendEmail(email, `Sua conta de agência no TikTally`, [
        `A agência ${name} já está no TikTally.`,
        "Defina a sua senha para entrar. Na sua conta você vê a carteira de sellers e convida os seus clientes.",
      ], { label: "Definir senha", url: accessUrl })
    : await sendEmail(email, `Sua conta virou conta de agência no TikTally`, [
        `A sua conta agora é a da agência ${name}.`,
        "Entre com o seu login de sempre. A tela inicial passa a ser a carteira de sellers.",
      ], { label: "Entrar", url: `${appUrl()}/auth` });

  return ok({
    agency: { ...agency, owner_email: email },
    new_account: !existingId,
    access_url: accessUrl,
    email_sent: emailSent,
  });
}

async function actionSetStatus(db: SupabaseClient, body: Record<string, unknown>, actorId: string): Promise<Response> {
  const id = typeof body.agency_id === "string" ? body.agency_id : "";
  const status = body.status;
  if (!id) return fail("agency_id é obrigatório.");
  if (status !== "active" && status !== "suspended") return fail("status inválido.");
  const { data, error } = await db.from("agencies").update({ status, updated_at: new Date().toISOString() }).eq("id", id).select("id, status").maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail("Agência não encontrada.", 404);
  await audit(db, { agency_id: id, actor_user_id: actorId, action: `agency.${status === "active" ? "activate" : "suspend"}` });
  return ok(data);
}

// ─────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Método não suportado", 405);

  try {
    const db = adminClient();

    // ── Admin gate ──
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token || token === authHeader) return fail("Não autenticado", 401);

    const { data: userData, error: userErr } = await db.auth.getUser(token);
    if (userErr || !userData?.user) return fail("Token inválido ou expirado", 401);

    const { data: profile } = await db.from("profiles").select("is_admin").eq("id", userData.user.id).maybeSingle();
    if (!profile?.is_admin) return fail("Acesso restrito a administradores", 403);
    const actorId = userData.user.id;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "");

    switch (action) {
      case "list_agencies":
        return await actionList(db);
      case "create_agency":
        return await actionCreate(db, body, actorId);
      case "set_status":
        return await actionSetStatus(db, body, actorId);
      default:
        return fail(`Ação desconhecida: ${action || "(vazia)"}`, 400);
    }
  } catch (err) {
    console.error("[bo-agencies] erro:", err);
    return fail((err as Error)?.message ?? "Erro interno", 500);
  }
});
