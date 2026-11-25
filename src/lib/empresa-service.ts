import { cleanDoc, onlyDigits, validCNPJ, validEmail } from './validate.ts';

const ITERATIONS = 100_000;
const enc = new TextEncoder();

export const IDLE_TIMEOUT_SEC = 10 * 60; // 10 minutos (600 segundos)
export const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_SEC * 1000;

const toB64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
const toHex = (buf: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(buf as ArrayBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function sha256Hex(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

async function hashSenhaPbkdf2(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    key,
    256,
  );
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export interface DadosCadastroEmpresa {
  codigo: string;
  razao: string;
  fantasia?: string;
  cnpj?: string;
  nome: string;
  email?: string;
  login: string;
  senha: string;
}

export interface ResultadoCadastroEmpresa {
  ok: boolean;
  erro?: string;
  empresaId?: number;
  usuarioId?: number;
}

export async function registrarEmpresaComUsuario(
  database: {
    prepare(query: string): {
      bind(...values: unknown[]): {
        first<T = any>(colName?: string): Promise<T | null>;
      };
    };
  },
  dados: DadosCadastroEmpresa,
): Promise<ResultadoCadastroEmpresa> {
  const codigo = String(dados.codigo ?? '').trim().toLowerCase().slice(0, 30);
  const razao = String(dados.razao ?? '').trim().slice(0, 200);
  const fantasia = String(dados.fantasia ?? '').trim().slice(0, 200);
  const cnpj = cleanDoc(String(dados.cnpj ?? '').trim());
  const nome = String(dados.nome ?? '').trim().slice(0, 200);
  const email = String(dados.email ?? '').trim().slice(0, 200);
  const login = String(dados.login ?? '').trim().toLowerCase().slice(0, 40);
  const senha = String(dados.senha ?? '');

  if (!/^[a-z0-9][a-z0-9-]{2,29}$/.test(codigo)) {
    return { ok: false, erro: 'Código da empresa: 3 a 30 caracteres (letras minúsculas, números e hífen).' };
  }
  if (!razao || !nome || !login) {
    return { ok: false, erro: 'Preencha os campos obrigatórios.' };
  }
  if (cnpj && !validCNPJ(cnpj, /[A-Z]/.test(cnpj))) {
    return { ok: false, erro: 'CNPJ inválido.' };
  }
  if (email && !validEmail(email)) {
    return { ok: false, erro: 'E-mail inválido.' };
  }
  if (senha.length < 8) {
    return { ok: false, erro: 'A senha deve ter pelo menos 8 caracteres.' };
  }

  const exists = await database.prepare('SELECT 1 FROM empresas WHERE codigo = ?').bind(codigo).first();
  if (exists) {
    return { ok: false, erro: 'Este código de empresa já está em uso.' };
  }

  const hash = await hashSenhaPbkdf2(senha);
  const emp = await database
    .prepare('INSERT INTO empresas (codigo, razao_social, nome_fantasia, cnpj) VALUES (?,?,?,?) RETURNING id')
    .bind(codigo, razao, fantasia || null, cnpj || null)
    .first<{ id: number }>();

  const usr = await database
    .prepare("INSERT INTO usuarios (empresa_id, login, nome, email, perfil, senha_hash) VALUES (?,?,?,?, 'admin', ?) RETURNING id")
    .bind(emp!.id, login, nome, email || null, hash)
    .first<{ id: number }>();

  return {
    ok: true,
    empresaId: emp!.id,
    usuarioId: usr!.id,
  };
}

export async function atualizarCadastroEmpresa(
  database: any,
  dados: {
    id: number;
    codigo: string;
    razao: string;
    fantasia?: string;
    cnpj?: string;
    ativa?: number;
    adminId?: number;
    adminNome?: string;
    adminLogin?: string;
    adminEmail?: string;
    adminNovaSenha?: string;
  },
): Promise<{ ok: boolean; erro?: string }> {
  const id = Number(dados.id) || 0;
  const codigo = String(dados.codigo ?? '').trim().toLowerCase().slice(0, 30);
  const razao = String(dados.razao ?? '').trim().slice(0, 200);
  const fantasia = String(dados.fantasia ?? '').trim().slice(0, 200);
  const cnpj = cleanDoc(String(dados.cnpj ?? '').trim());
  const ativa = dados.ativa === 0 ? 0 : 1;

  if (!id) {
    return { ok: false, erro: 'Empresa inválida.' };
  }
  if (!/^[a-z0-9][a-z0-9-]{2,29}$/.test(codigo)) {
    return { ok: false, erro: 'Código da empresa: 3 a 30 caracteres (letras minúsculas, números e hífen).' };
  }
  if (!razao) {
    return { ok: false, erro: 'Informe a Razão Social da empresa.' };
  }
  if (cnpj && !validCNPJ(cnpj, /[A-Z]/.test(cnpj))) {
    return { ok: false, erro: 'CNPJ inválido.' };
  }

  const dup = await database
    .prepare('SELECT 1 FROM empresas WHERE codigo = ? AND id <> ?')
    .bind(codigo, id)
    .first();
  if (dup) {
    return { ok: false, erro: 'Este código de empresa já está em uso por outra empresa.' };
  }

  if (dados.adminId) {
    const adminNome = String(dados.adminNome ?? '').trim().slice(0, 200);
    const adminLogin = String(dados.adminLogin ?? '').trim().toLowerCase().slice(0, 40);
    const adminEmail = String(dados.adminEmail ?? '').trim().slice(0, 200);
    const adminNovaSenha = String(dados.adminNovaSenha ?? '');

    if (!adminNome || !adminLogin) {
      return { ok: false, erro: 'Informe o nome e o login do administrador.' };
    }
    if (adminEmail && !validEmail(adminEmail)) {
      return { ok: false, erro: 'E-mail do administrador inválido.' };
    }
    if (adminNovaSenha && adminNovaSenha.length < 8) {
      return { ok: false, erro: 'A nova senha deve ter pelo menos 8 caracteres.' };
    }

    const dupLogin = await database
      .prepare('SELECT 1 FROM usuarios WHERE empresa_id = ? AND login = ? AND id <> ?')
      .bind(id, adminLogin, dados.adminId)
      .first();
    if (dupLogin) {
      return { ok: false, erro: 'Já existe outro usuário nesta empresa com este login.' };
    }

    if (adminNovaSenha) {
      const novoHash = await hashSenhaPbkdf2(adminNovaSenha);
      await database
        .prepare(
          "UPDATE usuarios SET nome = ?, login = ?, email = ?, senha_hash = ?, atualizado_em = datetime('now') WHERE id = ? AND empresa_id = ?",
        )
        .bind(adminNome, adminLogin, adminEmail || null, novoHash, dados.adminId, id)
        .run();
    } else {
      await database
        .prepare(
          "UPDATE usuarios SET nome = ?, login = ?, email = ?, atualizado_em = datetime('now') WHERE id = ? AND empresa_id = ?",
        )
        .bind(adminNome, adminLogin, adminEmail || null, dados.adminId, id)
        .run();
    }
  }

  await database
    .prepare(
      'UPDATE empresas SET codigo = ?, razao_social = ?, nome_fantasia = ?, cnpj = ?, ativa = ? WHERE id = ?',
    )
    .bind(codigo, razao, fantasia || null, cnpj || null, ativa, id)
    .run();

  return { ok: true };
}

export async function obterTempoSessaoSegundosEmpresa(
  database: any,
  empresaId: number,
): Promise<number> {
  try {
    const r = await database
      .prepare('SELECT tempo_sessao_minutos FROM empresas WHERE id = ?')
      .bind(empresaId)
      .first();
    const min = Number(r?.tempo_sessao_minutos);
    if (Number.isFinite(min) && min >= 1 && min <= 1440) {
      return Math.round(min * 60);
    }
  } catch {
    // Caso a coluna ainda não exista em um banco temporário de teste, usa o padrão
  }
  return IDLE_TIMEOUT_SEC;
}

export async function criarSessaoUsuario(
  database: any,
  usuarioId: number,
  empresaId: number,
  nowMs = Date.now(),
) {
  const timeoutSec = await obterTempoSessaoSegundosEmpresa(database, empresaId);
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const expira = new Date(nowMs + timeoutSec * 1000).toISOString();
  await database
    .prepare('INSERT INTO sessoes (token_hash, usuario_id, empresa_id, expira_em) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), usuarioId, empresaId, expira)
    .run();
  return { token, maxAge: timeoutSec };
}

export async function validarERenovarSessaoUsuario(
  database: any,
  token: string,
  nowMs = Date.now(),
) {
  const hash = await sha256Hex(token);
  const agoraIso = new Date(nowMs).toISOString();

  const row = await database
    .prepare(
      `SELECT u.id, u.nome, u.login, u.perfil, e.id AS empresaId,
              COALESCE(e.nome_fantasia, e.razao_social) AS empresaNome, e.codigo AS empresaCodigo
         FROM sessoes s
         JOIN usuarios u ON u.id = s.usuario_id AND u.empresa_id = s.empresa_id AND u.ativo = 1
         JOIN empresas e ON e.id = s.empresa_id AND e.ativa = 1
        WHERE s.token_hash = ? AND s.expira_em > ?`,
    )
    .bind(hash, agoraIso)
    .first();

  if (!row) {
    // Remove sessão vencida
    await database.prepare('DELETE FROM sessoes WHERE token_hash = ?').bind(hash).run();
    return null;
  }

  const timeoutSec = await obterTempoSessaoSegundosEmpresa(database, row.empresaId);
  const novaExpiracao = new Date(nowMs + timeoutSec * 1000).toISOString();
  await database
    .prepare('UPDATE sessoes SET expira_em = ? WHERE token_hash = ?')
    .bind(novaExpiracao, hash)
    .run();

  return { ...row, tempoSessaoSegundos: timeoutSec };
}

export async function criarSessaoClienteLoja(
  database: any,
  parceiroId: number,
  empresaId: number,
  nowMs = Date.now(),
) {
  const timeoutSec = await obterTempoSessaoSegundosEmpresa(database, empresaId);
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const expira = new Date(nowMs + timeoutSec * 1000).toISOString();
  await database
    .prepare('INSERT INTO sessoes_clientes (token_hash, parceiro_id, empresa_id, expira_em) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), parceiroId, empresaId, expira)
    .run();
  return { token, maxAge: timeoutSec };
}

export async function validarERenovarSessaoClienteLoja(
  database: any,
  token: string,
  empresaCodigo: string,
  nowMs = Date.now(),
) {
  const hash = await sha256Hex(token);
  const agoraIso = new Date(nowMs).toISOString();
  const row = await database
    .prepare(
      `SELECT p.id, p.nome, p.documento, p.email, e.id AS empresaId, e.codigo AS empresaCodigo
         FROM sessoes_clientes sc
         JOIN parceiros p ON p.id = sc.parceiro_id AND p.empresa_id = sc.empresa_id AND p.ativo = 1 AND p.eh_cliente = 1
         JOIN empresas e ON e.id = sc.empresa_id AND e.ativa = 1
        WHERE sc.token_hash = ? AND sc.expira_em > ? AND e.codigo = ?`,
    )
    .bind(hash, agoraIso, empresaCodigo.toLowerCase())
    .first();

  if (!row) {
    // Remove sessão vencida do cliente na loja
    await database.prepare('DELETE FROM sessoes_clientes WHERE token_hash = ?').bind(hash).run();
    return null;
  }

  const timeoutSec = await obterTempoSessaoSegundosEmpresa(database, row.empresaId);
  const novaExpiracao = new Date(nowMs + timeoutSec * 1000).toISOString();
  await database
    .prepare('UPDATE sessoes_clientes SET expira_em = ? WHERE token_hash = ?')
    .bind(novaExpiracao, hash)
    .run();

  return { ...row, tempoSessaoSegundos: timeoutSec };
}

export function horaParaMinutos(hhmm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm ?? '').trim());
  if (!m) return -1;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return -1;
  return h * 60 + min;
}

export function minutosParaHora(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const DIAS_SEMANA_LABELS: Array<{ valor: number; curto: string; longo: string }> = [
  { valor: 0, curto: 'Dom', longo: 'Domingo' },
  { valor: 1, curto: 'Seg', longo: 'Segunda-feira' },
  { valor: 2, curto: 'Ter', longo: 'Terça-feira' },
  { valor: 3, curto: 'Qua', longo: 'Quarta-feira' },
  { valor: 4, curto: 'Qui', longo: 'Quinta-feira' },
  { valor: 5, curto: 'Sex', longo: 'Sexta-feira' },
  { valor: 6, curto: 'Sáb', longo: 'Sábado' },
];

export function verificarDiaFuncionamentoAgenda(
  dataYmd: string,
  diasSemanaStr = '1,2,3,4,5',
  datasFechadasStr: string | null | undefined = '',
): { aberto: boolean; diaSemana: number; nomeDia: string; motivo?: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dataYmd ?? '').trim());
  if (!m) {
    return { aberto: false, diaSemana: -1, nomeDia: '', motivo: 'Data inválida.' };
  }
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
  const diaSemana = dt.getUTCDay();
  const nomeDia = DIAS_SEMANA_LABELS[diaSemana]?.longo ?? '';

  // Verifica se a data específica está na lista de feriados / folgas sem expediente
  const fechadas = String(datasFechadasStr ?? '')
    .split(/[,;\s\n]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));

  if (fechadas.includes(dataYmd)) {
    return {
      aberto: false,
      diaSemana,
      nomeDia,
      motivo: `Não há prestação de serviços na data ${m[3]}/${m[2]}/${m[1]} (dia sem expediente).`,
    };
  }

  const diasAtivos = String(diasSemanaStr ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[0-6]$/.test(s))
    .map(Number);

  if (!diasAtivos.includes(diaSemana)) {
    return {
      aberto: false,
      diaSemana,
      nomeDia,
      motivo: `Não há prestação de serviços às ${nomeDia.toLowerCase()}s. Escolha um dia de funcionamento da loja.`,
    };
  }

  return { aberto: true, diaSemana, nomeDia };
}

export async function criarServico(
  database: any,
  empresaId: number,
  dados: {
    nome: string;
    descricao?: string;
    duracaoMinutos: number;
    preco?: number;
    ativo?: number;
  },
) {
  const nome = String(dados.nome ?? '').trim().slice(0, 160);
  const descricao = String(dados.descricao ?? '').trim().slice(0, 500);
  const duracao = Math.max(5, Math.min(720, Math.round(Number(dados.duracaoMinutos) || 30)));
  const preco = Math.max(0, Number(dados.preco) || 0);
  const ativo = dados.ativo === 0 ? 0 : 1;

  const row = await database
    .prepare(
      `INSERT INTO servicos (empresa_id, nome, descricao, duracao_minutos, preco, ativo)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(empresaId, nome, descricao || null, duracao, preco, ativo)
    .first<{ id: number }>();

  return { id: row?.id ?? 0, duracaoMinutos: duracao };
}

export async function criarAgendamentoLoja(
  database: any,
  dados: {
    empresaId: number;
    parceiroId: number;
    servicoId: number;
    data: string;
    horaInicio: string;
    observacoes?: string;
    expedienteInicio?: string;
    expedienteFim?: string;
    diasSemanaFuncionamento?: string;
    datasFechadas?: string | null;
  },
): Promise<{
  ok: boolean;
  erro?: string;
  agendamentoId?: number;
  horaInicio?: string;
  horaFim?: string;
  duracaoMinutos?: number;
}> {
  const data = String(dados.data ?? '').trim();
  const horaInicio = String(dados.horaInicio ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return { ok: false, erro: 'Informe uma data válida para o agendamento.' };
  }
  const inicioMin = horaParaMinutos(horaInicio);
  if (inicioMin < 0) {
    return { ok: false, erro: 'Informe um horário inicial válido.' };
  }

  // Consulta configuração de dias de funcionamento da empresa caso não tenha sido enviada diretamente
  let diasSemana = dados.diasSemanaFuncionamento;
  let datasFechadas = dados.datasFechadas;
  if (diasSemana === undefined || datasFechadas === undefined) {
    const cfg = await database
      .prepare(
        `SELECT COALESCE(agenda_dias_semana, '1,2,3,4,5') AS agenda_dias_semana,
                agenda_datas_fechadas
           FROM empresas WHERE id = ?`,
      )
      .bind(dados.empresaId)
      .first<{ agenda_dias_semana: string; agenda_datas_fechadas: string | null }>();
    if (diasSemana === undefined) diasSemana = cfg?.agenda_dias_semana ?? '1,2,3,4,5';
    if (datasFechadas === undefined) datasFechadas = cfg?.agenda_datas_fechadas ?? null;
  }

  const checkDia = verificarDiaFuncionamentoAgenda(data, diasSemana, datasFechadas);
  if (!checkDia.aberto) {
    return { ok: false, erro: checkDia.motivo || 'Não há prestação de serviços nesta data.' };
  }

  const servico = await database
    .prepare(
      `SELECT id, nome, duracao_minutos, preco
         FROM servicos
        WHERE id = ? AND empresa_id = ? AND ativo = 1`,
    )
    .bind(dados.servicoId, dados.empresaId)
    .first<{ id: number; nome: string; duracao_minutos: number; preco: number }>();

  if (!servico) {
    return { ok: false, erro: 'Serviço indisponível para agendamento.' };
  }

  const duracao = Math.max(5, Number(servico.duracao_minutos) || 30);
  const fimMin = inicioMin + duracao;
  if (fimMin > 24 * 60) {
    return { ok: false, erro: 'O tempo de execução deste serviço ultrapassa o fim do dia.' };
  }

  const expIni = horaParaMinutos(dados.expedienteInicio || '08:00');
  const expFim = horaParaMinutos(dados.expedienteFim || '18:00');
  if (expIni >= 0 && expFim > expIni) {
    if (inicioMin < expIni || fimMin > expFim) {
      return {
        ok: false,
        erro: `Este serviço leva ${duracao} min e precisa iniciar e terminar dentro do horário de atendimento (${dados.expedienteInicio || '08:00'} às ${dados.expedienteFim || '18:00'}).`,
      };
    }
  }

  const horaFim = minutosParaHora(fimMin);

  // Verifica se já existe algum agendamento ativo que encavale com o intervalo [horaInicio, horaFim)
  const conflito = await database
    .prepare(
      `SELECT id
         FROM agendamentos
        WHERE empresa_id = ?
          AND data = ?
          AND status <> 'CANCELADO'
          AND hora_inicio < ?
          AND hora_fim > ?
        LIMIT 1`,
    )
    .bind(dados.empresaId, data, horaFim, horaInicio)
    .first<{ id: number }>();

  if (conflito) {
    return {
      ok: false,
      erro: 'Este horário conflita com outro agendamento já reservado. Escolha outro horário disponível.',
    };
  }

  const obs = String(dados.observacoes ?? '').trim().slice(0, 400);
  const inserido = await database
    .prepare(
      `INSERT INTO agendamentos
        (empresa_id, parceiro_id, servico_id, data, hora_inicio, hora_fim, duracao_minutos, preco, observacoes, status, visto_admin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'AGENDADO', 0)
       RETURNING id`,
    )
    .bind(
      dados.empresaId,
      dados.parceiroId,
      servico.id,
      data,
      horaInicio,
      horaFim,
      duracao,
      servico.preco,
      obs || null,
    )
    .first<{ id: number }>();

  return {
    ok: true,
    agendamentoId: inserido?.id,
    horaInicio,
    horaFim,
    duracaoMinutos: duracao,
  };
}

export type SlotVisaoCliente =
  | {
      tipo: 'OCUPADO';
      horaInicio: string;
      horaFim: string;
    }
  | {
      tipo: 'MEU';
      id: number;
      horaInicio: string;
      horaFim: string;
      duracaoMinutos: number;
      servicoNome: string;
      preco: number;
      status: string;
      observacoes: string | null;
    };

/**
 * Lista os horários ocupados de um dia sob a ótica de um cliente específico:
 * - Agendamentos do próprio cliente trazem os detalhes do serviço que ele agendou (tipo: 'MEU').
 * - Agendamentos de outros clientes retornam APENAS { tipo: 'OCUPADO', horaInicio, horaFim },
 *   sem expor nome de cliente, serviço, preço ou observações de terceiros.
 */
export async function listarVisaoAgendaCliente(
  database: any,
  params: {
    empresaId: number;
    parceiroId: number;
    data: string;
  },
): Promise<SlotVisaoCliente[]> {
  const { results } = await database
    .prepare(
      `SELECT a.id, a.parceiro_id, a.hora_inicio, a.hora_fim, a.duracao_minutos,
              a.preco, a.status, a.observacoes, s.nome AS servico_nome
         FROM agendamentos a
         JOIN servicos s ON s.id = a.servico_id AND s.empresa_id = a.empresa_id
        WHERE a.empresa_id = ?
          AND a.data = ?
          AND a.status <> 'CANCELADO'
        ORDER BY a.hora_inicio ASC`,
    )
    .bind(params.empresaId, params.data)
    .all<{
      id: number;
      parceiro_id: number;
      hora_inicio: string;
      hora_fim: string;
      duracao_minutos: number;
      preco: number;
      status: string;
      observacoes: string | null;
      servico_nome: string;
    }>();

  return results.map((r): SlotVisaoCliente => {
    if (r.parceiro_id === params.parceiroId) {
      return {
        tipo: 'MEU',
        id: r.id,
        horaInicio: r.hora_inicio,
        horaFim: r.hora_fim,
        duracaoMinutos: r.duracao_minutos,
        servicoNome: r.servico_nome,
        preco: r.preco,
        status: r.status,
        observacoes: r.observacoes,
      };
    }
    return {
      tipo: 'OCUPADO',
      horaInicio: r.hora_inicio,
      horaFim: r.hora_fim,
    };
  });
}

export async function contarNotificacoesAgendamentoBackoffice(
  database: any,
  empresaId: number,
): Promise<number> {
  const n = await database
    .prepare(
      `SELECT COUNT(*) AS n
         FROM agendamentos
        WHERE empresa_id = ?
          AND visto_admin = 0
          AND status <> 'CANCELADO'`,
    )
    .bind(empresaId)
    .first<number>('n');
  return Number(n) || 0;
}

export interface ItemFreteCorreios {
  quantidade: number;
  pesoKg?: number | null;
  comprimentoCm?: number | null;
  larguraCm?: number | null;
  alturaCm?: number | null;
  precoUnitario?: number | null;
}

export interface OpcaoFreteCorreios {
  codigo: 'PAC' | 'SEDEX' | 'RETIRADA';
  codigoServico: string;
  nome: string;
  valor: number;
  prazoDias: number;
  descricao: string;
}

export interface ResultadoCotacaoCorreios {
  ok: boolean;
  erro?: string;
  cepOrigem: string;
  cepDestino: string;
  pesoFisicoKg: number;
  pesoCubicoKg: number;
  pesoTarifadoKg: number;
  dimensoesPacoteCm: { comprimento: number; largura: number; altura: number };
  opcoes: OpcaoFreteCorreios[];
}

/**
 * Calcula o frete via Correios (PAC 04510 e SEDEX 04014) levando em conta:
 * - Peso bruto total (kg)
 * - Peso cúbico dos Correios (C x L x A / 6000)
 * - Distância postal entre o CEP de origem da loja e o CEP de destino do cliente
 * - Ad-valorem sobre o valor da mercadoria
 */
export function calcularFreteCorreios(params: {
  cepOrigem?: string | null;
  cepDestino: string;
  itens: ItemFreteCorreios[];
  multiFornecedor?: boolean;
}): ResultadoCotacaoCorreios {
  const orig = onlyDigits(String(params.cepOrigem || '01001000')) || '01001000';
  const cepOrigem = orig.length === 8 ? orig : '01001000';
  const cepDestino = onlyDigits(String(params.cepDestino ?? ''));

  if (!/^\d{8}$/.test(cepDestino)) {
    return {
      ok: false,
      erro: 'Informe um CEP de destino válido com 8 dígitos.',
      cepOrigem,
      cepDestino,
      pesoFisicoKg: 0,
      pesoCubicoKg: 0,
      pesoTarifadoKg: 0,
      dimensoesPacoteCm: { comprimento: 16, largura: 11, altura: 5 },
      opcoes: [],
    };
  }

  let pesoFisicoKg = 0;
  let volumeTotalCm3 = 0;
  let valorMercadoria = 0;
  let maxComp = 16;
  let maxLarg = 11;
  let somaAlt = 0;

  for (const it of params.itens) {
    const qtd = Math.max(0, Number(it.quantidade) || 0);
    if (qtd <= 0) continue;

    const pKg = Math.max(0.05, Number(it.pesoKg) || 0.3);
    const cCm = Math.max(15, Math.min(100, Number(it.comprimentoCm) || 16));
    const lCm = Math.max(10, Math.min(100, Number(it.larguraCm) || 11));
    const aCm = Math.max(2, Math.min(100, Number(it.alturaCm) || 5));
    const preco = Math.max(0, Number(it.precoUnitario) || 0);

    pesoFisicoKg += qtd * pKg;
    volumeTotalCm3 += qtd * (cCm * lCm * aCm);
    valorMercadoria += qtd * preco;

    if (cCm > maxComp) maxComp = cCm;
    if (lCm > maxLarg) maxLarg = lCm;
    somaAlt += qtd * aCm;
  }

  pesoFisicoKg = Math.round(pesoFisicoKg * 1000) / 1000;
  // Coeficiente oficial de cubagem dos Correios: Volume (cm³) / 6000
  const pesoCubicoKg = Math.round((volumeTotalCm3 / 6000) * 1000) / 1000;
  const pesoTarifadoKg = Math.round(Math.max(0.3, pesoFisicoKg, pesoCubicoKg) * 1000) / 1000;

  // Dimensões consolidadas da caixa respeitando limites dos Correios
  const raizVol = Math.cbrt(Math.max(1760, volumeTotalCm3));
  const compFinal = Math.min(100, Math.max(16, Math.round(Math.max(maxComp, raizVol * 1.2))));
  const largFinal = Math.min(100, Math.max(11, Math.round(Math.max(maxLarg, raizVol))));
  const altFinal = Math.min(100, Math.max(2, Math.round(Math.min(somaAlt || 5, raizVol * 0.9))));

  // Faixa de distância postal entre CEP de origem e CEP de destino
  const regOrig = Number(cepOrigem[0]);
  const regDest = Number(cepDestino[0]);
  const subOrig = cepOrigem.slice(0, 3);
  const subDest = cepDestino.slice(0, 3);
  const mesmoEstadoSP = (regOrig === 0 || regOrig === 1) && (regDest === 0 || regDest === 1);

  let fatorDistancia = 1.0;
  let prazoPac = 4;
  let prazoSedex = 1;

  if (subOrig === subDest) {
    // Mesma cidade / sub-região postal
    fatorDistancia = 1.0;
    prazoPac = 3;
    prazoSedex = 1;
  } else if (regOrig === regDest || mesmoEstadoSP) {
    // Mesmo estado / região postal
    fatorDistancia = 1.28;
    prazoPac = 5;
    prazoSedex = 2;
  } else if (Math.abs(regOrig - regDest) <= 2) {
    // Interestadual próximo
    fatorDistancia = 1.72;
    prazoPac = 7;
    prazoSedex = 3;
  } else {
    // Interestadual distante
    fatorDistancia = 2.28;
    prazoPac = 11;
    prazoSedex = 5;
  }

  // Adicional por kg excedente e seguro automático (ad-valorem)
  const kgExcedente = Math.max(0, Math.ceil(pesoTarifadoKg - 1));
  const adValorem = valorMercadoria > 25.63 ? (valorMercadoria - 25.63) * 0.01 : 0;

  const valorPac =
    Math.round(((16.9 + kgExcedente * 4.4) * fatorDistancia + adValorem) * 100) / 100;
  const valorSedex =
    Math.round(((26.9 + kgExcedente * 7.2) * (fatorDistancia * 1.08) + adValorem) * 100) / 100;

  const opcoes: OpcaoFreteCorreios[] = [
    {
      codigo: 'PAC',
      codigoServico: '04510',
      nome: 'Correios — PAC',
      valor: valorPac,
      prazoDias: prazoPac,
      descricao: `Fornecedor: Correios (PAC) · Entrega em até ${prazoPac} dia(s) úteis`,
    },
    {
      codigo: 'SEDEX',
      codigoServico: '04014',
      nome: 'Correios — SEDEX',
      valor: valorSedex,
      prazoDias: prazoSedex,
      descricao: `Fornecedor: Correios (SEDEX) · Entrega expressa em até ${prazoSedex} dia(s) útil(eis)`,
    },
  ];

  if (params.multiFornecedor) {
    const valorJadlogPkg = Math.round((valorPac * 0.92) * 100) / 100;
    const prazoJadlogPkg = Math.max(2, prazoPac - 1);
    const valorJadlogExp = Math.round((valorSedex * 0.94) * 100) / 100;
    const prazoJadlogExp = Math.max(1, prazoSedex);
    const valorLoggi = Math.round((valorPac * 1.04) * 100) / 100;
    const prazoLoggi = Math.max(1, prazoSedex + 1);
    const valorAzul = Math.round((valorSedex * 1.12) * 100) / 100;
    const prazoAzul = Math.max(1, prazoSedex);

    opcoes.push(
      {
        codigo: 'JADLOG_PACKAGE',
        codigoServico: 'JADLOG_PKG',
        nome: 'Jadlog — .Package Econômico',
        valor: valorJadlogPkg,
        prazoDias: prazoJadlogPkg,
        descricao: `Fornecedor: Jadlog Transportadora · Entrega em até ${prazoJadlogPkg} dia(s) úteis`,
      },
      {
        codigo: 'JADLOG_COM',
        codigoServico: 'JADLOG_EXP',
        nome: 'Jadlog — .Com Expresso',
        valor: valorJadlogExp,
        prazoDias: prazoJadlogExp,
        descricao: `Fornecedor: Jadlog Expresso · Entrega rápida em até ${prazoJadlogExp} dia(s) útil(eis)`,
      },
      {
        codigo: 'LOGGI_EXPRESS',
        codigoServico: 'LOGGI',
        nome: 'Loggi — Express Transportadora',
        valor: valorLoggi,
        prazoDias: prazoLoggi,
        descricao: `Fornecedor: Loggi · Entrega porta a porta em até ${prazoLoggi} dia(s) úteis`,
      },
      {
        codigo: 'AZUL_CARGO',
        codigoServico: 'AZUL',
        nome: 'Azul Cargo Express — Aéreo',
        valor: valorAzul,
        prazoDias: prazoAzul,
        descricao: `Fornecedor: Azul Cargo · Envio prioritário em até ${prazoAzul} dia(s) útil(eis)`,
      },
    );
  }

  opcoes.push({
    codigo: 'RETIRADA',
    codigoServico: 'RETIRADA',
    nome: 'Retirada na Loja',
    valor: 0,
    prazoDias: 1,
    descricao: 'Retirar pessoalmente no endereço da loja (sem custo de frete)',
  });

  return {
    ok: true,
    cepOrigem,
    cepDestino,
    pesoFisicoKg,
    pesoCubicoKg,
    pesoTarifadoKg,
    dimensoesPacoteCm: {
      comprimento: compFinal,
      largura: largFinal,
      altura: altFinal,
    },
    opcoes,
  };
}

function normalizarAsciiPix(texto: string, maxLen: number): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, maxLen);
}

function emvField(id: string, valor: string): string {
  const len = String(valor.length).padStart(2, '0');
  return `${id}${len}${valor}`;
}

function crc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function normalizarChavePix(chaveRaw: string): string {
  const raw = String(chaveRaw ?? '').trim();
  if (!raw) return '';
  // E-mail
  if (raw.includes('@')) return raw.toLowerCase();
  // Chave aleatória EVP (UUID)
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(raw)) {
    return raw.toLowerCase();
  }
  // Telefone internacional explícito (+55...)
  if (raw.startsWith('+')) {
    return '+' + onlyDigits(raw);
  }
  // CPF (11 dígitos), CNPJ (14 dígitos) ou CNPJ alfanumérico
  const digits = onlyDigits(raw);
  if (digits.length === 11 || digits.length === 14) {
    return digits;
  }
  return raw.replace(/\s+/g, '');
}

/**
 * Gera o payload oficial BR Code (EMV QRCPS-MPM do Banco Central) para Pix Nubank ("Pix Copia e Cola" e QR Code)
 */
export function gerarPayloadPixNubank(params: {
  chavePix: string;
  nomeRecebedor: string;
  cidadeRecebedor?: string | null;
  valor?: number | null;
  txid?: string | null;
  descricao?: string | null;
}): string {
  const chave = normalizarChavePix(params.chavePix);
  if (!chave) return '';

  const nome = normalizarAsciiPix(params.nomeRecebedor || 'LOJA', 25) || 'LOJA';
  const cidade = normalizarAsciiPix(params.cidadeRecebedor || 'SAO PAULO', 15) || 'SAO PAULO';
  const txid =
    String(params.txid ?? '***')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 25) || '***';

  let merchantAccount = emvField('00', 'br.gov.bcb.pix') + emvField('01', chave);
  if (params.descricao) {
    const desc = normalizarAsciiPix(params.descricao, 40);
    if (desc) merchantAccount += emvField('02', desc);
  }

  const valorNum = Number(params.valor ?? 0);
  const campoValor = valorNum > 0 ? emvField('54', valorNum.toFixed(2)) : '';
  const campoAdicional = emvField('62', emvField('05', txid));

  const semCrc =
    emvField('00', '01') +
    emvField('26', merchantAccount) +
    emvField('52', '0000') +
    emvField('53', '986') +
    campoValor +
    emvField('58', 'BR') +
    emvField('59', nome) +
    emvField('60', cidade) +
    campoAdicional +
    '6304';

  return semCrc + crc16Ccitt(semCrc);
}

/**
 * Integra com a API oficial NuPay for Business (ou retorna o link de pagamento Nubank configurado)
 */
export async function criarCheckoutNuPay(params: {
  merchantKey?: string | null;
  merchantToken?: string | null;
  linkPadrao?: string | null;
  pedidoId: number;
  valorTotal: number;
  clienteNome: string;
  clienteDoc?: string | null;
  clienteEmail?: string | null;
  urlRetorno?: string;
}): Promise<{ paymentUrl: string | null; origem: 'NUPAY_API' | 'LINK_PADRAO' | 'NENHUM' }> {
  const mKey = String(params.merchantKey ?? '').trim();
  const mTok = String(params.merchantToken ?? '').trim();

  if (mKey && mTok) {
    try {
      const partesNome = String(params.clienteNome || 'Cliente Loja').trim().split(/\s+/);
      const firstName = partesNome[0] || 'Cliente';
      const lastName = partesNome.slice(1).join(' ') || 'Loja';

      const resp = await fetch('https://api.spinpay.com.br/v1/checkouts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Merchant-Key': mKey,
          'X-Merchant-Token': mTok,
        },
        body: JSON.stringify({
          merchantOrderReference: `PED-${params.pedidoId}`,
          referenceId: `PED-${params.pedidoId}-${Date.now()}`,
          amount: {
            value: Number(params.valorTotal.toFixed(2)),
            currency: 'BRL',
          },
          shopper: {
            firstName,
            lastName,
            document: onlyDigits(String(params.clienteDoc ?? '')),
            documentType: onlyDigits(String(params.clienteDoc ?? '')).length > 11 ? 'CNPJ' : 'CPF',
            email: params.clienteEmail || 'cliente@loja.com.br',
          },
          paymentMethod: {
            type: 'nupay',
            authorizationType: 'manually_authorized',
          },
          PaymentFlow: {
            returnUrl: params.urlRetorno || '',
          },
        }),
      });

      if (resp.ok) {
        const data: any = await resp.json();
        if (data?.paymentUrl) {
          return { paymentUrl: String(data.paymentUrl), origem: 'NUPAY_API' };
        }
      }
    } catch {
      // Fallback para link padrão caso sem rede ou credenciais de sandbox
    }
  }

  const linkPadrao = String(params.linkPadrao ?? '').trim();
  if (linkPadrao && /^https?:\/\//i.test(linkPadrao)) {
    return { paymentUrl: linkPadrao, origem: 'LINK_PADRAO' };
  }

  return { paymentUrl: null, origem: 'NENHUM' };
}

export function normalizarHandleInfinitePay(handleRaw?: string | null): string {
  return String(handleRaw ?? '')
    .trim()
    .replace(/^\$+/, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export interface ItemCheckoutInfinitePay {
  nome: string;
  precoUnitario: number;
  quantidade: number;
}

/**
 * Monta os itens em centavos (padrão da API de Checkout Integrado da InfinitePay)
 * e gera a URL direta de Link Integrado (https://checkout.infinitepay.io/{handle}?...)
 */
export function gerarUrlLinkIntegradoInfinitePay(params: {
  handle: string;
  pedidoId: number;
  itens: ItemCheckoutInfinitePay[];
  valorFrete?: number;
  freteModalidade?: string | null;
  clienteNome?: string | null;
  clienteEmail?: string | null;
  clienteTelefone?: string | null;
  urlRetorno?: string;
}): {
  url: string | null;
  orderNsu: string;
  itemsPayload: Array<{ description: string; name: string; price: number; quantity: number }>;
} {
  const handle = normalizarHandleInfinitePay(params.handle);
  const orderNsu = `PED-${params.pedidoId}`;

  const itemsPayload: Array<{ description: string; name: string; price: number; quantity: number }> = [];
  for (const it of params.itens) {
    const qty = Math.max(1, Math.round(Number(it.quantidade) || 1));
    const priceCents = Math.max(1, Math.round(Number(it.precoUnitario || 0) * 100));
    const desc = String(it.nome || 'Produto').trim().slice(0, 120) || 'Produto';
    itemsPayload.push({
      description: desc,
      name: desc,
      price: priceCents,
      quantity: qty,
    });
  }

  const frete = Number(params.valorFrete || 0);
  if (frete > 0) {
    const freteCents = Math.round(frete * 100);
    if (freteCents > 0) {
      const descFrete = `Frete (${String(params.freteModalidade || 'Entrega').trim()})`.slice(0, 120);
      itemsPayload.push({
        description: descFrete,
        name: descFrete,
        price: freteCents,
        quantity: 1,
      });
    }
  }

  if (!handle || itemsPayload.length === 0) {
    return { url: null, orderNsu, itemsPayload };
  }

  const qs = new URLSearchParams();
  qs.set(
    'items',
    JSON.stringify(
      itemsPayload.map((i) => ({
        name: i.name,
        price: i.price,
        quantity: i.quantity,
      })),
    ),
  );
  qs.set('order_nsu', orderNsu);
  if (params.urlRetorno) qs.set('redirect_url', params.urlRetorno);
  if (params.clienteNome) qs.set('customer_name', String(params.clienteNome).trim());
  if (params.clienteEmail) qs.set('customer_email', String(params.clienteEmail).trim());
  const fone = onlyDigits(String(params.clienteTelefone ?? ''));
  if (fone.length >= 10) qs.set('customer_cellphone', fone);

  return {
    url: `https://checkout.infinitepay.io/${encodeURIComponent(handle)}?${qs.toString()}`,
    orderNsu,
    itemsPayload,
  };
}

/**
 * Integra com a API oficial de Checkout Integrado da InfinitePay (https://api.checkout.infinitepay.io/links)
 * com fallback automático para Link Integrado (https://checkout.infinitepay.io/{handle})
 */
export async function criarCheckoutInfinitePay(params: {
  handle?: string | null;
  apiKey?: string | null;
  pedidoId: number;
  itens: ItemCheckoutInfinitePay[];
  valorFrete?: number;
  freteModalidade?: string | null;
  clienteNome?: string | null;
  clienteEmail?: string | null;
  clienteTelefone?: string | null;
  urlRetorno?: string;
  urlWebhook?: string;
}): Promise<{
  paymentUrl: string | null;
  slug: string | null;
  orderNsu: string;
  origem: 'INFINITEPAY_API' | 'INFINITEPAY_LINK' | 'NENHUM';
}> {
  const handle = normalizarHandleInfinitePay(params.handle);
  const apiKey = String(params.apiKey ?? '').trim();
  const base = gerarUrlLinkIntegradoInfinitePay({
    handle: handle || 'loja',
    pedidoId: params.pedidoId,
    itens: params.itens,
    valorFrete: params.valorFrete,
    freteModalidade: params.freteModalidade,
    clienteNome: params.clienteNome,
    clienteEmail: params.clienteEmail,
    clienteTelefone: params.clienteTelefone,
    urlRetorno: params.urlRetorno,
  });

  if (!handle && !apiKey) {
    return { paymentUrl: null, slug: null, orderNsu: base.orderNsu, origem: 'NENHUM' };
  }

  if (base.itemsPayload.length > 0) {
    const bodyJson: Record<string, unknown> = {
      order_nsu: base.orderNsu,
      items: base.itemsPayload.map((i) => ({
        description: i.description,
        price: i.price,
        quantity: i.quantity,
      })),
    };
    if (handle) bodyJson.handle = handle;
    if (params.urlRetorno) bodyJson.redirect_url = params.urlRetorno;
    if (params.urlWebhook) bodyJson.webhook_url = params.urlWebhook;
    if (params.clienteNome || params.clienteEmail || params.clienteTelefone) {
      bodyJson.customer = {
        name: String(params.clienteNome ?? '').trim() || undefined,
        email: String(params.clienteEmail ?? '').trim() || undefined,
        phone_number: onlyDigits(String(params.clienteTelefone ?? '')) || undefined,
      };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (apiKey) {
      headers['X-Api-Key'] = apiKey;
    }

    const endpoints = [
      'https://api.checkout.infinitepay.io/links',
      'https://api.infinitepay.io/invoices/public/checkout/links',
    ];

    for (const endpoint of endpoints) {
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(bodyJson),
        });
        if (resp.ok) {
          const data: any = await resp.json();
          const urlRetornada = data?.url || data?.checkout_url || data?.link || data?.payment_url;
          if (urlRetornada && /^https?:\/\//i.test(String(urlRetornada))) {
            return {
              paymentUrl: String(urlRetornada),
              slug: data?.slug || data?.invoice_slug || null,
              orderNsu: base.orderNsu,
              origem: 'INFINITEPAY_API',
            };
          }
        }
      } catch {
        // Continua para o próximo endpoint ou fallback direto
      }
    }
  }

  if (handle && base.url) {
    return {
      paymentUrl: base.url,
      slug: null,
      orderNsu: base.orderNsu,
      origem: 'INFINITEPAY_LINK',
    };
  }

  return { paymentUrl: null, slug: null, orderNsu: base.orderNsu, origem: 'NENHUM' };
}

