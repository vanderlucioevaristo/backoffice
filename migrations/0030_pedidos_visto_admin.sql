-- Alerta de novos pedidos ainda não vistos pelo administrador no Backoffice (mesmo esquema da Agenda)
ALTER TABLE loja_pedidos ADD COLUMN visto_admin INTEGER NOT NULL DEFAULT 1;
