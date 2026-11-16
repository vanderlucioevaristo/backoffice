-- Configurações de recebimento Nubank (Pix BR Code, Link de Cobrança e API NuPay) na empresa
ALTER TABLE empresas ADD COLUMN nubank_pix_ativo INTEGER NOT NULL DEFAULT 1;
ALTER TABLE empresas ADD COLUMN nubank_link_ativo INTEGER NOT NULL DEFAULT 1;
ALTER TABLE empresas ADD COLUMN nubank_chave_pix TEXT;
ALTER TABLE empresas ADD COLUMN nubank_cidade_pix TEXT DEFAULT 'SAO PAULO';
ALTER TABLE empresas ADD COLUMN nubank_link_padrao TEXT;
ALTER TABLE empresas ADD COLUMN nupay_merchant_key TEXT;
ALTER TABLE empresas ADD COLUMN nupay_merchant_token TEXT;

-- Campos de pagamento Nubank nos pedidos
ALTER TABLE loja_pedidos ADD COLUMN forma_pagamento TEXT DEFAULT 'PIX_NUBANK';
ALTER TABLE loja_pedidos ADD COLUMN pagamento_status TEXT NOT NULL DEFAULT 'PENDENTE';
ALTER TABLE loja_pedidos ADD COLUMN nubank_pix_copia_cola TEXT;
ALTER TABLE loja_pedidos ADD COLUMN nubank_link_pagamento TEXT;
