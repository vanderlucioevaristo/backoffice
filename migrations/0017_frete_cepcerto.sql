-- Parâmetros para escolher entre cálculo somente pelos Correios ou integração multi-fornecedor via CEP Certo
ALTER TABLE empresas ADD COLUMN frete_provedor TEXT NOT NULL DEFAULT 'CORREIOS';
ALTER TABLE empresas ADD COLUMN cepcerto_public_key TEXT NOT NULL DEFAULT 'pk_live_98e56b325596efba0c511533a46f05a3ceae960d091bc459';
