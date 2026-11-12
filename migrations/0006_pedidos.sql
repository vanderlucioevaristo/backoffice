-- Status e acompanhamento dos pedidos de clientes (loja virtual e balcão/interno)
ALTER TABLE loja_pedidos ADD COLUMN status TEXT NOT NULL DEFAULT 'novo'; -- 'novo', 'separacao', 'entregue', 'cancelado'
ALTER TABLE loja_pedidos ADD COLUMN origem TEXT NOT NULL DEFAULT 'LOJA'; -- 'LOJA' ou 'INTERNO'
ALTER TABLE loja_pedidos ADD COLUMN valor_desconto REAL NOT NULL DEFAULT 0;
ALTER TABLE loja_pedidos ADD COLUMN atualizado_em TEXT;
