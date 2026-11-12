export const onlyDigits = (s: string) => s.replace(/\D/g, '');
export const cleanDoc = (s: string) => s.toUpperCase().replace(/[^0-9A-Z]/g, '');

export function validCPF(v: string) {
  const d = onlyDigits(v);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function validCNPJ(v: string, novoFormato = false) {
  if (novoFormato) {
    const c = cleanDoc(v);
    if (c.length !== 14 || /^([0-9A-Z])\1+$/.test(c)) return false;
    // Novo formato do CNPJ (IN RFB nº 2.229/2024): 12 posições alfanuméricas (raiz + ordem) e 2 dígitos verificadores numéricos
    return /^[0-9A-Z]{12}\d{2}$/.test(c);
  }
  const d = cleanDoc(v);
  if (d.length !== 14 || !/^\d{14}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * w[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export const UNIDADES = ['UN', 'PC', 'CX', 'KG', 'G', 'LT', 'ML', 'MT', 'M2', 'M3', 'PAR', 'KIT', 'FD', 'RL'];

export function parseNum(v: unknown, def = 0): number {
  if (v === null || v === undefined) return def;
  const s = String(v).trim();
  if (!s) return def;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : def;
}

export function formatMoney(n: number | null | undefined): string {
  return Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatQty(n: number | null | undefined): string {
  return Number(n ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

export function formatDoc(d: string | null | undefined) {
  if (!d) return '';
  const c = cleanDoc(d);
  if (c.length === 11 && /^\d{11}$/.test(c)) return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (c.length === 14) return c.replace(/([0-9A-Z]{2})([0-9A-Z]{3})([0-9A-Z]{3})([0-9A-Z]{4})([0-9A-Z]{2})/, '$1.$2.$3/$4-$5');
  return d;
}

/** Lê um campo de texto do FormData, com trim; vazio vira ''. */
export const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? '').trim().slice(0, max);
