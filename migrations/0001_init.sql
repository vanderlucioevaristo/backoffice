-- Multi-tenant: toda tabela de negócio carrega empresa_id e TODA consulta filtra por ele.

CREATE TABLE empresas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo        TEXT NOT NULL UNIQUE,          -- informado no login (slug)
  razao_social  TEXT NOT NULL,
  nome_fantasia TEXT,
  cnpj          TEXT,
  ativa         INTEGER NOT NULL DEFAULT 1,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id    INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  login         TEXT NOT NULL,
  nome          TEXT NOT NULL,
  email         TEXT,
  cpf           TEXT,
  telefone      TEXT,
  celular       TEXT,
  cargo         TEXT,
  perfil        TEXT NOT NULL DEFAULT 'usuario' CHECK (perfil IN ('admin','usuario')),
  ativo         INTEGER NOT NULL DEFAULT 1,
  senha_hash    TEXT NOT NULL,
  ultimo_acesso TEXT,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, login)
);

CREATE TABLE sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  expira_em  TEXT NOT NULL,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cadastro unificado de clientes e fornecedores
CREATE TABLE parceiros (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id    INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo_pessoa   TEXT NOT NULL CHECK (tipo_pessoa IN ('F','J')),
  eh_cliente    INTEGER NOT NULL DEFAULT 0,
  eh_fornecedor INTEGER NOT NULL DEFAULT 0,
  nome          TEXT NOT NULL,                 -- nome ou razão social
  nome_fantasia TEXT,
  documento     TEXT,                          -- CPF ou CNPJ (somente dígitos)
  rg_ie         TEXT,                          -- RG (PF) ou Inscrição Estadual (PJ)
  email         TEXT,
  telefone      TEXT,
  celular       TEXT,
  contato       TEXT,
  cep           TEXT,
  logradouro    TEXT,
  numero        TEXT,
  complemento   TEXT,
  bairro        TEXT,
  cidade        TEXT,
  uf            TEXT,
  observacoes   TEXT,
  ativo         INTEGER NOT NULL DEFAULT 1,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (eh_cliente = 1 OR eh_fornecedor = 1)
);
CREATE INDEX idx_parceiros_empresa ON parceiros(empresa_id, nome);
CREATE UNIQUE INDEX idx_parceiros_doc ON parceiros(empresa_id, documento) WHERE documento IS NOT NULL AND documento <> '';
