import { onlyDigits, validCNPJ, validEmail } from './validate.ts';

const ITERATIONS = 100_000;
const enc = new TextEncoder();

export const IDLE_TIMEOUT_SEC = 5 * 60; // 5 minutos (300 segundos)
export const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_SEC * 1000;

const toB64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
const toHex = (buf: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(buf as ArrayBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function sha256Hex(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

async function hashSenhaPbkdf2(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    key,
    256,
  );
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export interface DadosCadastroEmpresa {
  codigo: string;
  razao: string;
  fantasia?: string;
  cnpj?: string;
  nome: string;
  email?: string;
  login: string;
  senha: string;
}

export interface ResultadoCadastroEmpresa {
  ok: boolean;
  erro?: string;
  empresaId?: number;
  usuarioId?: number;
}

export async function registrarEmpresaComUsuario(
  database: {
    prepare(query: string): {
      bind(...values: unknown[]): {
        first<T = any>(colName?: string): Promise<T | null>;
      };
    };
  },
  dados: DadosCadastroEmpresa,
): Promise<ResultadoCadastroEmpresa> {
  const codigo = String(dados.codigo ?? '').trim().toLowerCase().slice(0, 30);
  const razao = String(dados.razao ?? '').trim().slice(0, 200);
  const fantasia = String(dados.fantasia ?? '').trim().slice(0, 200);
  const cnpj = onlyDigits(String(dados.cnpj ?? '').trim());
  const nome = String(dados.nome ?? '').trim().slice(0, 200);
  const email = String(dados.email ?? '').trim().slice(0, 200);
  const login = String(dados.login ?? '').trim().toLowerCase().slice(0, 40);
  const senha = String(dados.senha ?? '');

  if (!/^[a-z0-9][a-z0-9-]{2,29}$/.test(codigo)) {
    return { ok: false, erro: 'Código da empresa: 3 a 30 caracteres (letras minúsculas, números e hífen).' };
  }
  if (!razao || !nome || !login) {
    return { ok: false, erro: 'Preencha os campos obrigatórios.' };
  }
  if (cnpj && !validCNPJ(cnpj)) {
    return { ok: false, erro: 'CNPJ inválido.' };
  }
  if (email && !validEmail(email)) {
    return { ok: false, erro: 'E-mail inválido.' };
  }
  if (senha.length < 8) {
    return { ok: false, erro: 'A senha deve ter pelo menos 8 caracteres.' };
  }

  const exists = await database.prepare('SELECT 1 FROM empresas WHERE codigo = ?').bind(codigo).first();
  if (exists) {
    return { ok: false, erro: 'Este código de empresa já está em uso.' };
  }

  const hash = await hashSenhaPbkdf2(senha);
  const emp = await database
    .prepare('INSERT INTO empresas (codigo, razao_social, nome_fantasia, cnpj) VALUES (?,?,?,?) RETURNING id')
    .bind(codigo, razao, fantasia || null, cnpj || null)
    .first<{ id: number }>();

  const usr = await database
    .prepare("INSERT INTO usuarios (empresa_id, login, nome, email, perfil, senha_hash) VALUES (?,?,?,?, 'admin', ?) RETURNING id")
    .bind(emp!.id, login, nome, email || null, hash)
    .first<{ id: number }>();

  return {
    ok: true,
    empresaId: emp!.id,
    usuarioId: usr!.id,
  };
}

export async function criarSessaoUsuario(
  database: any,
  usuarioId: number,
  empresaId: number,
  nowMs = Date.now(),
) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const expira = new Date(nowMs + IDLE_TIMEOUT_MS).toISOString();
  await database
    .prepare('INSERT INTO sessoes (token_hash, usuario_id, empresa_id, expira_em) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), usuarioId, empresaId, expira)
    .run();
  return { token, maxAge: IDLE_TIMEOUT_SEC };
}

export async function validarERenovarSessaoUsuario(
  database: any,
  token: string,
  nowMs = Date.now(),
) {
  const hash = await sha256Hex(token);
  const agoraIso = new Date(nowMs).toISOString();

  const row = await database
    .prepare(
      `SELECT u.id, u.nome, u.login, u.perfil, e.id AS empresaId,
              COALESCE(e.nome_fantasia, e.razao_social) AS empresaNome, e.codigo AS empresaCodigo
         FROM sessoes s
         JOIN usuarios u ON u.id = s.usuario_id AND u.empresa_id = s.empresa_id AND u.ativo = 1
         JOIN empresas e ON e.id = s.empresa_id AND e.ativa = 1
        WHERE s.token_hash = ? AND s.expira_em > ?`,
    )
    .bind(hash, agoraIso)
    .first();

  if (!row) {
    // Remove sessão vencida (> 5 minutos de inatividade)
    await database.prepare('DELETE FROM sessoes WHERE token_hash = ?').bind(hash).run();
    return null;
  }

  // Renova o prazo de inatividade por mais 5 minutos a partir desta atividade
  const novaExpiracao = new Date(nowMs + IDLE_TIMEOUT_MS).toISOString();
  await database
    .prepare('UPDATE sessoes SET expira_em = ? WHERE token_hash = ?')
    .bind(novaExpiracao, hash)
    .run();

  return row;
}

export async function criarSessaoClienteLoja(
  database: any,
  parceiroId: number,
  empresaId: number,
  nowMs = Date.now(),
) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const expira = new Date(nowMs + IDLE_TIMEOUT_MS).toISOString();
  await database
    .prepare('INSERT INTO sessoes_clientes (token_hash, parceiro_id, empresa_id, expira_em) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), parceiroId, empresaId, expira)
    .run();
  return { token, maxAge: IDLE_TIMEOUT_SEC };
}

export async function validarERenovarSessaoClienteLoja(
  database: any,
  token: string,
  empresaCodigo: string,
  nowMs = Date.now(),
) {
  const hash = await sha256Hex(token);
  const agoraIso = new Date(nowMs).toISOString();
  const row = await database
    .prepare(
      `SELECT p.id, p.nome, p.documento, p.email, e.id AS empresaId, e.codigo AS empresaCodigo
         FROM sessoes_clientes sc
         JOIN parceiros p ON p.id = sc.parceiro_id AND p.empresa_id = sc.empresa_id AND p.ativo = 1 AND p.eh_cliente = 1
         JOIN empresas e ON e.id = sc.empresa_id AND e.ativa = 1
        WHERE sc.token_hash = ? AND sc.expira_em > ? AND e.codigo = ?`,
    )
    .bind(hash, agoraIso, empresaCodigo.toLowerCase())
    .first();

  if (!row) {
    // Remove sessão vencida do cliente na loja (> 5 minutos de inatividade)
    await database.prepare('DELETE FROM sessoes_clientes WHERE token_hash = ?').bind(hash).run();
    return null;
  }

  // Renova por mais 5 minutos a sessão ativa do cliente na loja
  const novaExpiracao = new Date(nowMs + IDLE_TIMEOUT_MS).toISOString();
  await database
    .prepare('UPDATE sessoes_clientes SET expira_em = ? WHERE token_hash = ?')
    .bind(novaExpiracao, hash)
    .run();

  return row;
}
