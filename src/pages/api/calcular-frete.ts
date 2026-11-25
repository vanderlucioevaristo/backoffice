import type { APIRoute } from 'astro';
import {
  CLIENT_SESSION_COOKIE,
  db,
  getLojaEmpresa,
  getSessionClient,
} from '../../lib/auth';
import { calcularFreteCorreios, type ItemFreteCorreios } from '../../lib/empresa-service';
import { nowLocalIso, onlyDigits } from '../../lib/validate';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, erro: 'Requisição inválida.' }, 400);
  }

  const empCodigo = String(body.empresa ?? locals.user?.empresaCodigo ?? '').trim().toLowerCase();
  const cepDestino = onlyDigits(String(body.cepDestino ?? ''));

  if (!/^\d{8}$/.test(cepDestino)) {
    return json({ ok: false, erro: 'Informe um CEP válido com 8 dígitos para calcular o frete.' }, 400);
  }

  const empresa = await getLojaEmpresa(empCodigo);
  if (!empresa) {
    return json({ ok: false, erro: 'Loja não encontrada.' }, 404);
  }

  const agora = nowLocalIso();
  const itensFrete: ItemFreteCorreios[] = [];

  if (Array.isArray(body.itens) && body.itens.length > 0) {
    for (const raw of body.itens) {
      const pid = Number(raw.produtoId || raw.produto_id) || 0;
      const qtd = Math.max(0, Number(raw.quantidade) || 0);
      if (pid <= 0 || qtd <= 0) continue;

      const prod = await db()
        .prepare(
          `SELECT p.preco_venda, p.peso_kg, p.comprimento_cm, p.largura_cm, p.altura_cm,
                  COALESCE(o.preco_oferta, p.preco_venda) AS preco_final
             FROM produtos p
             LEFT JOIN loja_ofertas o
               ON o.produto_id = p.id
              AND o.empresa_id = p.empresa_id
              AND o.ativa = 1
              AND (o.inicio_em IS NULL OR o.inicio_em = '' OR o.inicio_em <= ?)
              AND (o.fim_em IS NULL OR o.fim_em = '' OR o.fim_em >= ?)
            WHERE p.id = ? AND p.empresa_id = ?`,
        )
        .bind(agora, agora, pid, empresa.id)
        .first<{
          preco_final: number;
          peso_kg: number;
          comprimento_cm: number;
          largura_cm: number;
          altura_cm: number;
        }>();

      if (prod) {
        itensFrete.push({
          quantidade: qtd,
          pesoKg: prod.peso_kg,
          comprimentoCm: prod.comprimento_cm,
          larguraCm: prod.largura_cm,
          alturaCm: prod.altura_cm,
          precoUnitario: Number(raw.precoUnitario ?? prod.preco_final),
        });
      }
    }
  } else {
    // Se não enviou itens explicitamente, lê do carrinho do cliente logado na loja
    const token = cookies.get(CLIENT_SESSION_COOKIE)?.value;
    const cliente = token ? await getSessionClient(token, empresa.codigo) : null;
    if (cliente) {
      const { results } = await db()
        .prepare(
          `SELECT c.quantidade,
                  COALESCE(o.preco_oferta, p.preco_venda) AS preco_final,
                  p.peso_kg, p.comprimento_cm, p.largura_cm, p.altura_cm
             FROM loja_carrinho c
             JOIN produtos p ON p.id = c.produto_id AND p.empresa_id = c.empresa_id
             LEFT JOIN loja_ofertas o
               ON o.produto_id = p.id
              AND o.empresa_id = p.empresa_id
              AND o.ativa = 1
              AND (o.inicio_em IS NULL OR o.inicio_em = '' OR o.inicio_em <= ?)
              AND (o.fim_em IS NULL OR o.fim_em = '' OR o.fim_em >= ?)
            WHERE c.empresa_id = ? AND c.parceiro_id = ?`,
        )
        .bind(agora, agora, empresa.id, cliente.id)
        .all<{
          quantidade: number;
          preco_final: number;
          peso_kg: number;
          comprimento_cm: number;
          largura_cm: number;
          altura_cm: number;
        }>();

      for (const r of results) {
        itensFrete.push({
          quantidade: r.quantidade,
          pesoKg: r.peso_kg,
          comprimentoCm: r.comprimento_cm,
          larguraCm: r.largura_cm,
          alturaCm: r.altura_cm,
          precoUnitario: r.preco_final,
        });
      }
    }
  }

  if (itensFrete.length === 0) {
    return json({ ok: false, erro: 'Adicione pelo menos um produto para calcular o frete.' }, 400);
  }

  const usarMultiFornecedor =
    body.multiFornecedor === true || empresa.frete_provedor === 'CEPCERTO';

  const resultado = calcularFreteCorreios({
    cepOrigem: empresa.cep_origem || '01001000',
    cepDestino,
    itens: itensFrete,
    multiFornecedor: usarMultiFornecedor,
  });

  // Tenta enriquecer com cidade/UF do CEP de destino via ViaCEP (opcional, sem bloquear se offline)
  let localidadeDestino = '';
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${cepDestino}/json/`, {
      headers: { Accept: 'application/json' },
    });
    if (resp.ok) {
      const d: any = await resp.json();
      if (!d.erro && d.localidade) {
        localidadeDestino = [d.logradouro, d.bairro, `${d.localidade}/${d.uf}`]
          .filter(Boolean)
          .join(' — ');
      }
    }
  } catch {
    // Sem rede ou timeout: segue normalmente com o cálculo local dos Correios
  }

  return json({
    ...resultado,
    localidadeDestino,
  });
};
