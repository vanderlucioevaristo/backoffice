-- Tabela para proteção contra ataques de força bruta (rate limiting) em logins e recuperação de senha
CREATE TABLE IF NOT EXISTS login_tentativas (
  chave TEXT PRIMARY KEY,
  falhas INTEGER NOT NULL DEFAULT 0,
  bloqueado_ate TEXT,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
