-- Adiciona instituição financeira do Pix (ex.: Nubank, Itaú, Banco do Brasil, Inter, etc.)
ALTER TABLE empresas ADD COLUMN pix_instituicao TEXT NOT NULL DEFAULT 'Nubank';
