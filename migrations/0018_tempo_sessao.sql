-- Parâmetro nas configurações da loja para definir o tempo de queda do login por inatividade (em minutos)
ALTER TABLE empresas ADD COLUMN tempo_sessao_minutos INTEGER NOT NULL DEFAULT 10;
