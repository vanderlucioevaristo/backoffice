-- Notas Fiscais de Entrada (compra de fornecedor)
CREATE TABLE notas_entrada (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id      INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  fornecedor_id   INTEGER NOT NULL REFERENCES parceiros(id),
  numero          TEXT NOT NULL,
  serie           TEXT,
  chave_acesso    TEXT,                          -- 44 dígitos (opcional)
  data_emissao    TEXT NOT NULL,                 -- YYYY-MM-DD
  data_entrada    TEXT NOT NULL,                 -- YYYY-MM-DD
  valor_produtos  REAL NOT NULL DEFAULT 0,
  valor_frete     REAL NOT NULL DEFAULT 0,
  valor_desconto  REAL NOT NULL DEFAULT 0,
  valor_outros    REAL NOT NULL DEFAULT 0,
  valor_total     REAL NOT NULL DEFAULT 0,
  observacoes     TEXT,
  usuario_id      INTEGER REFERENCES usuarios(id),
  criado_em       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_ne_unica ON notas_entrada(empresa_id, fornecedor_id, numero, COALESCE(serie, ''));
CREATE INDEX idx_ne_empresa_data ON notas_entrada(empresa_id, data_entrada DESC);

-- Itens da Nota Fiscal de Entrada
CREATE TABLE notas_entrada_itens (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id        INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nota_id           INTEGER NOT NULL REFERENCES notas_entrada(id) ON DELETE CASCADE,
  produto_id        INTEGER NOT NULL REFERENCES produtos(id),
  quantidade        REAL NOT NULL CHECK (quantidade > 0),
  valor_unitario    REAL NOT NULL CHECK (valor_unitario >= 0),
  valor_total       REAL NOT NULL DEFAULT 0,
  novo_preco_venda  REAL                           -- se informado, atualizou preco_venda do produto
);
CREATE INDEX idx_nei_nota ON notas_entrada_itens(empresa_id, nota_id);
CREATE INDEX idx_nei_produto ON notas_entrada_itens(empresa_id, produto_id);

-- Kardex / histórico de movimentações de estoque
CREATE TABLE estoque_movimentacoes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id      INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  produto_id      INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL CHECK (tipo IN ('E','S','A')), -- E=Entrada, S=Saída, A=Ajuste
  origem          TEXT NOT NULL,                 -- 'NF_ENTRADA', 'CANCEL_NF', 'AJUSTE_MANUAL', 'VENDA'
  referencia_id   INTEGER,                       -- id da nota ou documento origem
  quantidade      REAL NOT NULL,                 -- positiva na entrada, negativa na saída
  saldo_anterior  REAL NOT NULL,
  saldo_posterior REAL NOT NULL,
  custo_unitario  REAL,
  observacao      TEXT,
  usuario_id      INTEGER REFERENCES usuarios(id),
  criado_em       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_em_produto ON estoque_movimentacoes(empresa_id, produto_id, id DESC);
