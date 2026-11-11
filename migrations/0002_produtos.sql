CREATE TABLE produtos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id      INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo          TEXT,                          -- SKU / código interno
  codigo_barras   TEXT,                          -- EAN / GTIN
  nome            TEXT NOT NULL,
  descricao       TEXT,
  categoria       TEXT,
  marca           TEXT,
  unidade         TEXT NOT NULL DEFAULT 'UN',    -- UN, CX, KG, MT, LT, PC...
  ncm             TEXT,
  preco_custo     REAL NOT NULL DEFAULT 0,       -- último preço de compra / custo (NF)
  preco_venda     REAL NOT NULL DEFAULT 0,
  estoque_atual   REAL NOT NULL DEFAULT 0,
  estoque_minimo  REAL NOT NULL DEFAULT 0,
  localizacao     TEXT,                          -- corredor / prateleira
  observacoes     TEXT,
  ativo           INTEGER NOT NULL DEFAULT 1,
  criado_em       TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_produtos_empresa ON produtos(empresa_id, nome);
CREATE UNIQUE INDEX idx_produtos_codigo ON produtos(empresa_id, codigo) WHERE codigo IS NOT NULL AND codigo <> '';

-- Vínculo N:N entre produtos e fornecedores (parceiros com eh_fornecedor = 1)
CREATE TABLE produtos_fornecedores (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id        INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  produto_id        INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  fornecedor_id     INTEGER NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
  codigo_fornecedor TEXT,                        -- código do produto na NF / catálogo do fornecedor
  ultimo_preco      REAL,                        -- último preço de compra praticado com este fornecedor
  ultimo_nf         TEXT,                        -- número da última NF de compra
  data_ultima_nf    TEXT,                        -- data da última NF (YYYY-MM-DD)
  preferencial      INTEGER NOT NULL DEFAULT 0,
  criado_em         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, produto_id, fornecedor_id)
);
CREATE INDEX idx_pf_produto ON produtos_fornecedores(empresa_id, produto_id);
CREATE INDEX idx_pf_fornecedor ON produtos_fornecedores(empresa_id, fornecedor_id);