/**
 * Consulta o status de uma transação na InfinitePay (/payment_check)
 */
export async function verificarPagamentoInfinitePay(params: {
  handle?: string | null;
  apiKey?: string | null;
  orderNsu: string;
  transactionNsu?: string | null;
  slug?: string | null;
}): Promise<{ pago: boolean; confirmadoApi: boolean }> {
  const handle = normalizarHandleInfinitePay(params.handle);
  const apiKey = String(params.apiKey ?? '').trim();
  const txNsu = String(params.transactionNsu ?? '').trim();
  const slug = String(params.slug ?? '').trim();

  if (!txNsu && !slug) {
    return { pago: false, confirmadoApi: false };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (apiKey) headers['X-Api-Key'] = apiKey;

  const payload: Record<string, string> = {
    order_nsu: params.orderNsu,
  };
  if (handle) payload.handle = handle;
  if (txNsu) payload.transaction_nsu = txNsu;
  if (slug) payload.slug = slug;

  const endpoints = [
    'https://api.checkout.infinitepay.io/payment_check',
    'https://api.infinitepay.io/invoices/public/checkout/payment_check',
  ];

  for (const endpoint of endpoints) {
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        const data: any = await resp.json();
        if (data?.paid === true || data?.success === true || data?.status === 'paid' || data?.status === 'approved') {
          return { pago: true, confirmadoApi: true };
        }
        if (data?.paid === false) {
          return { pago: false, confirmadoApi: true };
        }
      }
    } catch {
      // Se offline, nunca aprova pagamento sem confirmação criptográfica/API da InfinitePay
    }
  }

  return { pago: false, confirmadoApi: false };
}

