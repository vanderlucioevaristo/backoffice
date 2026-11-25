-- Métricas de Dashboard da Loja: visualizações de produtos, inserções no carrinho, categorias mais consultadas,
-- média de permanência no site (anônima) e média de intervalo de retorno ao site.
ALTER TABLE produtos ADD COLUMN visualizacoes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE produtos ADD COLUMN insercoes_carrinho INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS loja_metricas_categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL,
  consultas INTEGER NOT NULL DEFAULT 0,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, categoria)
);

CREATE TABLE IF NOT EXISTS loja_visitas_metricas (
  visita_token TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  duracao_segundos INTEGER NOT NULL DEFAULT 0,
  intervalo_retorno_segundos INTEGER,
  iniciado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
