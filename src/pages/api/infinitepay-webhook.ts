import type { APIRoute } from 'astro';
import { db } from '../../lib/auth';
import { verificarPagamentoInfinitePay } from '../../lib/empresa-service';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/**
 * Webhook oficial para notificações automáticas de pagamento da InfinitePay Checkout.
 * Valida a transação diretamente no endpoint /payment_check da InfinitePay antes de confirmar o pedido como PAGO.
 */
export const POST: APIRoute = async ({ request, url }) => {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, erro: 'JSON inválido no webhook.' }, 400);
  }

  const orderNsuRaw = String(body?.order_nsu ?? url.searchParams.get('pedido') ?? '').trim();
  const matchId = /(\d+)/.exec(orderNsuRaw);
  const pedidoId = matchId ? Number(matchId[1]) : 0;

  if (!pedidoId) {
    return json({ ok: false, erro: 'order_nsu / pedido inválido.' }, 400);
  }

  const empCodigo = String(url.searchParams.get('empresa') ?? '').trim().toLowerCase();
  const txNsu = String(body?.transaction_nsu ?? '').trim() || null;
  const slug = String(body?.invoice_slug ?? body?.slug ?? '').trim() || null;

  if (!txNsu && !slug) {
    return json({ ok: false, erro: 'transaction_nsu ou slug obrigatório para verificação.' }, 400);
  }

  // Busca o pedido e as credenciais InfinitePay da empresa correspondente
  const pedRow = await db()
    .prepare(
      `SELECT p.id, p.empresa_id, e.codigo, e.infinitepay_handle, e.infinitepay_api_key
         FROM loja_pedidos p
         JOIN empresas e ON e.id = p.empresa_id
        WHERE p.id = ?
          AND (? = '' OR e.codigo = ?)`,
    )
    .bind(pedidoId, empCodigo, empCodigo)
    .first<{
      id: number;
      empresa_id: number;
      codigo: string;
      infinitepay_handle: string | null;
      infinitepay_api_key: string | null;
    }>();

  if (!pedRow) {
    return json({ ok: false, erro: 'Pedido não encontrado.' }, 404);
  }

  // Confirma a autenticidade da transação diretamente na API da InfinitePay (/payment_check)
  const verificado = await verificarPagamentoInfinitePay({
    handle: pedRow.infinitepay_handle,
    apiKey: pedRow.infinitepay_api_key,
    orderNsu: `PED-${pedRow.id}`,
    transactionNsu: txNsu,
    slug,
  });

  if (!verificado.pago || !verificado.confirmadoApi) {
    return json(
      { ok: false, erro: 'Transação não confirmada pela API oficial da InfinitePay (/payment_check).' },
      403,
    );
  }

  await db()
    .prepare(
      `UPDATE loja_pedidos
          SET pagamento_status = 'PAGO',
              infinitepay_slug = COALESCE(?, infinitepay_slug),
              infinitepay_transaction_nsu = COALESCE(?, infinitepay_transaction_nsu),
              atualizado_em = datetime('now')
        WHERE id = ? AND empresa_id = ?`,
    )
    .bind(slug, txNsu, pedRow.id, pedRow.empresa_id)
    .run();

  return json({ ok: true, pedidoId: pedRow.id, pagamento_status: 'PAGO' });
};