export const MAX_LOGIN_FALHAS = 5;
export const BLOQUEIO_LOGIN_MS = 15 * 60 * 1000; // 15 minutos

export async function verificarRateLimitTentativas(
  database: any,
  chave: string,
  nowMs = Date.now(),
): Promise<{ permitido: boolean; minutosRestantes?: number }> {
  try {
    const row = await database
      .prepare('SELECT falhas, bloqueado_ate FROM login_tentativas WHERE chave = ?')
      .bind(chave)
      .first();
    if (!row || !row.bloqueado_ate) return { permitido: true };
    const ateMs = Date.parse(String(row.bloqueado_ate));
    if (Number.isFinite(ateMs) && ateMs > nowMs) {
      const min = Math.max(1, Math.ceil((ateMs - nowMs) / 60000));
      return { permitido: false, minutosRestantes: min };
    }
  } catch {
    // Tabela opcional em bancos antigos
  }
  return { permitido: true };
}

export async function registrarFalhaTentativa(
  database: any,
  chave: string,
  nowMs = Date.now(),
): Promise<{ bloqueado: boolean; falhas: number }> {
  try {
    const row = await database
      .prepare('SELECT falhas, bloqueado_ate FROM login_tentativas WHERE chave = ?')
      .bind(chave)
      .first();
    const novasFalhas = Number(row?.falhas ?? 0) + 1;
    const bloqueado = novasFalhas >= MAX_LOGIN_FALHAS;
    const bloqueadoAte = bloqueado ? new Date(nowMs + BLOQUEIO_LOGIN_MS).toISOString() : null;
    const agoraIso = new Date(nowMs).toISOString();

    await database
      .prepare(
        `INSERT INTO login_tentativas (chave, falhas, bloqueado_ate, atualizado_em)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(chave) DO UPDATE SET
           falhas = excluded.falhas,
           bloqueado_ate = COALESCE(excluded.bloqueado_ate, login_tentativas.bloqueado_ate),
           atualizado_em = excluded.atualizado_em`,
      )
      .bind(chave, novasFalhas, bloqueadoAte, agoraIso)
      .run();

    return { bloqueado, falhas: novasFalhas };
  } catch {
    return { bloqueado: false, falhas: 1 };
  }
}

