-- Histórico de notificações de e-mail enviadas aos clientes
CREATE TABLE IF NOT EXISTS email_notificacoes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id      INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  pedido_id       INTEGER REFERENCES loja_pedidos(id) ON DELETE CASCADE,
  destinatario    TEXT    NOT NULL,
  assunto         TEXT    NOT NULL,
  corpo_html      TEXT    NOT NULL,
  corpo_texto     TEXT    NOT NULL,
  status_anterior TEXT,
  status_novo     TEXT,
  status_envio    TEXT    NOT NULL DEFAULT 'ENVIADO',
  detalhe         TEXT,
  criado_em       TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_email_notif_pedido ON email_notificacoes(empresa_id, pedido_id, id DESC);
