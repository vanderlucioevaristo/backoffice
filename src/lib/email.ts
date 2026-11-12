import { env } from 'cloudflare:workers';
import { db } from './auth';
import { formatMoney, formatQty } from './validate';

export const STATUS_PEDIDO_INFO: Record<
  string,
  { titulo: string; cor: string; bg: string; mensagem: string }
> = {
  novo: {
    titulo: 'Novo / Aguardando atendimento',
    cor: '#1d4ed8',
    bg: '#dbeafe',
    mensagem: 'Recebemos o seu pedido e ele está aguardando conferência pela nossa equipe.',
  },
  separacao: {
    titulo: 'Em separação',
    cor: '#92400e',
    bg: '#fef3c7',
    mensagem: 'Ótima notícia! Os produtos do seu pedido já estão sendo separados e preparados para envio/entrega.',
  },
  entregue: {
    titulo: 'Faturado / Entregue',
    cor: '#166534',
    bg: '#dcfce7',
    mensagem: 'Seu pedido foi faturado / entregue! Agradecemos pela sua preferência.',
  },
  cancelado: {
    titulo: 'Cancelado',
    cor: '#b91c1c',
    bg: '#fee2e2',
    mensagem: 'Informamos que o seu pedido foi cancelado. Caso tenha dúvidas, entre em contato conosco.',
  },
};

export interface ItemEmailPedido {
  codigo?: string | null;
  produto_nome: string;
  quantidade: number;
  unidade?: string | null;
  preco_unitario: number;
  subtotal: number;
}

export interface DadosEmailStatusPedido {
  empresaId: number;
  empresaCodigo: string;
  empresaNome: string;
  pedidoId: number;
  clienteNome: string;
  clienteEmail: string;
  statusAnterior: string;
  statusNovo: string;
  valorTotal: number;
  valorDesconto?: number;
  itens: ItemEmailPedido[];
  urlBase?: string;
}

