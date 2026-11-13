import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { registrarEmpresaComUsuario } from '../src/lib/empresa-service.ts';

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
});
