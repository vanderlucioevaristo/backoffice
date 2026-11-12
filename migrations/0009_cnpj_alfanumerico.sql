-- Flag indicando CNPJ no novo formato alfanumérico (IN RFB nº 2.229/2024)
ALTER TABLE parceiros ADD COLUMN cnpj_novo_formato INTEGER NOT NULL DEFAULT 0;
