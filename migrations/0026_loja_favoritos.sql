-- Tabela de produtos favoritados pelos clientes na loja virtual
CREATE TABLE IF NOT EXISTS loja_favoritos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  parceiro_id INTEGER NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
  produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, parceiro_id, produto_id)
);
