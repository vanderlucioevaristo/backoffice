-- Personalização da loja virtual de cada empresa
ALTER TABLE empresas ADD COLUMN loja_nome TEXT;
ALTER TABLE empresas ADD COLUMN loja_logo TEXT;           -- URL ou Data-URL (base64/SVG) da logo
ALTER TABLE empresas ADD COLUMN cor_primaria TEXT NOT NULL DEFAULT '#2563eb';
ALTER TABLE empresas ADD COLUMN cor_secundaria TEXT NOT NULL DEFAULT '#111827';
ALTER TABLE empresas ADD COLUMN cor_fundo TEXT NOT NULL DEFAULT '#f4f6f9';
ALTER TABLE empresas ADD COLUMN cor_texto TEXT NOT NULL DEFAULT '#1c2430';

-- Senha do cliente (no próprio cadastro unificado de parceiros) para acesso à loja
ALTER TABLE parceiros ADD COLUMN senha_hash TEXT;

-- Sessões de clientes autenticados na loja virtual
CREATE TABLE sessoes_clientes (
  token_hash   TEXT PRIMARY KEY,
  parceiro_id  INTEGER NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
  empresa_id   INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  expira_em    TEXT NOT NULL,
  criado_em    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sc_parceiro ON sessoes_clientes(empresa_id, parceiro_id);

-- Carrinho de compras do cliente na loja
CREATE TABLE loja_carrinho (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id   INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  parceiro_id  INTEGER NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
  produto_id   INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  quantidade   REAL NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  criado_em    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, parceiro_id, produto_id)
);

-- Pedidos realizados pelos clientes na loja
CREATE TABLE loja_pedidos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id   INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  parceiro_id  INTEGER NOT NULL REFERENCES parceiros(id),
  valor_total  REAL NOT NULL DEFAULT 0,
  observacoes  TEXT,
  criado_em    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_lp_empresa ON loja_pedidos(empresa_id, id DESC);

CREATE TABLE loja_pedidos_itens (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  pedido_id      INTEGER NOT NULL REFERENCES loja_pedidos(id) ON DELETE CASCADE,
  produto_id     INTEGER NOT NULL REFERENCES produtos(id),
  quantidade     REAL NOT NULL,
  preco_unitario REAL NOT NULL,
  subtotal       REAL NOT NULL
);
