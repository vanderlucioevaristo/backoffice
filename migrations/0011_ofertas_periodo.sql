-- Período de vigência (data e hora de início e fim) no cadastro de ofertas
ALTER TABLE loja_ofertas ADD COLUMN inicio_em TEXT;
ALTER TABLE loja_ofertas ADD COLUMN fim_em TEXT;