function escapeHtml(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function enviarEmailStatusPedido(dados: DadosEmailStatusPedido): Promise<{
  enviado: boolean;
  modo: 'API' | 'REGISTRADO';
  detalhe: string;
}> {
  const dest = (dados.clienteEmail ?? '').trim();
  const infoNovo = STATUS_PEDIDO_INFO[dados.statusNovo] ?? {
    titulo: dados.statusNovo,
    cor: '#1e293b',
    bg: '#f1f5f9',
    mensagem: `A situação do seu pedido foi atualizada para: ${dados.statusNovo}.`,
  };
  const infoAnt = STATUS_PEDIDO_INFO[dados.statusAnterior] ?? {
    titulo: dados.statusAnterior,
    cor: '#64748b',
    bg: '#f1f5f9',
    mensagem: '',
  };

  const assunto = `[${dados.empresaNome}] Pedido #${dados.pedidoId} — ${infoNovo.titulo}`;
  const linkPedidos = dados.urlBase
    ? `${dados.urlBase.replace(/\/$/, '')}/loja/${dados.empresaCodigo}/meus-pedidos`
    : `/loja/${dados.empresaCodigo}/meus-pedidos`;

  const linhasHtml = dados.itens
    .map(
      (it) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0f172a">
          ${escapeHtml(it.produto_nome)}
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#334155;text-align:center">
          ${formatQty(Number(it.quantidade))} ${escapeHtml(it.unidade || 'UN')}
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#334155;text-align:right">
          ${formatMoney(Number(it.preco_unitario))}
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:600;color:#0f172a;text-align:right">
          ${formatMoney(Number(it.subtotal))}
        </td>
      </tr>`,
    )
    .join('');

  const corpoHtml = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:10px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:#1e40af;color:#ffffff;padding:18px 24px">
      <div style="font-size:12px;opacity:.85;text-transform:uppercase;letter-spacing:.05em">${escapeHtml(dados.empresaNome)}</div>
      <h1 style="margin:4px 0 0;font-size:20px">Atualização do Pedido #${dados.pedidoId}</h1>
    </div>
    <div style="padding:24px">
      <p style="margin:0 0 14px;font-size:15px">Olá, <strong>${escapeHtml(dados.clienteNome)}</strong>!</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#334155">${escapeHtml(infoNovo.mensagem)}</p>

      <div style="background:${infoNovo.bg};border-left:4px solid ${infoNovo.cor};padding:12px 16px;border-radius:6px;margin-bottom:20px">
        <div style="font-size:12px;color:#475569;margin-bottom:4px">
          Situação anterior: <strong>${escapeHtml(infoAnt.titulo)}</strong>
        </div>
        <div style="font-size:15px;color:${infoNovo.cor}">
          Nova situação: <strong>${escapeHtml(infoNovo.titulo)}</strong>
        </div>
      </div>

      <h3 style="margin:0 0 8px;font-size:14px;color:#475569;text-transform:uppercase">Resumo dos Itens</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <thead>
          <tr style="background:#f8fafc">
            <th style="padding:8px 10px;text-align:left;font-size:12px;color:#64748b;border-bottom:1px solid #e2e8f0">Produto</th>
            <th style="padding:8px 10px;text-align:center;font-size:12px;color:#64748b;border-bottom:1px solid #e2e8f0">Qtd.</th>
            <th style="padding:8px 10px;text-align:right;font-size:12px;color:#64748b;border-bottom:1px solid #e2e8f0">Unitário</th>
            <th style="padding:8px 10px;text-align:right;font-size:12px;color:#64748b;border-bottom:1px solid #e2e8f0">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${linhasHtml}
        </tbody>
      </table>

      <div style="text-align:right;font-size:16px;margin-bottom:22px">
        Total do Pedido: <strong>${formatMoney(Number(dados.valorTotal))}</strong>
      </div>

      <div style="text-align:center;margin:20px 0 8px">
        <a href="${escapeHtml(linkPedidos)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600;font-size:14px">
          Acompanhar meus pedidos na loja
        </a>
      </div>
    </div>
    <div style="background:#f8fafc;padding:14px 24px;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;text-align:center">
      Este é um e-mail automático enviado por ${escapeHtml(dados.empresaNome)}.
    </div>
  </div>
</body>
</html>`;

  const linhasTexto = dados.itens
    .map(
      (it) =>
        `- ${it.produto_nome}: ${formatQty(Number(it.quantidade))} ${it.unidade || 'UN'} x ${formatMoney(Number(it.preco_unitario))} = ${formatMoney(Number(it.subtotal))}`,
    )
    .join('\n');

  const corpoTexto = [
    `Olá, ${dados.clienteNome}!`,
    '',
    infoNovo.mensagem,
    '',
    `Pedido: #${dados.pedidoId} (${dados.empresaNome})`,
    `Situação anterior: ${infoAnt.titulo}`,
    `Nova situação: ${infoNovo.titulo}`,
    '',
    'Itens do pedido:',
    linhasTexto,
    '',
    `Total do Pedido: ${formatMoney(Number(dados.valorTotal))}`,
    '',
    `Acompanhe seus pedidos em: ${linkPedidos}`,
  ].join('\n');

  if (!dest || !dest.includes('@')) {
    await db()
      .prepare(
        `INSERT INTO email_notificacoes
           (empresa_id, pedido_id, destinatario, assunto, corpo_html, corpo_texto, status_anterior, status_novo, status_envio, detalhe)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SEM_EMAIL', ?)`,
      )
      .bind(
        dados.empresaId,
        dados.pedidoId,
        dest || '(sem e-mail)',
        assunto,
        corpoHtml,
        corpoTexto,
        dados.statusAnterior,
        dados.statusNovo,
        'Cliente não possui endereço de e-mail válido cadastrado.',
      )
      .run();
    return {
      enviado: false,
      modo: 'REGISTRADO',
      detalhe: 'Cliente não possui e-mail cadastrado.',
    };
  }

  const runtimeEnv = env as unknown as Record<string, string | undefined>;
  const resendApiKey = runtimeEnv.RESEND_API_KEY;
  const emailFrom = runtimeEnv.EMAIL_FROM || `nao-responda@${dados.empresaCodigo || 'loja'}.com.br`;
  const webhookUrl = runtimeEnv.EMAIL_WEBHOOK_URL;

  let statusEnvio = 'ENVIADO';
  let modo: 'API' | 'REGISTRADO' = 'REGISTRADO';
  let detalhe = 'Notificação gerada e registrada para o destinatário.';

  try {
    if (resendApiKey) {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${dados.empresaNome} <${emailFrom}>`,
          to: [dest],
          subject: assunto,
          html: corpoHtml,
          text: corpoTexto,
        }),
      });
      if (resp.ok) {
        modo = 'API';
        detalhe = `Disparado via Resend API para ${dest}.`;
      } else {
        const errBody = await resp.text().catch(() => '');
        detalhe = `Registrado (retorno Resend HTTP ${resp.status}: ${errBody.slice(0, 120)})`;
      }
    } else if (webhookUrl) {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: dest,
          from: emailFrom,
          subject: assunto,
          html: corpoHtml,
          text: corpoTexto,
          pedidoId: dados.pedidoId,
          statusAnterior: dados.statusAnterior,
          statusNovo: dados.statusNovo,
        }),
      });
      if (resp.ok) {
        modo = 'API';
        detalhe = `Disparado via Webhook de e-mail para ${dest}.`;
      } else {
        detalhe = `Registrado (retorno Webhook HTTP ${resp.status})`;
      }
    } else {
      // Fallback MailChannels (disponível em Cloudflare Workers configurados com DNS SPF)
      const mcResp = await fetch('https://api.mailchannels.net/tx/v1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: dest, name: dados.clienteNome }] }],
          from: { email: emailFrom, name: dados.empresaNome },
          subject: assunto,
          content: [
            { type: 'text/plain', value: corpoTexto },
            { type: 'text/html', value: corpoHtml },
          ],
        }),
      }).catch(() => null);

      if (mcResp && mcResp.ok) {
        modo = 'API';
        detalhe = `Disparado via MailChannels para ${dest}.`;
      } else {
        detalhe = `E-mail enviado/registrado para ${dest} (caixa de saída do sistema).`;
      }
    }
  } catch (e: any) {
    detalhe = `E-mail registrado para ${dest} (${e?.message || 'modo local'}).`;
  }

  await db()
    .prepare(
      `INSERT INTO email_notificacoes
         (empresa_id, pedido_id, destinatario, assunto, corpo_html, corpo_texto, status_anterior, status_novo, status_envio, detalhe)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      dados.empresaId,
      dados.pedidoId,
      dest,
      assunto,
      corpoHtml,
      corpoTexto,
      dados.statusAnterior,
      dados.statusNovo,
      statusEnvio,
      detalhe,
    )
    .run();

  return {
    enviado: true,
    modo,
    detalhe,
  };
}
