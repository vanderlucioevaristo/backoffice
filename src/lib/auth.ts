import { env } from 'cloudflare:workers';
import {
  IDLE_TIMEOUT_SEC,
  IDLE_TIMEOUT_MS,
  criarSessaoUsuario,
  validarERenovarSessaoUsuario,
  criarSessaoClienteLoja,
  validarERenovarSessaoClienteLoja,
} from './empresa-service';

export { IDLE_TIMEOUT_SEC, IDLE_TIMEOUT_MS };

export const db = (): D1Database => {
  const d = ((env as any)?.DB ?? (env as any)?.backoffice) as D1Database | undefined;
  if (!d) {
    throw new Error('Binding D1 (DB) não encontrado no Cloudflare Worker.');
  }
  return d;
};

let schemaReady = false;

export async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  try {
    const database = db();
    const tables = [
      `CREATE TABLE IF NOT EXISTS empresas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT NOT NULL UNIQUE,
        razao_social TEXT NOT NULL,
        nome_fantasia TEXT,
        cnpj TEXT,
        ativa INTEGER NOT NULL DEFAULT 1,
        criado_em TEXT NOT NULL DEFAULT (datetime('now')),
        loja_nome TEXT,
        loja_logo TEXT,
        cor_primaria TEXT NOT NULL DEFAULT '#2563eb',
        cor_secundaria TEXT NOT NULL DEFAULT '#111827',
        cor_fundo TEXT NOT NULL DEFAULT '#f4f6f9',
        cor_texto TEXT NOT NULL DEFAULT '#1c2430',
        rodape_sobre TEXT,
        rodape_telefone TEXT,
        rodape_whatsapp TEXT,
        rodape_email TEXT,
        rodape_horario TEXT,
        rodape_endereco TEXT,
        rodape_suporte TEXT,
        rodape_instagram TEXT,
        rodape_facebook TEXT,
        rodape_copyright TEXT,
        rodape_cor_fundo TEXT NOT NULL DEFAULT '#ffffff',
        rodape_cor_texto TEXT NOT NULL DEFAULT '#333333'
      )`,
      `CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        login TEXT NOT NULL,
        nome TEXT NOT NULL,
        email TEXT,
        cpf TEXT,
        telefone TEXT,
        celular TEXT,
        cargo TEXT,
        perfil TEXT NOT NULL DEFAULT 'usuario' CHECK (perfil IN ('admin','usuario')),
        ativo INTEGER NOT NULL DEFAULT 1,
        senha_hash TEXT NOT NULL,
        ultimo_acesso TEXT,
        criado_em TEXT NOT NULL DEFAULT (datetime('now')),
        atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (empresa_id, login)
      )`,
      `CREATE TABLE IF NOT EXISTS sessoes (
        token_hash TEXT PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        expira_em TEXT NOT NULL,
        criado_em TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS parceiros (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        tipo_pessoa TEXT NOT NULL CHECK (tipo_pessoa IN ('F','J')),
        eh_cliente INTEGER NOT NULL DEFAULT 0,
        eh_fornecedor INTEGER NOT NULL DEFAULT 0,
        nome TEXT NOT NULL,
        nome_fantasia TEXT,
        documento TEXT,
        rg_ie TEXT,
        email TEXT,
        telefone TEXT,
        celular TEXT,
        contato TEXT,
        cep TEXT,
        logradouro TEXT,
        numero TEXT,
        complemento TEXT,
        bairro TEXT,
        cidade TEXT,
        uf TEXT,
        observacoes TEXT,
        ativo INTEGER NOT NULL DEFAULT 1,
        senha_hash TEXT,
        criado_em TEXT NOT NULL DEFAULT (datetime('now')),
        atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK (eh_cliente = 1 OR eh_fornecedor = 1)
      )`,
      `CREATE TABLE IF NOT EXISTS produtos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        codigo TEXT,
        codigo_barras TEXT,
        nome TEXT NOT NULL,
        descricao TEXT,
        unidade TEXT NOT NULL DEFAULT 'UN',
        categoria TEXT,
        marca TEXT,
        ncm TEXT,
        preco_custo REAL NOT NULL DEFAULT 0,
        preco_venda REAL NOT NULL DEFAULT 0,
        estoque_atual REAL NOT NULL DEFAULT 0,
        estoque_minimo REAL NOT NULL DEFAULT 0,
        localizacao TEXT,
        observacoes TEXT,
        foto TEXT,
        ativo INTEGER NOT NULL DEFAULT 1,
        criado_em TEXT NOT NULL DEFAULT (datetime('now')),
        atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS produtos_fornecedores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
        fornecedor_id INTEGER NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
        codigo_no_fornecedor TEXT,
        ultimo_custo REAL,
        prazo_entrega_dias INTEGER,
        preferencial INTEGER NOT NULL DEFAULT 0,
        observacoes TEXT,
        criado_em TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (empresa_id, produto_id, fornecedor_id)
      )`,
      `CREATE TABLE IF NOT EXISTS notas_entrada (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        fornecedor_id INTEGER NOT NULL REFERENCES parceiros(id),
        numero TEXT NOT NULL,
        serie TEXT,
        chave_acesso TEXT,
        data_emissao TEXT NOT NULL,
        data_entrada TEXT NOT NULL DEFAULT ( substr(datetime('now'),1,10) ),
        valor_produtos REAL NOT NULL DEFAULT 0,
        valor_frete REAL NOT NULL DEFAULT 0,
        valor_desconto REAL NOT NULL DEFAULT 0,
        valor_outros REAL NOT NULL DEFAULT 0,
        valor_total REAL NOT NULL DEFAULT 0,
        observacoes TEXT,
        status TEXT NOT NULL DEFAULT 'CONFIRMADA' CHECK (status IN ('CONFIRMADA','CANCELADA')),
        usuario_id INTEGER REFERENCES usuarios(id),
        criado_em TEXT NOT NULL DEFAULT (datetime('now')),
        cancelado_em TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS notas_entrada_itens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        nota_id INTEGER NOT NULL REFERENCES notas_entrada(id) ON DELETE CASCADE,
        produto_id INTEGER NOT NULL REFERENCES produtos(id),
        quantidade REAL NOT NULL CHECK (quantidade > 0),
        valor_unitario REAL NOT NULL CHECK (valor_unitario >= 0),
        valor_desconto REAL NOT NULL DEFAULT 0,
        valor_total REAL NOT NULL DEFAULT 0,
        codigo_fornecedor TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS estoque_movimentacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
        tipo TEXT NOT NULL CHECK (tipo IN ('E','S','A')),
        origem TEXT NOT NULL,
        referencia_id INTEGER,
        quantidade REAL NOT NULL,
        saldo_anterior REAL NOT NULL,
        saldo_posterior REAL NOT NULL,
        custo_unitario REAL,
        observacao TEXT,
        usuario_id INTEGER REFERENCES usuarios(id),
        criado_em TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS sessoes_clientes (
        token_hash TEXT PRIMARY KEY,
        parceiro_id INTEGER NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
        empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        expira_em TEXT NOT NULL,
        criado_em TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS loja_carrinho (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        parceiro_id INTEGER NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
        produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
        quantidade REAL NOT NULL DEFAULT 1 CHECK (quantidade > 0),
        criado_em TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (empresa_id, parceiro_id, produto_id)
      )`,
      `CREATE TABLE IF NOT EXISTS loja_pedidos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        parceiro_id INTEGER NOT NULL REFERENCES parceiros(id),
        valor_total REAL NOT NULL DEFAULT 0,
        observacoes TEXT,
        criado_em TEXT NOT NULL DEFAULT (datetime('now')),
        status TEXT NOT NULL DEFAULT 'novo',
        origem TEXT NOT NULL DEFAULT 'LOJA',
        valor_desconto REAL NOT NULL DEFAULT 0,
        atualizado_em TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS loja_pedidos_itens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        pedido_id INTEGER NOT NULL REFERENCES loja_pedidos(id) ON DELETE CASCADE,
        produto_id INTEGER NOT NULL REFERENCES produtos(id),
        quantidade REAL NOT NULL,
        preco_unitario REAL NOT NULL,
        subtotal REAL NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS email_notificacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        pedido_id INTEGER REFERENCES loja_pedidos(id) ON DELETE CASCADE,
        destinatario TEXT NOT NULL,
        assunto TEXT NOT NULL,
        corpo_html TEXT NOT NULL,
        corpo_texto TEXT NOT NULL,
        status_anterior TEXT,
        status_novo TEXT,
        status_envio TEXT NOT NULL DEFAULT 'ENVIADO',
        detalhe TEXT,
        criado_em TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS loja_ofertas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
        titulo_oferta TEXT,
        preco_oferta REAL NOT NULL DEFAULT 0 CHECK (preco_oferta >= 0),
        ordem INTEGER NOT NULL DEFAULT 0,
        ativa INTEGER NOT NULL DEFAULT 1,
        inicio_em TEXT,
        fim_em TEXT,
        criado_em TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (empresa_id, produto_id)
      )`,
      `CREATE TABLE IF NOT EXISTS servicos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        nome TEXT NOT NULL,
        descricao TEXT,
        duracao_minutos INTEGER NOT NULL DEFAULT 30 CHECK (duracao_minutos >= 5),
        preco REAL NOT NULL DEFAULT 0 CHECK (preco >= 0),
        ativo INTEGER NOT NULL DEFAULT 1,
        criado_em TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS agendamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        parceiro_id INTEGER NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
        servico_id INTEGER NOT NULL REFERENCES servicos(id) ON DELETE CASCADE,
        data TEXT NOT NULL,
        hora_inicio TEXT NOT NULL,
        hora_fim TEXT NOT NULL,
        duracao_minutos INTEGER NOT NULL,
        preco REAL NOT NULL DEFAULT 0,
        observacoes TEXT,
        status TEXT NOT NULL DEFAULT 'AGENDADO' CHECK (status IN ('AGENDADO','CONFIRMADO','CONCLUIDO','CANCELADO')),
        visto_admin INTEGER NOT NULL DEFAULT 0,
        criado_em TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ];

    for (const sql of tables) {
      await database.prepare(sql).run();
    }

    // Garante colunas adicionadas em migrações incrementais caso o banco remoto tenha sido criado antes
    const alters = [
      "ALTER TABLE empresas ADD COLUMN loja_nome TEXT",
      "ALTER TABLE empresas ADD COLUMN loja_logo TEXT",
      "ALTER TABLE empresas ADD COLUMN cor_primaria TEXT NOT NULL DEFAULT '#2563eb'",
      "ALTER TABLE empresas ADD COLUMN cor_secundaria TEXT NOT NULL DEFAULT '#111827'",
      "ALTER TABLE empresas ADD COLUMN cor_fundo TEXT NOT NULL DEFAULT '#f4f6f9'",
      "ALTER TABLE empresas ADD COLUMN cor_texto TEXT NOT NULL DEFAULT '#1c2430'",
      "ALTER TABLE empresas ADD COLUMN rodape_sobre TEXT",
      "ALTER TABLE empresas ADD COLUMN rodape_telefone TEXT",
      "ALTER TABLE empresas ADD COLUMN rodape_whatsapp TEXT",
      "ALTER TABLE empresas ADD COLUMN rodape_email TEXT",
      "ALTER TABLE empresas ADD COLUMN rodape_horario TEXT",
      "ALTER TABLE empresas ADD COLUMN rodape_endereco TEXT",
      "ALTER TABLE empresas ADD COLUMN rodape_suporte TEXT",
      "ALTER TABLE empresas ADD COLUMN rodape_instagram TEXT",
      "ALTER TABLE empresas ADD COLUMN rodape_facebook TEXT",
      "ALTER TABLE empresas ADD COLUMN rodape_copyright TEXT",
      "ALTER TABLE empresas ADD COLUMN rodape_cor_fundo TEXT NOT NULL DEFAULT '#ffffff'",
      "ALTER TABLE empresas ADD COLUMN rodape_cor_texto TEXT NOT NULL DEFAULT '#333333'",
      "ALTER TABLE parceiros ADD COLUMN senha_hash TEXT",
      "ALTER TABLE parceiros ADD COLUMN cnpj_novo_formato INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE produtos ADD COLUMN foto TEXT",
      "ALTER TABLE loja_pedidos ADD COLUMN status TEXT NOT NULL DEFAULT 'novo'",
      "ALTER TABLE loja_pedidos ADD COLUMN origem TEXT NOT NULL DEFAULT 'LOJA'",
      "ALTER TABLE loja_pedidos ADD COLUMN valor_desconto REAL NOT NULL DEFAULT 0",
      "ALTER TABLE loja_pedidos ADD COLUMN atualizado_em TEXT",
      "ALTER TABLE loja_ofertas ADD COLUMN inicio_em TEXT",
      "ALTER TABLE loja_ofertas ADD COLUMN fim_em TEXT",
      "ALTER TABLE empresas ADD COLUMN agenda_ativa INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE empresas ADD COLUMN agenda_menu_texto TEXT NOT NULL DEFAULT 'Agenda'",
      "ALTER TABLE empresas ADD COLUMN agenda_inicio TEXT NOT NULL DEFAULT '08:00'",
      "ALTER TABLE empresas ADD COLUMN agenda_fim TEXT NOT NULL DEFAULT '18:00'",
      "ALTER TABLE empresas ADD COLUMN agenda_intervalo_min INTEGER NOT NULL DEFAULT 30",
      "ALTER TABLE empresas ADD COLUMN agenda_dias_semana TEXT NOT NULL DEFAULT '1,2,3,4,5'",
      "ALTER TABLE empresas ADD COLUMN agenda_datas_fechadas TEXT",
    ];
    for (const alt of alters) {
      await database.prepare(alt).run().catch(() => {});
    }

    schemaReady = true;
  } catch (e) {
    console.error('Erro ao garantir schema D1:', e);
  }
}

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

export async function createSession(usuarioId: number, empresaId: number) {
  return criarSessaoUsuario(db(), usuarioId, empresaId);
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
  return validarERenovarSessaoUsuario(db(), token);
}

export function signupAllowed() {
  return String((env as any).ALLOW_SIGNUP ?? 'true') === 'true';
}

export const CLIENT_SESSION_COOKIE = 'loja_sid';

export type SessionClient = {
  id: number;
  nome: string;
  documento: string | null;
  email: string | null;
  empresaId: number;
  empresaCodigo: string;
};

export async function createClientSession(parceiroId: number, empresaId: number) {
  return criarSessaoClienteLoja(db(), parceiroId, empresaId);
}

export async function destroyClientSession(token: string) {
  await db().prepare('DELETE FROM sessoes_clientes WHERE token_hash = ?').bind(await sha256(token)).run();
}

export async function getSessionClient(token: string, empresaCodigo: string): Promise<SessionClient | null> {
  return validarERenovarSessaoClienteLoja(db(), token, empresaCodigo);
}

export type LojaEmpresa = {
  id: number;
  codigo: string;
  nome: string;
  razao_social: string;
  cnpj: string | null;
  loja_logo: string | null;
  cor_primaria: string;
  cor_secundaria: string;
  cor_fundo: string;
  cor_texto: string;
  rodape_sobre: string | null;
  rodape_telefone: string | null;
  rodape_whatsapp: string | null;
  rodape_email: string | null;
  rodape_horario: string | null;
  rodape_endereco: string | null;
  rodape_suporte: string | null;
  rodape_instagram: string | null;
  rodape_facebook: string | null;
  rodape_copyright: string | null;
  rodape_cor_fundo: string;
  rodape_cor_texto: string;
  agenda_ativa: number;
  agenda_menu_texto: string;
  agenda_inicio: string;
  agenda_fim: string;
  agenda_intervalo_min: number;
  agenda_dias_semana: string;
  agenda_datas_fechadas: string | null;
};

export async function getLojaEmpresa(codigo: string): Promise<LojaEmpresa | null> {
  const row = await db()
    .prepare(
      `SELECT id, codigo, COALESCE(NULLIF(loja_nome,''), nome_fantasia, razao_social) AS nome,
              razao_social, cnpj,
              loja_logo, cor_primaria, cor_secundaria, cor_fundo, cor_texto,
              rodape_sobre, rodape_telefone, rodape_whatsapp, rodape_email,
              rodape_horario, rodape_endereco, rodape_suporte, rodape_instagram,
              rodape_facebook, rodape_copyright, rodape_cor_fundo, rodape_cor_texto,
              COALESCE(agenda_ativa, 0) AS agenda_ativa,
              COALESCE(NULLIF(agenda_menu_texto, ''), 'Agenda') AS agenda_menu_texto,
              COALESCE(agenda_inicio, '08:00') AS agenda_inicio,
              COALESCE(agenda_fim, '18:00') AS agenda_fim,
              COALESCE(agenda_intervalo_min, 30) AS agenda_intervalo_min,
              COALESCE(agenda_dias_semana, '1,2,3,4,5') AS agenda_dias_semana,
              agenda_datas_fechadas
         FROM empresas
        WHERE codigo = ? AND ativa = 1`,
    )
    .bind(codigo.toLowerCase())
    .first<LojaEmpresa>();
  return row ?? null;
}
