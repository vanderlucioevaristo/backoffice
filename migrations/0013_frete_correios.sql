-- Campos de peso e dimensões no cadastro de produtos para cálculo de frete via Correios
ALTER TABLE produtos ADD COLUMN peso_kg REAL NOT NULL DEFAULT 0.3;
ALTER TABLE produtos ADD COLUMN comprimento_cm REAL NOT NULL DEFAULT 16;
ALTER TABLE produtos ADD COLUMN altura_cm REAL NOT NULL DEFAULT 5;
ALTER TABLE produtos ADD COLUMN largura_cm REAL NOT NULL DEFAULT 11;
ALTER TABLE produtos ADD COLUMN formato_correios INTEGER NOT NULL DEFAULT 1;

-- CEP de origem da empresa para cálculo de frete nos Correios
ALTER TABLE empresas ADD COLUMN cep_origem TEXT DEFAULT '01001000';

-- Dados de frete gravados nos pedidos
ALTER TABLE loja_pedidos ADD COLUMN valor_frete REAL NOT NULL DEFAULT 0;
ALTER TABLE loja_pedidos ADD COLUMN frete_modalidade TEXT;
ALTER TABLE loja_pedidos ADD COLUMN frete_prazo_dias INTEGER;
ALTER TABLE loja_pedidos ADD COLUMN cep_entrega TEXT;
