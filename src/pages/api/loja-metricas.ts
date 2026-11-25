import type { APIRoute } from 'astro';
import { db, getLojaEmpresa } from '../../lib/auth';
import {
  registrarConsultaCategoria,
  registrarInsercaoCarrinhoProduto,
  registrarPingVisitaLoja,
  registrarVisualizacaoProduto,
  resolverOrigemGeograficaAcesso,
} from '../../lib/empresa-service';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/**
 * Endpoint leve de telemetria da Loja Virtual para alimentar o Dashboard do Backoffice:
 * - visualizar_produto: incrementa visualizações do produto e consultas da categoria
 * - consultar_categoria: incrementa consultas da categoria
 * - inserir_carrinho: incrementa inserções no carrinho do produto
 * - ping_visita: atualiza tempo de permanência anônimo na loja e intervalo de retorno (sem individualizar por cliente)
 */
export const POST: APIRoute = async ({ request }) => {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, erro: 'JSON inválido.' }, 400);
  }

  const empCodigo = String(body?.empresa ?? '').trim().toLowerCase();
  if (!empCodigo) {
    return json({ ok: false, erro: 'Código da empresa obrigatório.' }, 400);
  }

  const empresa = await getLojaEmpresa(empCodigo);
  if (!empresa) {
    return json({ ok: false, erro: 'Loja não encontrada.' }, 404);
  }

  const acao = String(body?.acao ?? '').trim();

  if (acao === 'visualizar_produto') {
    const produtoId = Number(body?.produtoId) || 0;
    if (produtoId > 0) {
      await registrarVisualizacaoProduto(db(), empresa.id, produtoId);
    }
    return json({ ok: true });
  }

  if (acao === 'consultar_categoria') {
    const categoria = String(body?.categoria ?? '').trim();
    if (categoria) {
      await registrarConsultaCategoria(db(), empresa.id, categoria);
    }
    return json({ ok: true });
  }

  if (acao === 'inserir_carrinho') {
    const produtoId = Number(body?.produtoId) || 0;
    const quantidade = Number(body?.quantidade) || 1;
    if (produtoId > 0) {
      await registrarInsercaoCarrinhoProduto(db(), empresa.id, produtoId, quantidade);
    }
    return json({ ok: true });
  }

  if (acao === 'ping_visita') {
    const visitaToken = String(body?.visitaToken ?? '').trim();
    const duracaoSegundos = Number(body?.duracaoSegundos) || 0;
    const intervaloRetornoSegundos =
      body?.intervaloRetornoSegundos !== undefined && body?.intervaloRetornoSegundos !== null
        ? Number(body.intervaloRetornoSegundos)
        : null;

    const cf = (request as any)?.cf || {};
    const origemGeo = resolverOrigemGeograficaAcesso({
      cfCountry: cf.country || request.headers.get('cf-ipcountry'),
      cfCity: cf.city || request.headers.get('cf-ipcity'),
      cfRegion: cf.regionCode || cf.region || request.headers.get('cf-region-code'),
      cfLatitude: cf.latitude || request.headers.get('cf-iplatitude'),
      cfLongitude: cf.longitude || request.headers.get('cf-iplongitude'),
      timezone: String(body?.timezone ?? '').trim(),
      idioma: String(body?.idioma ?? request.headers.get('accept-language') ?? '').trim(),
    });

    await registrarPingVisitaLoja(db(), {
      empresaId: empresa.id,
      visitaToken,
      duracaoSegundos,
      intervaloRetornoSegundos,
      paisCodigo: origemGeo.paisCodigo,
      paisNome: origemGeo.paisNome,
      cidade: origemGeo.cidade,
      regiao: origemGeo.regiao,
      latitude: origemGeo.latitude,
      longitude: origemGeo.longitude,
    });
    return json({ ok: true });
  }

  return json({ ok: false, erro: 'Ação desconhecida.' }, 400);
};
