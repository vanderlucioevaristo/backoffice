import type { APIRoute } from 'astro';
import { db } from '../../lib/auth';
import { onlyDigits, UNIDADES, parseNum } from '../../lib/validate';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

export const POST: APIRoute = async ({ request, locals }) => {
  const u = locals.user;
  if (!u) return json({ erro: 'Não autenticado.' }, 401);

  const body: any = await request.json().catch(() => ({}));
  const fornecedorId = Number(body.fornecedor_id) || 0;
  const lista: any[] = Array.isArray(body.produtos) ? body.produtos : [];

  if (lista.length === 0) {
    return json({ erro: 'Nenhum produto selecionado para cadastrar.' }, 400);
  }

  let fornOk = false;
  if (fornecedorId > 0) {
    const fRow = await db()
      .prepare('SELECT id FROM parceiros WHERE id = ? AND empresa_id = ? AND eh_fornecedor = 1')
      .bind(fornecedorId, u.empresaId)
      .first();
    fornOk = !!fRow;
  }

  const criados: Array<{
    idx: number;
    id: number;
    codigo: string | null;
    nome: string;
    unidade: string;
    preco_custo: number;
    preco_venda: number;
  }> = [];

  for (const item of lista) {
    const idx = Number(item.idx ?? -1);
    const nome = String(item.nome ?? '').trim().slice(0, 200);
    if (!nome) continue;

    let codigo = String(item.codigo ?? '').trim().slice(0, 50) || null;
    const ean = String(item.ean ?? '').trim().slice(0, 50) || null;
    const ncmRaw = onlyDigits(String(item.ncm ?? ''));
    const ncm = ncmRaw.length === 8 ? ncmRaw : null;
    const unRaw = String(item.unidade ?? 'UN').trim().toUpperCase();
    const unidade = UNIDADES.includes(unRaw) ? unRaw : 'UN';
    const precoCusto = Math.max(0, parseNum(item.preco_custo, 0));
    const precoVenda = Math.max(0, parseNum(item.preco_venda, precoCusto));

    // Verifica se já existe produto com este código ou EAN na empresa
    let existente: { id: number; codigo: string | null; nome: string; unidade: string; preco_custo: number; preco_venda: number } | null = null;
    if (ean) {
      existente = await db()
        .prepare('SELECT id, codigo, nome, unidade, preco_custo, preco_venda FROM produtos WHERE empresa_id = ? AND codigo_barras = ?')
        .bind(u.empresaId, ean)
        .first();
    }
    if (!existente && codigo) {
      const porCod = await db()
        .prepare('SELECT id, codigo, nome, unidade, preco_custo, preco_venda FROM produtos WHERE empresa_id = ? AND codigo = ?')
        .bind(u.empresaId, codigo)
        .first<{ id: number; codigo: string | null; nome: string; unidade: string; preco_custo: number; preco_venda: number }>();
      // Se o código já pertence a um produto de mesmo nome, reaproveita; se for outro produto, evita colisão de código interno
      if (porCod && porCod.nome.toLowerCase() === nome.toLowerCase()) {
        existente = porCod;
      } else if (porCod) {
        codigo = null;
      }
    }

    let prodId: number;
    let prodFinal: { id: number; codigo: string | null; nome: string; unidade: string; preco_custo: number; preco_venda: number };

    if (existente) {
      prodId = existente.id;
      prodFinal = existente;
    } else {
      const ins = await db()
        .prepare(
          `INSERT INTO produtos
             (empresa_id, codigo, codigo_barras, nome, unidade, ncm, preco_custo, preco_venda, estoque_atual, estoque_minimo, ativo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1)
           RETURNING id`,
        )
        .bind(u.empresaId, codigo, ean, nome, unidade, ncm, precoCusto, precoVenda)
        .first<{ id: number }>();
      prodId = ins!.id;
      prodFinal = {
        id: prodId,
        codigo,
        nome,
        unidade,
        preco_custo: precoCusto,
        preco_venda: precoVenda,
      };
    }

    if (fornOk) {
      await db()
        .prepare(
          `INSERT INTO produtos_fornecedores
             (empresa_id, produto_id, fornecedor_id, codigo_fornecedor, ultimo_preco, preferencial)
           VALUES (?, ?, ?, ?, ?, 1)
           ON CONFLICT (empresa_id, produto_id, fornecedor_id)
           DO UPDATE SET codigo_fornecedor = COALESCE(excluded.codigo_fornecedor, produtos_fornecedores.codigo_fornecedor),
                         ultimo_preco      = COALESCE(excluded.ultimo_preco, produtos_fornecedores.ultimo_preco)`,
        )
        .bind(u.empresaId, prodId, fornecedorId, String(item.codigo ?? '').trim() || null, precoCusto)
        .run();
    }

    criados.push({ idx, ...prodFinal });
  }

  return json({ ok: true, criados });
};
