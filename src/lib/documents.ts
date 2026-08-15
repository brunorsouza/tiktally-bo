/**
 * CPF e CNPJ: máscara enquanto digita e conferência do dígito verificador.
 *
 * A validação existe DE NOVO no `bo-fiscal` — e o servidor é quem manda. Aqui
 * ela serve só pra dizer "confere esse número" enquanto a pessoa ainda está no
 * campo, em vez de depois de uma ida ao servidor. Duas cópias porque a edge
 * function roda em Deno e não importa de `src/`; se a regra mudar (não muda,
 * é fórmula fechada), as duas mudam juntas.
 */

export const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/** Máscara progressiva: formata o que já foi digitado, sem exigir o campo cheio. */
export function maskCnpj(raw: string): string {
  const d = soDigitos(raw).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function maskCpf(raw: string): string {
  const d = soDigitos(raw).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

export function cpfValido(raw: string): boolean {
  const cpf = soDigitos(raw);
  // Repetido (111.111.111-11) fecha a conta mas não é um CPF real.
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(cpf[i]) * (ate + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10]);
}

export function cnpjValido(raw: string): boolean {
  const cnpj = soDigitos(raw);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const dv = (ate: number) => {
    let soma = 0;
    let peso = ate - 7;
    for (let i = 0; i < ate; i++) {
      soma += Number(cnpj[i]) * peso;
      peso = peso - 1 < 2 ? 9 : peso - 1;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(cnpj[12]) && dv(13) === Number(cnpj[13]);
}

/**
 * Senha inicial pra conta criada pelo admin.
 *
 * `crypto.getRandomValues` e não `Math.random`: esta senha é a credencial de
 * acesso de alguém, e `Math.random` é previsível. O alfabeto tira 0/O/1/l/I —
 * a senha vai ser lida em voz alta ou copiada à mão de algum lugar.
 */
export function gerarSenha(tamanho = 16): string {
  const alfabeto = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789@#$%";
  const bytes = new Uint32Array(tamanho);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}
