-- Integração de pagamento com a InfinitePay (Checkout Integrado: Cartão até 12x e Pix)
ALTER TABLE empresas ADD COLUMN infinitepay_ativo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE empresas ADD COLUMN infinitepay_handle TEXT;
ALTER TABLE empresas ADD COLUMN infinitepay_api_key TEXT;

ALTER TABLE loja_pedidos ADD COLUMN infinitepay_link_pagamento TEXT;
ALTER TABLE loja_pedidos ADD COLUMN infinitepay_slug TEXT;
ALTER TABLE loja_pedidos ADD COLUMN infinitepay_transaction_nsu TEXT;
