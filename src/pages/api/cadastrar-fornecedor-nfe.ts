import type { APIRoute } from 'astro';
import { db } from '../../lib/auth';
import { onlyDigits, validCPF, validCNPJ, UFS, formatDoc } from '../../lib/validate';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

export const POST: APIRoute = async ({ request, locals }) => {
  const u = locals.user;
  if (!u) return json({ erro: 'Não autenticado.' }, 401);

  const b: any = await request.json().catch(() => ({}));
  const documento = onlyDigits(String(b.documento ?? ''));
  const nome = String(b.nome ?? '').trim().slice(0, 200);
  const nomeFantasia = String(b.nome_fantasia ?? '').trim().slice(0, 200) || null;
  const rgIe = String(b.rg_ie ?? '').trim().slice(0, 30) || null;
  const telefone = String(b.telefone ?? '').trim().slice(0, 30) || null;
  const cep = onlyDigits(String(b.cep ?? '')) || null;
  const logradouro = String(b.logradouro ?? '').trim().slice(0, 200) || null;
  const numero = String(b.numero ?? '').trim().slice(0, 20) || null;
  const complemento = String(b.complemento ?? '').trim().slice(0, 100) || null;
  const bairro = String(b.bairro ?? '').trim().slice(0, 100) || null;
  const cidade = String(b.cidade ?? '').trim().slice(0, 100) || null;
  const ufRaw = String(b.uf ?? '').trim().toUpperCase();
  const uf = UFS.includes(ufRaw) ? ufRaw : null;

  const tipoPessoa = documento.length === 11 ? 'F' : 'J';

  if (!nome) return json({ erro: 'Informe a razão social ou nome do fornecedor.' }, 400);
  if (documento) {
    if (tipoPessoa === 'F' && !validCPF(documento)) return json({ erro: 'CPF do fornecedor inválido.' }, 400);
    if (tipoPessoa === 'J' && !validCNPJ(documento)) return json({ erro: 'CNPJ do fornecedor inválido.' }, 400);
  }

  // Se já existe parceiro com este documento na empresa (ex.: estava apenas como cliente),
  // marca eh_fornecedor = 1 e atualiza os dados.
  let existente: { id: number; nome: string; documento: string | null } | null = null;
  if (documento) {
    existente = await db()
      .prepare('SELECT id, nome, documento FROM parceiros WHERE empresa_id = ? AND documento = ?')
      .bind(u.empresaId, documento)
      .first();
  }

  let fornId: number;
  if (existente) {
    await db()
      .prepare(
        `UPDATE parceiros
            SET eh_fornecedor = 1, ativo = 1,
                nome = ?, nome_fantasia = COALESCE(?, nome_fantasia), rg_ie = COALESCE(?, rg_ie),
                telefone = COALESCE(?, telefone), cep = COALESCE(?, cep),
                logradouro = COALESCE(?, logradouro), numero = COALESCE(?, numero),
                complemento = COALESCE(?, complemento), bairro = COALESCE(?, bairro),
                cidade = COALESCE(?, cidade), uf = COALESCE(?, uf),
                atualizado_em = datetime('now')
          WHERE id = ? AND empresa_id = ?`,
      )
      .bind(nome, nomeFantasia, rgIe, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf, existente.id, u.empresaId)
      .run();
    fornId = existente.id;
  } else {
    const ins = await db()
      .prepare(
        `INSERT INTO parceiros
           (empresa_id, tipo_pessoa, eh_cliente, eh_fornecedor, nome, nome_fantasia,
            documento, rg_ie, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf, ativo)
         VALUES (?, ?, 0, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
         RETURNING id`,
      )
      .bind(u.empresaId, tipoPessoa, nome, nomeFantasia, documento || null, rgIe, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf)
      .first<{ id: number }>();
    fornId = ins!.id;
  }

  return json({
    ok: true,
    fornecedor: {
      id: fornId,
      nome,
      documento,
      label: `${nome}${documento ? ` (${formatDoc(documento)})` : ''}`,
    },
  });
};
