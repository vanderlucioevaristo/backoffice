-- Parâmetros da Agenda na Loja Virtual (configuráveis em Minha Loja)
ALTER TABLE empresas ADD COLUMN agenda_ativa INTEGER NOT NULL DEFAULT 0;
ALTER TABLE empresas ADD COLUMN agenda_menu_texto TEXT NOT NULL DEFAULT 'Agenda';
ALTER TABLE empresas ADD COLUMN agenda_inicio TEXT NOT NULL DEFAULT '08:00';
ALTER TABLE empresas ADD COLUMN agenda_fim TEXT NOT NULL DEFAULT '18:00';
ALTER TABLE empresas ADD COLUMN agenda_intervalo_min INTEGER NOT NULL DEFAULT 30;
ALTER TABLE empresas ADD COLUMN agenda_dias_semana TEXT NOT NULL DEFAULT '1,2,3,4,5';
ALTER TABLE empresas ADD COLUMN agenda_datas_fechadas TEXT;

-- Cadastro de Serviços / Procedimentos com tempo de execução em minutos
CREATE TABLE IF NOT EXISTS servicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  duracao_minutos INTEGER NOT NULL DEFAULT 30 CHECK (duracao_minutos >= 5),
  preco REAL NOT NULL DEFAULT 0 CHECK (preco >= 0),
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_servicos_empresa ON servicos(empresa_id, ativo);

-- Agendamentos realizados pelos clientes na Loja Virtual
CREATE TABLE IF NOT EXISTS agendamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  parceiro_id INTEGER NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
  servico_id INTEGER NOT NULL REFERENCES servicos(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  hora_inicio TEXT NOT NULL,
  hora_fim TEXT NOT NULL,
  duracao_minutos INTEGER NOT NULL,
  preco REAL NOT NULL DEFAULT 0,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'AGENDADO' CHECK (status IN ('AGENDADO','CONFIRMADO','CONCLUIDO','CANCELADO')),
  visto_admin INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_empresa_data ON agendamentos(empresa_id, data, status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_visto ON agendamentos(empresa_id, visto_admin, status);
