import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  registrarEmpresaComUsuario,
  atualizarCadastroEmpresa,
  criarSessaoUsuario,
  validarERenovarSessaoUsuario,
  criarSessaoClienteLoja,
  validarERenovarSessaoClienteLoja,
  criarServico,
  criarAgendamentoLoja,
  listarVisaoAgendaCliente,
  contarNotificacoesAgendamentoBackoffice,
  calcularFreteCorreios,
  gerarPayloadPixNubank,
  gerarUrlLinkIntegradoInfinitePay,
  normalizarHandleInfinitePay,
  verificarPagamentoInfinitePay,
  verificarRateLimitTentativas,
  registrarFalhaTentativa,
  limparTentativasLogin,
  validarUrlExternaSegura,
  gerarManifestoPwaLoja,
  IDLE_TIMEOUT_SEC,
  IDLE_TIMEOUT_MS,
} from '../src/lib/empresa-service.ts';

/**
 * Cria um adaptador compatível com D1Database sobre um arquivo SQLite temporário vazio
 * aplicando todas as migrações da pasta migrations/.
 */
function criarBancoTemporarioVazio() {
  const dbPath = path.join(os.tmpdir(), `backoffice-test-${crypto.randomUUID()}.sqlite`);
  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec('PRAGMA foreign_keys = ON;');

  const migrationsDir = path.resolve(process.cwd(), 'migrations');
  const arquivos = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const arq of arquivos) {
    const sql = fs.readFileSync(path.join(migrationsDir, arq), 'utf-8');
    sqlite.exec(sql);
  }

  const d1Mock = {
    prepare(query: string) {
      let boundParams: unknown[] = [];
      const stmt = sqlite.prepare(query);
      const api = {
        bind(...params: unknown[]) {
          boundParams = params;
          return api;
        },
        async first<T = any>(colName?: string): Promise<T | null> {
          const row = stmt.get(...(boundParams as any[])) as Record<string, any> | undefined;
          if (!row) return null;
          if (colName) return (row[colName] as T) ?? null;
          return row as T;
        },
        async all<T = any>(): Promise<{ results: T[] }> {
          const rows = stmt.all(...(boundParams as any[])) as T[];
          return { results: rows };
        },
        async run() {
          const info = stmt.run(...(boundParams as any[]));
          return { success: true, meta: info };
        },
      };
      return api;
    },
  };

  return {
    dbPath,
    sqlite,
    d1: d1Mock as any,
    destruir() {
      try {
        sqlite.close();
      } catch {}
      for (const sufixo of ['', '-shm', '-wal']) {
        const p = dbPath + sufixo;
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
        }
      }
    },
  };
}

