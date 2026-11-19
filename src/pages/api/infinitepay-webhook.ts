import type { APIRoute } from 'astro';
import { db } from '../../lib/auth';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/**
 * Webhook oficial para notificações automáticas de pagamento da InfinitePay Checkout.
 * Suporta tanto envio de JSON com order_nsu ("PED-123" ou "123"), transaction_nsu, invoice_slug/slug e paid/status
 * quanto parâmetros ?empresa=...&pedido=... na URL.
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
  const txNsu = String(body?.transaction_nsu ?? body?.capture_method ?? '').trim() || null;
  const slug = String(body?.invoice_slug ?? body?.slug ?? '').trim() || null;

  const isPaid =
    body?.paid === true ||
    body?.status === 'paid' ||
    body?.status === 'approved' ||
    (Boolean(body?.transaction_nsu) && body?.paid !== false);

  if (!isPaid) {
    return json({ ok: true, ignorado: true, motivo: 'Evento ainda não confirmado como pago.' });
  }

  if (empCodigo) {
    await db()
      .prepare(
        `UPDATE loja_pedidos
            SET pagamento_status = 'PAGO',
                infinitepay_slug = COALESCE(?, infinitepay_slug),
                infinitepay_transaction_nsu = COALESCE(?, infinitepay_transaction_nsu),
                atualizado_em = datetime('now')
          WHERE id = ?
            AND empresa_id = (SELECT id FROM empresas WHERE codigo = ?)`,
      )
      .bind(slug, txNsu, pedidoId, empCodigo)
      .run();
  } else {
    await db()
      .prepare(
        `UPDATE loja_pedidos
            SET pagamento_status = 'PAGO',
                infinitepay_slug = COALESCE(?, infinitepay_slug),
                infinitepay_transaction_nsu = COALESCE(?, infinitepay_transaction_nsu),
                atualizado_em = datetime('now')
          WHERE id = ?`,
      )
      .bind(slug, txNsu, pedidoId)
      .run();
  }

  return json({ ok: true, pedidoId, pagamento_status: 'PAGO' });
};
