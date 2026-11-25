-- Tabela para contabilizar quantas pessoas distintas inseriram cada produto no carrinho (intenção de compra por produto)
CREATE TABLE IF NOT EXISTS loja_metricas_carrinho_clientes (
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  parceiro_id INTEGER NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
  vezes INTEGER NOT NULL DEFAULT 1,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, produto_id, parceiro_id)
);
