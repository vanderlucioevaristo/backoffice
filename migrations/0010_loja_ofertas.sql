-- Cadastro de ofertas em destaque para o carrossel da loja virtual
CREATE TABLE IF NOT EXISTS loja_ofertas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id    INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  produto_id    INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  titulo_oferta TEXT,
  preco_oferta  REAL    NOT NULL DEFAULT 0 CHECK (preco_oferta >= 0),
  ordem         INTEGER NOT NULL DEFAULT 0,
  ativa         INTEGER NOT NULL DEFAULT 1,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, produto_id)
);
CREATE INDEX IF NOT EXISTS idx_loja_ofertas_emp ON loja_ofertas(empresa_id, ativa, ordem, id DESC);
