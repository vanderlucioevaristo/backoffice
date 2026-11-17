-- Parâmetro para exibir ou ocultar o valor estimado do frete na visualização de cada produto na loja
ALTER TABLE empresas ADD COLUMN mostrar_frete_vitrine INTEGER NOT NULL DEFAULT 1;
