import { onlyDigits, validCNPJ, validEmail } from './validate.ts';

const ITERATIONS = 100_000;
const enc = new TextEncoder();

const toB64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));

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