export async function limparTentativasLogin(database: any, chave: string): Promise<void> {
  try {
    await database.prepare('DELETE FROM login_tentativas WHERE chave = ?').bind(chave).run();
  } catch {
    // Ignora se tabela não existir
  }
}

/**
 * Valida se uma URL externa configurada pelo lojista (ex: Webhook de e-mail ou Link de pagamento)
 * usa protocolo seguro https:// e não aponta para IPs privados/loopback (proteção anti-SSRF).
 */
export function validarUrlExternaSegura(urlRaw?: string | null): boolean {
  const raw = String(urlRaw ?? '').trim();
  if (!raw) return true;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    if (
      h === 'localhost' ||
      h === '0.0.0.0' ||
      h.endsWith('.local') ||
      h.endsWith('.internal') ||
      /^127\./.test(h) ||
      /^10\./.test(h) ||
      /^192\.168\./.test(h) ||
      /^169\.254\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(h) ||
      h === '[::1]'
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export const ICONES_CATEGORIAS_COMUNS: Array<{ icone: string; rotulo: string }> = [
  { icone: '📱', rotulo: 'Celulares e Smartphones' },
  { icone: '💻', rotulo: 'Informática e Notebooks' },
  { icone: '🎧', rotulo: 'Áudio, Fones e Som' },
  { icone: '☕', rotulo: 'Eletroportáteis e Cozinha' },
  { icone: '🏠', rotulo: 'Casa e Decoração' },
  { icone: '💡', rotulo: 'Iluminação e Smart Home' },
  { icone: '🛠️', rotulo: 'Ferramentas e Construção' },
  { icone: '🏃', rotulo: 'Esporte, Fitness e Lazer' },
  { icone: '📷', rotulo: 'Câmeras e Segurança' },
  { icone: '⌚', rotulo: 'Relógios e Smartwatches' },
  { icone: '🎮', rotulo: 'Games e Consoles' },
  { icone: '📺', rotulo: 'TV e Vídeo' },
  { icone: '🖨️', rotulo: 'Impressoras e Escritório' },
  { icone: '👕', rotulo: 'Moda e Vestuário' },
  { icone: '👟', rotulo: 'Calçados e Tênis' },
  { icone: '🎒', rotulo: 'Bolsas e Mochilas' },
  { icone: '💎', rotulo: 'Joias, Óculos e Acessórios' },
  { icone: '💄', rotulo: 'Beleza, Cosméticos e Perfumaria' },
  { icone: '💊', rotulo: 'Saúde e Farmácia' },
  { icone: '🛒', rotulo: 'Alimentos e Supermercado' },
  { icone: '🍷', rotulo: 'Bebidas e Adega' },
  { icone: '🐾', rotulo: 'Pet Shop e Animais' },
  { icone: '🧸', rotulo: 'Brinquedos e Infantil' },
  { icone: '📚', rotulo: 'Livros e Papelaria' },
  { icone: '🚗', rotulo: 'Automotivo e Peças' },
  { icone: '🛋️', rotulo: 'Móveis e Estofados' },
  { icone: '❄️', rotulo: 'Ar-Condicionado e Climatização' },
  { icone: '🧹', rotulo: 'Limpeza e Lavanderia' },
  { icone: '🌱', rotulo: 'Jardim, Camping e Pesca' },
  { icone: '🎸', rotulo: 'Instrumentos Musicais' },
  { icone: '⚡', rotulo: 'Elétrica e Energia Solar' },
  { icone: '🎁', rotulo: 'Presentes e Festas' },
  { icone: '🔥', rotulo: 'Ofertas e Queima de Estoque' },
  { icone: '⭐', rotulo: 'Destaques e Lançamentos' },
  { icone: '🛍️', rotulo: 'Sacola / Compras Gerais' },
  { icone: '📦', rotulo: 'Geral / Outros Produtos' },
];

/**
 * Retorna um ícone representativo para cada categoria de produto da loja virtual.
 */
export function iconeCategoriaLoja(categoriaRaw?: string | null, iconeCustom?: string | null): string {
  const custom = String(iconeCustom ?? '').trim();
  if (custom) return custom;

  const c = String(categoriaRaw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  if (!c || c === 'todas' || c === 'todas as categorias') return '🛍️';
  if (c.includes('celular') || c.includes('smartphone') || c.includes('telefon')) return '📱';
  if (c.includes('informatica') || c.includes('computador') || c.includes('notebook') || c.includes('pc')) return '💻';
  if (c.includes('audio') || c.includes('som') || c.includes('fone') || c.includes('musica')) return '🎧';
  if (c.includes('eletro') || c.includes('cozinha') || c.includes('cafe')) return '☕';
  if (c.includes('casa') || c.includes('iluminacao') || c.includes('decoracao') || c.includes('moveis')) return '🏠';
  if (c.includes('ferramenta') || c.includes('construcao') || c.includes('oficina')) return '🛠️';
  if (c.includes('esporte') || c.includes('lazer') || c.includes('fitness') || c.includes('academia')) return '🏃';
  if (c.includes('camera') || c.includes('seguranca') || c.includes('foto') || c.includes('video')) return '📷';
  if (c.includes('acessorio') || c.includes('relogio') || c.includes('smartwatch')) return '⌚';
  if (c.includes('game') || c.includes('jogo') || c.includes('console')) return '🎮';
  if (c.includes('moda') || c.includes('roupa') || c.includes('vestuario') || c.includes('calcado')) return '👕';
  if (c.includes('beleza') || c.includes('perfum') || c.includes('cosmetico')) return '💄';
  if (c.includes('livro') || c.includes('papelaria') || c.includes('educacao')) return '📚';
  if (c.includes('auto') || c.includes('carro') || c.includes('moto')) return '🚗';
  if (c.includes('pet') || c.includes('animal')) return '🐾';
  if (c.includes('alimento') || c.includes('bebida') || c.includes('mercado')) return '🛒';
  if (c.includes('brinquedo') || c.includes('infantil') || c.includes('bebe')) return '🧸';
  if (c.includes('saude') || c.includes('farmacia')) return '💊';
  return '📦';
}

/**
 * Importa automaticamente para a tabela `categorias` quaisquer categorias já utilizadas nos produtos da empresa.
 */
export async function sincronizarCategoriasProdutos(database: any, empresaId: number): Promise<void> {
  try {
    const { results } = await database
      .prepare(
        `SELECT DISTINCT TRIM(categoria) AS nome
           FROM produtos
          WHERE empresa_id = ?
            AND categoria IS NOT NULL
            AND TRIM(categoria) <> ''`,
      )
      .bind(empresaId)
      .all();

    for (const r of results || []) {
      const nome = String(r?.nome ?? '').trim();
      if (!nome) continue;
      const iconePadrao = iconeCategoriaLoja(nome);
      await database
        .prepare('INSERT OR IGNORE INTO categorias (empresa_id, nome, icone, ativa) VALUES (?, ?, ?, 1)')
        .bind(empresaId, nome, iconePadrao)
        .run();
    }
  } catch {
    // Ignora caso a tabela ainda não exista em banco antigo
  }
}

export async function salvarCategoriaLoja(
  database: any,
  dados: {
    id?: number;
    empresaId: number;
    nome: string;
    icone: string;
    ordem?: number;
    ativa?: number;
  },
): Promise<{ ok: boolean; erro?: string; id?: number }> {
  const nome = String(dados.nome ?? '').trim().slice(0, 80);
  const icone = String(dados.icone ?? '').trim().slice(0, 16) || iconeCategoriaLoja(nome);
  const ordem = Number.isFinite(Number(dados.ordem)) ? Math.round(Number(dados.ordem)) : 0;
  const ativa = dados.ativa === 0 ? 0 : 1;

  if (!nome) {
    return { ok: false, erro: 'Informe o nome da categoria.' };
  }

  if (dados.id && Number(dados.id) > 0) {
    const id = Number(dados.id);
    const atual = await database
      .prepare('SELECT id, nome FROM categorias WHERE id = ? AND empresa_id = ?')
      .bind(id, dados.empresaId)
      .first();
    if (!atual) {
      return { ok: false, erro: 'Categoria não encontrada.' };
    }

    const dup = await database
      .prepare('SELECT 1 FROM categorias WHERE empresa_id = ? AND LOWER(nome) = LOWER(?) AND id <> ?')
      .bind(dados.empresaId, nome, id)
      .first();
    if (dup) {
      return { ok: false, erro: 'Já existe outra categoria com este nome.' };
    }

    await database
      .prepare('UPDATE categorias SET nome = ?, icone = ?, ordem = ?, ativa = ? WHERE id = ? AND empresa_id = ?')
      .bind(nome, icone, ordem, ativa, id, dados.empresaId)
      .run();

    // Se o nome da categoria foi alterado, atualiza os produtos vinculados ao nome antigo
    if (atual.nome && String(atual.nome) !== nome) {
      await database
        .prepare('UPDATE produtos SET categoria = ? WHERE empresa_id = ? AND LOWER(TRIM(categoria)) = LOWER(TRIM(?))')
        .bind(nome, dados.empresaId, String(atual.nome))
        .run();
    }

    return { ok: true, id };
  }

  const dup = await database
    .prepare('SELECT id FROM categorias WHERE empresa_id = ? AND LOWER(nome) = LOWER(?)')
    .bind(dados.empresaId, nome)
    .first();
  if (dup) {
    return { ok: false, erro: 'Esta categoria já está cadastrada.' };
  }

  const ins = await database
    .prepare('INSERT INTO categorias (empresa_id, nome, icone, ordem, ativa) VALUES (?, ?, ?, ?, ?) RETURNING id')
    .bind(dados.empresaId, nome, icone, ordem, ativa)
    .first();

  return { ok: true, id: ins?.id };
}

export async function listarIdsFavoritosCliente(
  database: any,
  empresaId: number,
  parceiroId: number,
): Promise<number[]> {
  if (!empresaId || !parceiroId) return [];
  try {
    const { results } = await database
      .prepare('SELECT produto_id FROM loja_favoritos WHERE empresa_id = ? AND parceiro_id = ? ORDER BY id DESC')
      .bind(empresaId, parceiroId)
      .all();
    return (results || []).map((r: any) => Number(r.produto_id)).filter((id: number) => id > 0);
  } catch {
    return [];
  }
}

export async function alternarFavoritoLoja(
  database: any,
  dados: {
    empresaId: number;
    parceiroId: number;
    produtoId: number;
  },
): Promise<{ ok: boolean; favoritado: boolean; totalFavoritos: number; erro?: string }> {
  const { empresaId, parceiroId, produtoId } = dados;
  if (!empresaId || !parceiroId || !produtoId) {
    return { ok: false, favoritado: false, totalFavoritos: 0, erro: 'Parâmetros inválidos.' };
  }

  const prod = await database
    .prepare('SELECT id FROM produtos WHERE id = ? AND empresa_id = ?')
    .bind(produtoId, empresaId)
    .first();
  if (!prod) {
    return { ok: false, favoritado: false, totalFavoritos: 0, erro: 'Produto não encontrado.' };
  }

  const existente = await database
    .prepare('SELECT id FROM loja_favoritos WHERE empresa_id = ? AND parceiro_id = ? AND produto_id = ?')
    .bind(empresaId, parceiroId, produtoId)
    .first();

  let favoritado = false;
  if (existente) {
    await database
      .prepare('DELETE FROM loja_favoritos WHERE id = ? AND empresa_id = ?')
      .bind(existente.id, empresaId)
      .run();
    favoritado = false;
  } else {
    await database
      .prepare('INSERT INTO loja_favoritos (empresa_id, parceiro_id, produto_id) VALUES (?, ?, ?)')
      .bind(empresaId, parceiroId, produtoId)
      .run();
    favoritado = true;
  }

  const countRow = await database
    .prepare('SELECT COUNT(*) AS n FROM loja_favoritos WHERE empresa_id = ? AND parceiro_id = ?')
    .bind(empresaId, parceiroId)
    .first();

  return {
    ok: true,
    favoritado,
    totalFavoritos: Number(countRow?.n || 0),
  };
}

export async function registrarConsultaCategoria(
  database: any,
  empresaId: number,
  categoriaRaw?: string | null,
): Promise<void> {
  const cat = String(categoriaRaw ?? '').trim() || 'Geral';
  try {
    await database
      .prepare(
        `INSERT INTO loja_metricas_categorias (empresa_id, categoria, consultas, atualizado_em)
         VALUES (?, ?, 1, datetime('now'))
         ON CONFLICT (empresa_id, categoria)
         DO UPDATE SET consultas = loja_metricas_categorias.consultas + 1,
                       atualizado_em = datetime('now')`,
      )
      .bind(empresaId, cat)
      .run();
  } catch {
    // Ignora falha silenciosamente caso tabela ainda não exista
  }
}

export async function registrarVisualizacaoProduto(
  database: any,
  empresaId: number,
  produtoId: number,
): Promise<void> {
  if (!empresaId || !produtoId) return;
  try {
    const prod = await database
      .prepare('SELECT id, categoria FROM produtos WHERE id = ? AND empresa_id = ?')
      .bind(produtoId, empresaId)
      .first();
    if (!prod) return;

    await database
      .prepare('UPDATE produtos SET visualizacoes = COALESCE(visualizacoes, 0) + 1 WHERE id = ? AND empresa_id = ?')
      .bind(produtoId, empresaId)
      .run();

    await registrarConsultaCategoria(database, empresaId, prod.categoria);
  } catch {
    // Ignora falha silenciosamente
  }
}

/**
 * Registra a intenção de compra de um produto no carrinho de forma individualizada por produto,
 * contabilizando quantas pessoas distintas inseriram determinado produto no carrinho.
 */
export async function registrarInsercaoCarrinhoProduto(
  database: any,
  empresaId: number,
  produtoId: number,
  parceiroId?: number | null,
): Promise<void> {
  if (!empresaId || !produtoId) return;
  try {
    const prod = await database
      .prepare('SELECT id, categoria FROM produtos WHERE id = ? AND empresa_id = ?')
      .bind(produtoId, empresaId)
      .first();
    if (!prod) return;

    const pidCliente = Number(parceiroId) || 0;
    if (pidCliente > 0) {
      await database
        .prepare(
          `INSERT INTO loja_metricas_carrinho_clientes (empresa_id, produto_id, parceiro_id, vezes, atualizado_em)
           VALUES (?, ?, ?, 1, datetime('now'))
           ON CONFLICT (empresa_id, produto_id, parceiro_id)
           DO UPDATE SET vezes = loja_metricas_carrinho_clientes.vezes + 1,
                         atualizado_em = datetime('now')`,
        )
        .bind(empresaId, produtoId, pidCliente)
        .run();

      const qtdPessoas = await database
        .prepare(
          'SELECT COUNT(DISTINCT parceiro_id) AS n FROM loja_metricas_carrinho_clientes WHERE empresa_id = ? AND produto_id = ?',
        )
        .bind(empresaId, produtoId)
        .first();

      await database
        .prepare('UPDATE produtos SET insercoes_carrinho = ? WHERE id = ? AND empresa_id = ?')
        .bind(Number(qtdPessoas?.n || 1), produtoId, empresaId)
        .run();
    } else {
      await database
        .prepare(
          'UPDATE produtos SET insercoes_carrinho = COALESCE(insercoes_carrinho, 0) + 1 WHERE id = ? AND empresa_id = ?',
        )
        .bind(produtoId, empresaId)
        .run();
    }

    await registrarConsultaCategoria(database, empresaId, prod.categoria);
  } catch {
    // Ignora falha silenciosamente
  }
}

/**
 * Registra ou atualiza o tempo de permanência de uma visita na loja e o intervalo desde a última visita
 * (de forma 100% agregada/anônima por sessão de visita, sem vincular nem individualizar por cliente).
 */
export async function registrarPingVisitaLoja(
  database: any,
  dados: {
    empresaId: number;
    visitaToken: string;
    duracaoSegundos: number;
    intervaloRetornoSegundos?: number | null;
  },
): Promise<void> {
  const token = String(dados.visitaToken ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64);
  if (!dados.empresaId || token.length < 8) return;

  const dur = Math.max(0, Math.min(86400, Math.round(Number(dados.duracaoSegundos) || 0)));
  const retRaw = dados.intervaloRetornoSegundos;
  const ret =
    retRaw !== null && retRaw !== undefined && Number(retRaw) > 0
      ? Math.max(1, Math.min(365 * 86400, Math.round(Number(retRaw))))
      : null;

  try {
    await database
      .prepare(
        `INSERT INTO loja_visitas_metricas
           (visita_token, empresa_id, duracao_segundos, intervalo_retorno_segundos, iniciado_em, atualizado_em)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT (visita_token)
         DO UPDATE SET
           duracao_segundos = MAX(loja_visitas_metricas.duracao_segundos, excluded.duracao_segundos),
           intervalo_retorno_segundos = COALESCE(loja_visitas_metricas.intervalo_retorno_segundos, excluded.intervalo_retorno_segundos),
           atualizado_em = datetime('now')`,
      )
      .bind(token, dados.empresaId, dur, ret)
      .run();
  } catch {
    // Ignora falha silenciosamente
  }
}

export function formatarDuracaoHumana(segundosRaw?: number | null): string {
  const seg = Math.max(0, Math.round(Number(segundosRaw) || 0));
  if (seg === 0) return '0s';
  const dias = Math.floor(seg / 86400);
  const horas = Math.floor((seg % 86400) / 3600);
  const minutos = Math.floor((seg % 3600) / 60);
  const segundos = seg % 60;

  const partes: string[] = [];
  if (dias > 0) partes.push(`${dias}d`);
  if (horas > 0) partes.push(`${horas}h`);
  if (minutos > 0) partes.push(`${minutos}m`);
  if (segundos > 0 && dias === 0) partes.push(`${segundos}s`);
  return partes.join(' ') || '0s';
}

export async function obterMetricasDashboardLoja(database: any, empresaId: number) {
  // 1. Produtos com contadores de visualizações, pessoas que inseriram no carrinho (intenção de compra por produto) e vendas efetivadas
  const { results: produtosMetricasRaw } = await database
    .prepare(
      `SELECT p.id, p.codigo, p.nome, p.foto, p.unidade, p.preco_venda, p.estoque_atual, p.ativo,
              COALESCE(NULLIF(TRIM(p.categoria), ''), 'Geral') AS categoria,
              COALESCE(p.visualizacoes, 0) AS visualizacoes,
              MAX(
                COALESCE(p.insercoes_carrinho, 0),
                (SELECT COUNT(DISTINCT mc.parceiro_id)
                   FROM loja_metricas_carrinho_clientes mc
                  WHERE mc.empresa_id = p.empresa_id AND mc.produto_id = p.id),
                (SELECT COUNT(DISTINCT lc.parceiro_id)
                   FROM loja_carrinho lc
                  WHERE lc.empresa_id = p.empresa_id AND lc.produto_id = p.id)
              ) AS insercoes_carrinho,
              COALESCE(SUM(CASE WHEN lp.id IS NOT NULL AND lp.status <> 'cancelado' THEN i.quantidade ELSE 0 END), 0) AS vendas_quantidade,
              COUNT(DISTINCT CASE WHEN lp.id IS NOT NULL AND lp.status <> 'cancelado' THEN lp.id ELSE NULL END) AS vendas_pedidos,
              COALESCE(SUM(CASE WHEN lp.id IS NOT NULL AND lp.status <> 'cancelado' THEN i.subtotal ELSE 0 END), 0) AS vendas_valor
         FROM produtos p
         LEFT JOIN loja_pedidos_itens i ON i.produto_id = p.id AND i.empresa_id = p.empresa_id
         LEFT JOIN loja_pedidos lp ON lp.id = i.pedido_id AND lp.empresa_id = p.empresa_id
        WHERE p.empresa_id = ?
        GROUP BY p.id
        ORDER BY vendas_quantidade DESC, insercoes_carrinho DESC, p.visualizacoes DESC, p.nome COLLATE NOCASE ASC`,
    )
    .bind(empresaId)
    .all();

  // Filtra somente produtos que possuam pelo menos um dos contadores maior que zero
  const produtosMetricas = (produtosMetricasRaw || []).filter(
    (p: any) =>
      Number(p.visualizacoes || 0) > 0 ||
      Number(p.insercoes_carrinho || 0) > 0 ||
      Number(p.vendas_quantidade || 0) > 0 ||
      Number(p.vendas_pedidos || 0) > 0,
  );

  // 2. Categorias mais consultadas (somente categorias com pelo menos um contador > 0)
  const { results: categoriasConsultasRows } = await database
    .prepare(
      `SELECT categoria, consultas, atualizado_em
         FROM loja_metricas_categorias
        WHERE empresa_id = ?`,
    )
    .bind(empresaId)
    .all();

  const { results: categoriasCadRows } = await database
    .prepare('SELECT nome, icone FROM categorias WHERE empresa_id = ?')
    .bind(empresaId)
    .all();

  const mapaConsultasDiretas = new Map<string, number>();
  for (const r of categoriasConsultasRows || []) {
    const k = String(r.categoria || 'Geral').trim().toLowerCase();
    mapaConsultasDiretas.set(k, (mapaConsultasDiretas.get(k) || 0) + Number(r.consultas || 0));
  }

  const mapaIconesCat = new Map<string, string>();
  for (const c of categoriasCadRows || []) {
    mapaIconesCat.set(String(c.nome || '').trim().toLowerCase(), String(c.icone || ''));
  }

  const mapaCategorias = new Map<
    string,
    {
      categoria: string;
      icone: string;
      consultas: number;
      visualizacoesProdutos: number;
      insercoesCarrinho: number;
      vendasEfetivadas: number;
      valorVendido: number;
      qtdProdutos: number;
    }
  >();

  for (const p of produtosMetricasRaw || []) {
    const nomeCat = String(p.categoria || 'Geral').trim() || 'Geral';
    const key = nomeCat.toLowerCase();
    const existente = mapaCategorias.get(key) || {
      categoria: nomeCat,
      icone: iconeCategoriaLoja(nomeCat, mapaIconesCat.get(key)),
      consultas: mapaConsultasDiretas.get(key) || 0,
      visualizacoesProdutos: 0,
      insercoesCarrinho: 0,
      vendasEfetivadas: 0,
      valorVendido: 0,
      qtdProdutos: 0,
    };
    existente.visualizacoesProdutos += Number(p.visualizacoes || 0);
    existente.insercoesCarrinho += Number(p.insercoes_carrinho || 0);
    existente.vendasEfetivadas += Number(p.vendas_quantidade || 0);
    existente.valorVendido += Number(p.vendas_valor || 0);
    existente.qtdProdutos += 1;
    mapaCategorias.set(key, existente);
  }

  // Inclui categorias consultadas que eventualmente ainda não tenham produtos listados
  for (const r of categoriasConsultasRows || []) {
    const nomeCat = String(r.categoria || 'Geral').trim() || 'Geral';
    const key = nomeCat.toLowerCase();
    if (!mapaCategorias.has(key)) {
      mapaCategorias.set(key, {
        categoria: nomeCat,
        icone: iconeCategoriaLoja(nomeCat, mapaIconesCat.get(key)),
        consultas: Number(r.consultas || 0),
        visualizacoesProdutos: 0,
        insercoesCarrinho: 0,
        vendasEfetivadas: 0,
        valorVendido: 0,
        qtdProdutos: 0,
      });
    }
  }

  const categoriasMaisConsultadas = Array.from(mapaCategorias.values())
    .map((c) => ({
      ...c,
      totalConsultas: Math.max(c.consultas, c.visualizacoesProdutos),
    }))
    .filter(
      (c) =>
        c.totalConsultas > 0 ||
        c.visualizacoesProdutos > 0 ||
        c.insercoesCarrinho > 0 ||
        c.vendasEfetivadas > 0,
    )
    .sort(
      (a, b) =>
        b.totalConsultas - a.totalConsultas ||
        b.insercoesCarrinho - a.insercoesCarrinho ||
        b.vendasEfetivadas - a.vendasEfetivadas ||
        a.categoria.localeCompare(b.categoria),
    );

  // 3. Média de permanência no site e média de intervalo de retorno (sem individualizar por cliente)
  const visitasStats = await database
    .prepare(
      `SELECT COUNT(*) AS total_visitas,
              COALESCE(AVG(CASE WHEN duracao_segundos > 0 THEN duracao_segundos ELSE NULL END), 0) AS media_permanencia_seg,
              COALESCE(AVG(CASE WHEN intervalo_retorno_segundos > 0 THEN intervalo_retorno_segundos ELSE NULL END), 0) AS media_retorno_seg,
              COUNT(CASE WHEN intervalo_retorno_segundos > 0 THEN 1 ELSE NULL END) AS total_retornos
         FROM loja_visitas_metricas
        WHERE empresa_id = ?`,
    )
    .bind(empresaId)
    .first();

  const totalVisualizacoes = (produtosMetricas || []).reduce(
    (acc: number, p: any) => acc + Number(p.visualizacoes || 0),
    0,
  );
  const totalInsercoesCarrinho = (produtosMetricas || []).reduce(
    (acc: number, p: any) => acc + Number(p.insercoes_carrinho || 0),
    0,
  );
  const totalUnidadesVendidas = (produtosMetricas || []).reduce(
    (acc: number, p: any) => acc + Number(p.vendas_quantidade || 0),
    0,
  );
  const totalValorVendido = (produtosMetricas || []).reduce(
    (acc: number, p: any) => acc + Number(p.vendas_valor || 0),
    0,
  );

  return {
    resumo: {
      totalVisualizacoes,
      totalInsercoesCarrinho,
      totalUnidadesVendidas,
      totalValorVendido,
      totalVisitas: Number(visitasStats?.total_visitas || 0),
      totalRetornos: Number(visitasStats?.total_retornos || 0),
      mediaPermanenciaSegundos: Math.round(Number(visitasStats?.media_permanencia_seg || 0)),
      mediaIntervaloRetornoSegundos: Math.round(Number(visitasStats?.media_retorno_seg || 0)),
    },
    produtos: produtosMetricas || [],
    categoriasMaisConsultadas,
  };
}

export function gerarManifestoPwaLoja(empresa: {
  codigo: string;
  nome: string;
  cor_primaria?: string | null;
  cor_secundaria?: string | null;
  cor_fundo?: string | null;
  loja_logo?: string | null;
}) {
  const codigo = String(empresa.codigo ?? '').toLowerCase();
  const nome = String(empresa.nome || 'Loja Virtual').trim();
  const shortName = nome.length > 15 ? nome.slice(0, 15).trim() : nome;
  const themeColor =
    !empresa.cor_secundaria || empresa.cor_secundaria === '#111827'
      ? '#ffe600'
      : empresa.cor_secundaria;
  const bgColor =
    !empresa.cor_fundo || empresa.cor_fundo === '#f4f6f9' ? '#ebebeb' : empresa.cor_fundo;

  const iconUrl = `/loja/${codigo}/icon.svg`;
  const icons: Array<{ src: string; sizes: string; type: string; purpose?: string }> = [
    {
      src: iconUrl,
      sizes: '192x192 512x512 any',
      type: 'image/svg+xml',
      purpose: 'any',
    },
    {
      src: iconUrl,
      sizes: '192x192 512x512 any',
      type: 'image/svg+xml',
      purpose: 'maskable',
    },
  ];

  if (empresa.loja_logo && /^https?:\/\//i.test(empresa.loja_logo)) {
    icons.unshift({
      src: empresa.loja_logo,
      sizes: '192x192 512x512',
      type: 'image/png',
      purpose: 'any',
    });
  }

  return {
    id: `/loja/${codigo}`,
    name: nome,
    short_name: shortName,
    description: `Aplicativo oficial da loja ${nome}`,
    start_url: `/loja/${codigo}`,
    scope: `/loja/${codigo}`,
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: bgColor,
    theme_color: themeColor,
    lang: 'pt-BR',
    icons,
  };
}
