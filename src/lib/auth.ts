import { env } from 'cloudflare:workers';

export const db = () => (env as any).DB as D1Database;

const ITERATIONS = 100_000; // limite máximo do PBKDF2 no Cloudflare Workers
const enc = new TextEncoder();

const toB64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toHex = (buf: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(buf as ArrayBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, it, salt, hash] = stored.split('$');
  if (alg !== 'pbkdf2') return false;
  const calc = new Uint8Array(await pbkdf2(password, fromB64(salt), Number(it)));
  const expected = fromB64(hash);
  if (calc.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < calc.length; i++) diff |= calc[i] ^ expected[i];
  return diff === 0;
}

// Hash falso usado para igualar o tempo de resposta quando o usuário não existe.
export const DUMMY_HASH = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

async function sha256(s: string) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

export const SESSION_COOKIE = 'sid';
const SESSION_DAYS = 7;

export async function createSession(usuarioId: number, empresaId: number) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const expira = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  await db()
    .prepare('INSERT INTO sessoes (token_hash, usuario_id, empresa_id, expira_em) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), usuarioId, empresaId, expira)
    .run();
  return { token, maxAge: SESSION_DAYS * 86400 };
}

export async function destroySession(token: string) {
  await db().prepare('DELETE FROM sessoes WHERE token_hash = ?').bind(await sha256(token)).run();
}

export type SessionUser = {
  id: number;
  nome: string;
  login: string;
  perfil: 'admin' | 'usuario';
  empresaId: number;
  empresaNome: string;
  empresaCodigo: string;
};

export async function getSessionUser(token: string): Promise<SessionUser | null> {
  const row = await db()
    .prepare(
      `SELECT u.id, u.nome, u.login, u.perfil, e.id AS empresaId,
              COALESCE(e.nome_fantasia, e.razao_social) AS empresaNome, e.codigo AS empresaCodigo
         FROM sessoes s
         JOIN usuarios u ON u.id = s.usuario_id AND u.empresa_id = s.empresa_id AND u.ativo = 1
         JOIN empresas e ON e.id = s.empresa_id AND e.ativa = 1
        WHERE s.token_hash = ? AND s.expira_em > ?`,
    )
    .bind(await sha256(token), new Date().toISOString())
    .first<SessionUser>();
  return row ?? null;
}

export function signupAllowed() {
  return String((env as any).ALLOW_SIGNUP ?? 'true') === 'true';
}
