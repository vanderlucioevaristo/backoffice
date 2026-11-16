import { onlyDigits, validCNPJ, validEmail } from './validate.ts';

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
  const cnpj = onlyDigits(String(dados.cnpj ?? '').trim());
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
  if (cnpj && !validCNPJ(cnpj)) {
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

export async function criarSessaoUsuario(
  database: any,
  usuarioId: number,
  empresaId: number,
  nowMs = Date.now(),
) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const expira = new Date(nowMs + IDLE_TIMEOUT_MS).toISOString();
  await database
    .prepare('INSERT INTO sessoes (token_hash, usuario_id, empresa_id, expira_em) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), usuarioId, empresaId, expira)
    .run();
  return { token, maxAge: IDLE_TIMEOUT_SEC };
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
    // Remove sessão vencida (> 5 minutos de inatividade)
    await database.prepare('DELETE FROM sessoes WHERE token_hash = ?').bind(hash).run();
    return null;
  }

  // Renova o prazo de inatividade por mais 5 minutos a partir desta atividade
  const novaExpiracao = new Date(nowMs + IDLE_TIMEOUT_MS).toISOString();
  await database
    .prepare('UPDATE sessoes SET expira_em = ? WHERE token_hash = ?')
    .bind(novaExpiracao, hash)
    .run();

  return row;
}

export async function criarSessaoClienteLoja(
  database: any,
  parceiroId: number,
  empresaId: number,
  nowMs = Date.now(),
) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const expira = new Date(nowMs + IDLE_TIMEOUT_MS).toISOString();
  await database
    .prepare('INSERT INTO sessoes_clientes (token_hash, parceiro_id, empresa_id, expira_em) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), parceiroId, empresaId, expira)
    .run();
  return { token, maxAge: IDLE_TIMEOUT_SEC };
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
    // Remove sessão vencida do cliente na loja (> 5 minutos de inatividade)
    await database.prepare('DELETE FROM sessoes_clientes WHERE token_hash = ?').bind(hash).run();
    return null;
  }

  // Renova por mais 5 minutos a sessão ativa do cliente na loja
  const novaExpiracao = new Date(nowMs + IDLE_TIMEOUT_MS).toISOString();
  await database
    .prepare('UPDATE sessoes_clientes SET expira_em = ? WHERE token_hash = ?')
    .bind(novaExpiracao, hash)
    .run();

  return row;
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
      nome: 'PAC (Correios)',
      valor: valorPac,
      prazoDias: prazoPac,
      descricao: `Entrega econômica Correios em até ${prazoPac} dia(s) úteis`,
    },
    {
      codigo: 'SEDEX',
      codigoServico: '04014',
      nome: 'SEDEX (Correios)',
      valor: valorSedex,
      prazoDias: prazoSedex,
      descricao: `Entrega expressa Correios em até ${prazoSedex} dia(s) útil(eis)`,
    },
    {
      codigo: 'RETIRADA',
      codigoServico: 'RETIRADA',
      nome: 'Retirada na Loja',
      valor: 0,
      prazoDias: 1,
      descricao: 'Retirar pessoalmente no endereço da loja (sem custo de frete)',
    },
  ];

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