describe('Cadastro de Empresa com Usuário (Banco Temporário Isolado)', () => {
  let ctx: ReturnType<typeof criarBancoTemporarioVazio>;

  beforeEach(() => {
    ctx = criarBancoTemporarioVazio();
    assert.equal(fs.existsSync(ctx.dbPath), true, 'O arquivo do banco de teste deve existir durante o teste');
  });

  afterEach(() => {
    const caminho = ctx.dbPath;
    ctx.destruir();
    assert.equal(fs.existsSync(caminho), false, 'O banco temporário deve ser deletado ao final do teste');
  });

  test('cria uma empresa com seu usuário administrador em um banco vazio e valida as credenciais', async () => {
    // Garante que o banco recém-criado está totalmente vazio
    const antesEmp = await ctx.d1.prepare('SELECT COUNT(*) AS n FROM empresas').first('n');
    const antesUsr = await ctx.d1.prepare('SELECT COUNT(*) AS n FROM usuarios').first('n');
    assert.equal(antesEmp, 0);
    assert.equal(antesUsr, 0);

    const resultado = await registrarEmpresaComUsuario(ctx.d1, {
      codigo: 'empresateste',
      razao: 'EMPRESA TESTE AUTOMATIZADO LTDA',
      fantasia: 'Empresa Teste',
      cnpj: '65.491.970/0001-82',
      nome: 'Administrador de Teste',
      email: 'admin@empresateste.com.br',
      login: 'adminteste',
      senha: 'SenhaForte123!',
    });

    assert.equal(resultado.ok, true);
    assert.ok(resultado.empresaId && resultado.empresaId > 0);
    assert.ok(resultado.usuarioId && resultado.usuarioId > 0);

    // Verifica que a empresa foi gravada no banco temporário
    const empresa = await ctx.d1
      .prepare('SELECT id, codigo, razao_social, nome_fantasia, cnpj, ativa FROM empresas WHERE id = ?')
      .bind(resultado.empresaId)
      .first();

    assert.ok(empresa);
    assert.equal(empresa.codigo, 'empresateste');
    assert.equal(empresa.razao_social, 'EMPRESA TESTE AUTOMATIZADO LTDA');
    assert.equal(empresa.nome_fantasia, 'Empresa Teste');
    assert.equal(empresa.cnpj, '65491970000182');
    assert.equal(empresa.ativa, 1);

    // Verifica que o usuário administrador foi gravado e vinculado à empresa
    const usuario = await ctx.d1
      .prepare('SELECT id, empresa_id, login, nome, email, perfil, ativo, senha_hash FROM usuarios WHERE id = ?')
      .bind(resultado.usuarioId)
      .first();

    assert.ok(usuario);
    assert.equal(usuario.empresa_id, resultado.empresaId);
    assert.equal(usuario.login, 'adminteste');
    assert.equal(usuario.nome, 'Administrador de Teste');
    assert.equal(usuario.email, 'admin@empresateste.com.br');
    assert.equal(usuario.perfil, 'admin');
    assert.equal(usuario.ativo, 1);
    assert.match(usuario.senha_hash, /^pbkdf2\$/);
  });

  test('impede criar duas empresas com o mesmo código', async () => {
    const primeiro = await registrarEmpresaComUsuario(ctx.d1, {
      codigo: 'duplicada',
      razao: 'PRIMEIRA EMPRESA LTDA',
      nome: 'Admin 1',
      login: 'admin1',
      senha: 'SenhaForte123!',
    });
    assert.equal(primeiro.ok, true);

    const segundo = await registrarEmpresaComUsuario(ctx.d1, {
      codigo: 'duplicada',
      razao: 'SEGUNDA EMPRESA LTDA',
      nome: 'Admin 2',
      login: 'admin2',
      senha: 'SenhaForte123!',
    });
    assert.equal(segundo.ok, false);
    assert.equal(segundo.erro, 'Este código de empresa já está em uso.');
  });

  test('derruba a sessão do usuário se permanecer além do tempo limite sem atividade e renova quando ativo', async () => {
    assert.equal(IDLE_TIMEOUT_MS, IDLE_TIMEOUT_SEC * 1000);

    const cad = await registrarEmpresaComUsuario(ctx.d1, {
      codigo: 'emp-timeout',
      razao: 'EMPRESA TIMEOUT LTDA',
      nome: 'Usuario Timeout',
      login: 'usrtimeout',
      senha: 'SenhaForte123!',
    });
    assert.equal(cad.ok, true);

    const t0 = new Date('2026-11-12T12:00:00.000Z').getTime();
    const sessao = await criarSessaoUsuario(ctx.d1, cad.usuarioId!, cad.empresaId!, t0);
    assert.equal(sessao.maxAge, IDLE_TIMEOUT_SEC);

    // Dentro do limite de inatividade (metade do tempo), a sessão está ativa e é renovada
    const tAtivo = t0 + Math.floor(IDLE_TIMEOUT_MS / 2);
    const usuarioAtivo = await validarERenovarSessaoUsuario(ctx.d1, sessao.token, tAtivo);
    assert.ok(usuarioAtivo);
    assert.equal(usuarioAtivo.login, 'usrtimeout');

    // Se ficar IDLE_TIMEOUT_MS + 1 segundo sem fazer nada após o último acesso, a sessão cai
    const tInativo = tAtivo + IDLE_TIMEOUT_MS + 1000;
    const usuarioExpirado = await validarERenovarSessaoUsuario(ctx.d1, sessao.token, tInativo);
    assert.equal(usuarioExpirado, null);

    // Verifica que a sessão expirada foi removida do banco
    const restou = await ctx.d1.prepare('SELECT COUNT(*) AS n FROM sessoes').first('n');
    assert.equal(restou, 0);
  });

  test('derruba a sessão do cliente na loja virtual após o tempo limite de inatividade e renova quando ativo', async () => {
    const cad = await registrarEmpresaComUsuario(ctx.d1, {
      codigo: 'loja-timeout',
      razao: 'LOJA VIRTUAL TIMEOUT LTDA',
      nome: 'Lojista',
      login: 'lojista',
      senha: 'SenhaForte123!',
    });
    assert.equal(cad.ok, true);

    // Cria um cliente na loja
    const cliente = await ctx.d1
      .prepare(
        `INSERT INTO parceiros (empresa_id, tipo_pessoa, eh_cliente, nome, documento, email, ativo, senha_hash)
         VALUES (?, 'F', 1, 'Cliente Loja Teste', '52998224725', 'cliente@lojateste.com', 1, 'pbkdf2$100000$AA==$BB==')
         RETURNING id`,
      )
      .bind(cad.empresaId!)
      .first<{ id: number }>();
    assert.ok(cliente?.id);

    const t0 = new Date('2026-11-12T15:00:00.000Z').getTime();
    const sessaoLoja = await criarSessaoClienteLoja(ctx.d1, cliente!.id, cad.empresaId!, t0);
    assert.equal(sessaoLoja.maxAge, IDLE_TIMEOUT_SEC);

    // Dentro do limite de inatividade, o cliente interage na loja -> sessão é renovada
    const tAtivo = t0 + Math.floor(IDLE_TIMEOUT_MS * 0.8);
    const clienteAtivo = await validarERenovarSessaoClienteLoja(
      ctx.d1,
      sessaoLoja.token,
      'loja-timeout',
      tAtivo,
    );
    assert.ok(clienteAtivo);
    assert.equal(clienteAtivo.nome, 'Cliente Loja Teste');

    // Após IDLE_TIMEOUT_MS + 1 segundo sem atividade desde tAtivo, a conexão na loja deve cair
    const tExpirado = tAtivo + IDLE_TIMEOUT_MS + 1000;
    const clienteExpirado = await validarERenovarSessaoClienteLoja(
      ctx.d1,
      sessaoLoja.token,
      'loja-timeout',
      tExpirado,
    );
    assert.equal(clienteExpirado, null);

    // Confirma que o registro da sessão do cliente foi apagado do banco
    const restouLoja = await ctx.d1.prepare('SELECT COUNT(*) AS n FROM sessoes_clientes').first('n');
    assert.equal(restouLoja, 0);
  });

  test('agenda de serviços: bloqueia horários encavalados, oculta dados de outros clientes e soma no sininho do backoffice', async () => {
    const cad = await registrarEmpresaComUsuario(ctx.d1, {
      codigo: 'clinica-agenda',
      razao: 'CLINICA E SERVICOS LTDA',
      nome: 'Gestor Agenda',
      login: 'gestor',
      senha: 'SenhaForte123!',
    });
    assert.equal(cad.ok, true);
    const empId = cad.empresaId!;

    // Cria dois clientes distintos
    const clienteA = await ctx.d1
      .prepare(
        `INSERT INTO parceiros (empresa_id, tipo_pessoa, eh_cliente, nome, documento, email, ativo)
         VALUES (?, 'F', 1, 'Maria Segredo', '52998224725', 'maria@segredo.com', 1) RETURNING id`,
      )
      .bind(empId)
      .first<{ id: number }>();
    const clienteB = await ctx.d1
      .prepare(
        `INSERT INTO parceiros (empresa_id, tipo_pessoa, eh_cliente, nome, documento, email, ativo)
         VALUES (?, 'F', 1, 'João Silva', '11144477735', 'joao@silva.com', 1) RETURNING id`,
      )
      .bind(empId)
      .first<{ id: number }>();

    // Cadastra 2 serviços com tempos de execução diferentes (60 min e 45 min)
    const srv60 = await criarServico(ctx.d1, empId, {
      nome: 'Procedimento Completo (1h)',
      descricao: 'Atendimento de 60 minutos',
      duracaoMinutos: 60,
      preco: 150,
    });
    const srv45 = await criarServico(ctx.d1, empId, {
      nome: 'Manutenção Rápida (45min)',
      descricao: 'Atendimento de 45 minutos',
      duracaoMinutos: 45,
      preco: 90,
    });
    assert.ok(srv60.id > 0);
    assert.ok(srv45.id > 0);

    // Cliente A agenda das 09:00 às 10:00 (60 min)
    const ag1 = await criarAgendamentoLoja(ctx.d1, {
      empresaId: empId,
      parceiroId: clienteA!.id,
      servicoId: srv60.id,
      data: '2026-11-20',
      horaInicio: '09:00',
      observacoes: 'Observação particular da Maria',
    });
    assert.equal(ag1.ok, true);
    assert.equal(ag1.horaFim, '10:00');

    // Cliente B tenta agendar às 09:30 (encavalando com 09:00-10:00 da Maria) -> DEVE BLOQUEAR
    const agConflito = await criarAgendamentoLoja(ctx.d1, {
      empresaId: empId,
      parceiroId: clienteB!.id,
      servicoId: srv45.id,
      data: '2026-11-20',
      horaInicio: '09:30',
    });
    assert.equal(agConflito.ok, false);

    // Cliente B agenda às 10:00 (10:00 às 10:45, logo após o término das 10:00) -> DEVE PERMITIR
    const ag2 = await criarAgendamentoLoja(ctx.d1, {
      empresaId: empId,
      parceiroId: clienteB!.id,
      servicoId: srv45.id,
      data: '2026-11-20',
      horaInicio: '10:00',
      observacoes: 'Observação do João',
    });
    assert.equal(ag2.ok, true);
    assert.equal(ag2.horaFim, '10:45');

    // Sininho do Backoffice deve apresentar o número 2 (dois agendamentos marcados não lidos)
    const qtdSino = await contarNotificacoesAgendamentoBackoffice(ctx.d1, empId);
    assert.equal(qtdSino, 2);

    // Visão da agenda para o Cliente B (João):
    // - Horário 09:00-10:00 aparece apenas como OCUPADO, sem nenhum dado de Maria ou do serviço dela
    // - Horário 10:00-10:45 aparece como MEU, com os dados do próprio agendamento de João
    const visaoJoao = await listarVisaoAgendaCliente(ctx.d1, {
      empresaId: empId,
      parceiroId: clienteB!.id,
      data: '2026-11-20',
    });
    assert.equal(visaoJoao.length, 2);

    const slotMariaVistoPorJoao = visaoJoao[0];
    assert.equal(slotMariaVistoPorJoao.tipo, 'OCUPADO');
    assert.equal(slotMariaVistoPorJoao.horaInicio, '09:00');
    assert.equal(slotMariaVistoPorJoao.horaFim, '10:00');
    assert.equal((slotMariaVistoPorJoao as any).clienteNome, undefined);
    assert.equal((slotMariaVistoPorJoao as any).servicoNome, undefined);
    assert.equal((slotMariaVistoPorJoao as any).observacoes, undefined);
    assert.equal(JSON.stringify(slotMariaVistoPorJoao).includes('Maria'), false);
    assert.equal(JSON.stringify(slotMariaVistoPorJoao).includes('Procedimento Completo'), false);

    const slotProprioJoao = visaoJoao[1];
    assert.equal(slotProprioJoao.tipo, 'MEU');
    assert.equal(slotProprioJoao.horaInicio, '10:00');
    assert.equal(slotProprioJoao.horaFim, '10:45');
    assert.equal(slotProprioJoao.servicoNome, 'Manutenção Rápida (45min)');
    assert.equal(slotProprioJoao.observacoes, 'Observação do João');

    // Bloqueia agendamento em dia da semana sem funcionamento (2026-11-22 é Domingo = 0)
    const agDomingo = await criarAgendamentoLoja(ctx.d1, {
      empresaId: empId,
      parceiroId: clienteB!.id,
      servicoId: srv45.id,
      data: '2026-11-22', // Domingo
      horaInicio: '09:00',
      diasSemanaFuncionamento: '1,2,3,4,5', // Somente Segunda a Sexta
    });
    assert.equal(agDomingo.ok, false);
    assert.match(agDomingo.erro || '', /não há prestação de serviços/i);

    // Bloqueia agendamento em data específica fechada/feriado (ex: 2026-11-25)
    const agFeriado = await criarAgendamentoLoja(ctx.d1, {
      empresaId: empId,
      parceiroId: clienteB!.id,
      servicoId: srv45.id,
      data: '2026-11-25', // Quarta-feira, porém listada como feriado/folga
      horaInicio: '09:00',
      diasSemanaFuncionamento: '1,2,3,4,5',
      datasFechadas: '2026-11-25, 2026-12-25',
    });
    assert.equal(agFeriado.ok, false);
    assert.match(agFeriado.erro || '', /não há prestação de serviços/i);
  });

  test('calcula frete via Correios (PAC e SEDEX) considerando peso físico, dimensões cúbicas e distância por CEP', async () => {
    // Mesmo estado (SP -> SP) com 2 unidades de produto de 1.2kg e caixa 30x20x15cm
    const cotacaoLocal = calcularFreteCorreios({
      cepOrigem: '01001-000',
      cepDestino: '13010-000',
      itens: [
        {
          quantidade: 2,
          pesoKg: 1.2,
          comprimentoCm: 30,
          larguraCm: 20,
          alturaCm: 15,
          precoUnitario: 120,
        },
      ],
    });

    assert.equal(cotacaoLocal.ok, true);
    assert.equal(cotacaoLocal.pesoFisicoKg, 2.4);
    assert.ok(cotacaoLocal.pesoCubicoKg > 0);
    assert.ok(cotacaoLocal.pesoTarifadoKg >= 2.4);
    assert.ok(cotacaoLocal.opcoes.length >= 2);

    const pacLocal = cotacaoLocal.opcoes.find((o) => o.codigo === 'PAC');
    const sedexLocal = cotacaoLocal.opcoes.find((o) => o.codigo === 'SEDEX');
    assert.ok(pacLocal && sedexLocal);
    assert.ok(sedexLocal.valor > pacLocal.valor, 'SEDEX deve ter valor superior ao PAC');
    assert.ok(sedexLocal.prazoDias <= pacLocal.prazoDias, 'SEDEX deve ter prazo menor ou igual ao PAC');

    // Interestadual distante (SP -> AM) deve custar mais que envio dentro do mesmo estado
    const cotacaoDistante = calcularFreteCorreios({
      cepOrigem: '01001-000',
      cepDestino: '69005-000',
      itens: [
        {
          quantidade: 2,
          pesoKg: 1.2,
          comprimentoCm: 30,
          larguraCm: 20,
          alturaCm: 15,
          precoUnitario: 120,
        },
      ],
    });
    assert.equal(cotacaoDistante.ok, true);
    const pacDistante = cotacaoDistante.opcoes.find((o) => o.codigo === 'PAC')!;
    assert.ok(pacDistante.valor > pacLocal.valor, 'Frete interestadual distante deve ser maior que o estadual');
  });

  test('gera código Pix Copia e Cola (BR Code EMV com CRC16) válido para conta Nubank com valor do pedido', () => {
    const payload = gerarPayloadPixNubank({
      chavePix: '65.491.970/0001-82',
      nomeRecebedor: 'VANDER EVARISTO LTDA',
      cidadeRecebedor: 'São Paulo',
      valor: 189.9,
      txid: 'PEDIDO42',
    });

    // Deve começar com 000201 e conter br.gov.bcb.pix, a chave limpa, o valor 189.90, o txid PEDIDO42 e o CRC16 (6304 + 4 hex)
    assert.match(payload, /^000201/);
    assert.ok(payload.includes('br.gov.bcb.pix'));
    assert.ok(payload.includes('65491970000182'));
    assert.ok(payload.includes('5406189.90'));
    assert.ok(payload.includes('PEDIDO42'));
    assert.match(payload, /6304[0-9A-F]{4}$/);
  });

  test('gera Web App Manifest PWA dinâmico personalizado por loja', () => {
    const manifest = gerarManifestoPwaLoja({
      codigo: 'vanderltda',
      nome: 'Vander Evaristo Store',
      cor_primaria: '#3483fa',
      cor_secundaria: '#ffe600',
      cor_fundo: '#ebebeb',
      loja_logo: null,
    });

    assert.equal(manifest.name, 'Vander Evaristo Store');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, '/loja/vanderltda');
    assert.equal(manifest.scope, '/loja/vanderltda');
    assert.equal(manifest.theme_color, '#ffe600');
    assert.equal(manifest.background_color, '#ebebeb');
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
  });

  test('permite alterar os dados cadastrais de uma empresa existente e do seu administrador', async () => {
    const cad = await registrarEmpresaComUsuario(ctx.d1, {
      codigo: 'loja-original',
      razao: 'RAZAO ORIGINAL LTDA',
      fantasia: 'Fantasia Antiga',
      cnpj: '65.491.970/0001-82',
      nome: 'Admin Antigo',
      email: 'antigo@loja.com',
      login: 'adminantigo',
      senha: 'SenhaForte123!',
    });
    assert.equal(cad.ok, true);

    const upd = await atualizarCadastroEmpresa(ctx.d1, {
      id: cad.empresaId!,
      codigo: 'loja-alterada',
      razao: 'NOVA RAZAO SOCIAL ALTERADA LTDA',
      fantasia: 'Nova Fantasia',
      cnpj: '12.ABC.345/01DE-35', // suporta CNPJ numérico ou novo formato alfanumérico
      ativa: 1,
      adminId: cad.usuarioId!,
      adminNome: 'Admin Novo Nome',
      adminLogin: 'adminnovo',
      adminEmail: 'novo@loja.com',
    });
    assert.equal(upd.ok, true);

    const empDepois = await ctx.d1
      .prepare('SELECT codigo, razao_social, nome_fantasia, cnpj FROM empresas WHERE id = ?')
      .bind(cad.empresaId!)
      .first();
    assert.equal(empDepois.codigo, 'loja-alterada');
    assert.equal(empDepois.razao_social, 'NOVA RAZAO SOCIAL ALTERADA LTDA');
    assert.equal(empDepois.nome_fantasia, 'Nova Fantasia');
    assert.equal(empDepois.cnpj, '12ABC34501DE35');

    const usrDepois = await ctx.d1
      .prepare('SELECT nome, login, email FROM usuarios WHERE id = ?')
      .bind(cad.usuarioId!)
      .first();
    assert.equal(usrDepois.nome, 'Admin Novo Nome');
    assert.equal(usrDepois.login, 'adminnovo');
    assert.equal(usrDepois.email, 'novo@loja.com');
  });

  test('gera checkout integrado InfinitePay normalizando InfiniteTag ($handle) e convertendo itens + frete para centavos', () => {
    assert.equal(normalizarHandleInfinitePay('$MinhaLoja'), 'minhaloja');
    assert.equal(normalizarHandleInfinitePay('  $$vanderltda  '), 'vanderltda');

    const res = gerarUrlLinkIntegradoInfinitePay({
      handle: '$vanderltda',
      pedidoId: 99,
      itens: [
        { nome: 'Smartphone 5G', precoUnitario: 1999.9, quantidade: 1 },
        { nome: 'Capinha Protetora', precoUnitario: 49.5, quantidade: 2 },
      ],
      valorFrete: 28.4,
      freteModalidade: 'Correios SEDEX',
      clienteNome: 'Maria Souza',
      clienteEmail: 'maria@exemplo.com',
      clienteTelefone: '(11) 98888-7777',
      urlRetorno: 'https://loja.exemplo.com/loja/vanderltda/meus-pedidos?infinitepay_pedido=99',
    });

    assert.equal(res.orderNsu, 'PED-99');
    assert.equal(res.itemsPayload.length, 3);
    // Preços em centavos (inteiros)
    assert.equal(res.itemsPayload[0].price, 199990);
    assert.equal(res.itemsPayload[0].quantity, 1);
    assert.equal(res.itemsPayload[1].price, 4950);
    assert.equal(res.itemsPayload[1].quantity, 2);
    assert.equal(res.itemsPayload[2].price, 2840);
    assert.equal(res.itemsPayload[2].quantity, 1);
    assert.ok(res.url && res.url.startsWith('https://checkout.infinitepay.io/vanderltda?'));
    assert.ok(res.url!.includes('order_nsu=PED-99'));
  });

  test('segurança: bloqueia força bruta após 5 tentativas falhas, impede bypass de pagamento sem confirmação da API e bloqueia SSRF', async () => {
    const chave = 'bo:lojateste:admin:127.0.0.1';
    const baseNow = Date.now();

    for (let i = 1; i <= 4; i++) {
      const f = await registrarFalhaTentativa(ctx.d1, chave, baseNow);
      assert.equal(f.bloqueado, false);
      const check = await verificarRateLimitTentativas(ctx.d1, chave, baseNow);
      assert.equal(check.permitido, true);
    }

    // 5ª tentativa falha deve acionar bloqueio por 15 minutos
    const f5 = await registrarFalhaTentativa(ctx.d1, chave, baseNow);
    assert.equal(f5.bloqueado, true);

    const bloqueadoAgora = await verificarRateLimitTentativas(ctx.d1, chave, baseNow + 60_000);
    assert.equal(bloqueadoAgora.permitido, false);
    assert.ok((bloqueadoAgora.minutosRestantes ?? 0) >= 14);

    // Após limpar tentativas no login bem-sucedido, libera imediatamente
    await limparTentativasLogin(ctx.d1, chave);
    const aposLimpar = await verificarRateLimitTentativas(ctx.d1, chave, baseNow + 60_000);
    assert.equal(aposLimpar.permitido, true);

    // Anti-bypass InfinitePay: nunca deve aprovar pagamento apenas por passar transaction_nsu na URL se a API oficial não confirmar
    const checkFalso = await verificarPagamentoInfinitePay({
      handle: 'vanderltda',
      orderNsu: 'PED-999',
      transactionNsu: 'tx-forjado-pelo-cliente',
      slug: 'slug-forjado',
    });
    assert.equal(checkFalso.pago, false);
    assert.equal(checkFalso.confirmadoApi, false);

    // Anti-SSRF e XSS em URLs externas configuráveis
    assert.equal(validarUrlExternaSegura('https://hooks.zapier.com/hooks/catch/123/abc'), true);
    assert.equal(validarUrlExternaSegura('http://127.0.0.1:8080/admin'), false);
    assert.equal(validarUrlExternaSegura('https://169.254.169.254/latest/meta-data/'), false);
    assert.equal(validarUrlExternaSegura('https://localhost/webhook'), false);
    assert.equal(validarUrlExternaSegura('javascript:alert(1)'), false);
  });
});
