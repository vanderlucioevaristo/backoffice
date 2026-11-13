import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  registrarEmpresaComUsuario,
  criarSessaoUsuario,
  validarERenovarSessaoUsuario,
  criarSessaoClienteLoja,
  validarERenovarSessaoClienteLoja,
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

  test('derruba a sessão do usuário se permanecer mais de 5 minutos sem atividade e renova quando ativo', async () => {
    assert.equal(IDLE_TIMEOUT_MS, 5 * 60 * 1000);

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
    assert.equal(sessao.maxAge, 300);

    // Após 3 minutos (dentro do limite de 5 min), a sessão está ativa e é renovada por mais 5 min
    const t3min = t0 + 3 * 60 * 1000;
    const usuarioAtivo = await validarERenovarSessaoUsuario(ctx.d1, sessao.token, t3min);
    assert.ok(usuarioAtivo);
    assert.equal(usuarioAtivo.login, 'usrtimeout');

    // Se ficar 5 minutos e 1 segundo sem fazer nada após o último acesso (t3min), a sessão cai
    const tInativo = t3min + 5 * 60 * 1000 + 1000;
    const usuarioExpirado = await validarERenovarSessaoUsuario(ctx.d1, sessao.token, tInativo);
    assert.equal(usuarioExpirado, null);

    // Verifica que a sessão expirada foi removida do banco
    const restou = await ctx.d1.prepare('SELECT COUNT(*) AS n FROM sessoes').first('n');
    assert.equal(restou, 0);
  });

  test('derruba a sessão do cliente na loja virtual após 5 minutos de inatividade e renova quando ativo', async () => {
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
    assert.equal(sessaoLoja.maxAge, 300);

    // Após 4 minutos, o cliente interage na loja -> sessão é renovada por mais 5 minutos
    const t4min = t0 + 4 * 60 * 1000;
    const clienteAtivo = await validarERenovarSessaoClienteLoja(
      ctx.d1,
      sessaoLoja.token,
      'loja-timeout',
      t4min,
    );
    assert.ok(clienteAtivo);
    assert.equal(clienteAtivo.nome, 'Cliente Loja Teste');

    // Após 5 minutos e 1 segundo sem atividade desde t4min, a conexão na loja deve cair
    const tExpirado = t4min + 5 * 60 * 1000 + 1000;
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
});
