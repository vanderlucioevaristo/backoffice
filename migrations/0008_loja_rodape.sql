-- Campos personalizáveis do rodapé da loja virtual
ALTER TABLE empresas ADD COLUMN rodape_sobre TEXT;
ALTER TABLE empresas ADD COLUMN rodape_telefone TEXT;
ALTER TABLE empresas ADD COLUMN rodape_whatsapp TEXT;
ALTER TABLE empresas ADD COLUMN rodape_email TEXT;
ALTER TABLE empresas ADD COLUMN rodape_horario TEXT;
ALTER TABLE empresas ADD COLUMN rodape_endereco TEXT;
ALTER TABLE empresas ADD COLUMN rodape_suporte TEXT;
ALTER TABLE empresas ADD COLUMN rodape_instagram TEXT;
ALTER TABLE empresas ADD COLUMN rodape_facebook TEXT;
ALTER TABLE empresas ADD COLUMN rodape_copyright TEXT;
ALTER TABLE empresas ADD COLUMN rodape_cor_fundo TEXT NOT NULL DEFAULT '#ffffff';
ALTER TABLE empresas ADD COLUMN rodape_cor_texto TEXT NOT NULL DEFAULT '#333333';
