-- Cadastro de Profissionais e vínculo de Profissionais com Serviços para permitir múltiplos agendamentos simultâneos na Agenda
CREATE TABLE IF NOT EXISTS profissionais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  especialidade TEXT,
  telefone TEXT,
  email TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS servicos_profissionais (
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  servico_id INTEGER NOT NULL REFERENCES servicos(id) ON DELETE CASCADE,
  profissional_id INTEGER NOT NULL REFERENCES profissionais(id) ON DELETE CASCADE,
  PRIMARY KEY (empresa_id, servico_id, profissional_id)
);

ALTER TABLE agendamentos ADD COLUMN profissional_id INTEGER REFERENCES profissionais(id) ON DELETE SET NULL;
