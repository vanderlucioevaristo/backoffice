import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { CLIENT_SESSION_COOKIE, db, getLojaEmpresa, getSessionClient } from '../../lib/auth';
import { STATUS_PEDIDO_INFO } from '../../lib/email';
import { formatMoney, formatQty } from '../../lib/validate';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export const POST: APIRoute = async ({ request, cookies }) => {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ erro: 'Requisição inválida.' }, 400);
  }

  const empresaCodigo = String(body.empresa ?? '').trim().toLowerCase();
  const mensagem = String(body.mensagem ?? '').trim().slice(0, 500);

  if (!empresaCodigo || !mensagem) {
    return json({ erro: 'Informe a mensagem.' }, 400);
  }

  const empresa = await getLojaEmpresa(empresaCodigo);
  if (!empresa) {
    return json({ erro: 'Loja não encontrada.' }, 404);
  }

  const token = cookies.get(CLIENT_SESSION_COOKIE)?.value;
  const cliente = token ? await getSessionClient(token, empresa.codigo) : null;

  // Carrega os pedidos do cliente autenticado (se estiver logado)
  let meusPedidos: any[] = [];
  if (cliente) {
    const { results } = await db()
      .prepare(
        `SELECT p.id, p.valor_total, p.valor_desconto, p.status, p.observacoes, p.criado_em, p.atualizado_em
           FROM loja_pedidos p
          WHERE p.empresa_id = ? AND p.parceiro_id = ?
          ORDER BY p.id DESC
          LIMIT 10`,
      )
      .bind(empresa.id, cliente.id)
      .all<any>();

    for (const ped of results) {
      const { results: itens } = await db()
        .prepare(
          `SELECT i.quantidade, i.preco_unitario, i.subtotal, pr.nome AS produto_nome, pr.unidade
             FROM loja_pedidos_itens i
             JOIN produtos pr ON pr.id = i.produto_id AND pr.empresa_id = i.empresa_id
            WHERE i.empresa_id = ? AND i.pedido_id = ?`,
        )
        .bind(empresa.id, ped.id)
        .all<any>();
      ped.itens = itens;
    }
    meusPedidos = results;
  }

  // Carrega produtos disponíveis em estoque da empresa
  const { results: produtos } = await db()
    .prepare(
      `SELECT id, codigo, nome, descricao, categoria, unidade, preco_venda, estoque_atual
         FROM produtos
        WHERE empresa_id = ? AND ativo = 1 AND estoque_atual >= 1
        ORDER BY nome COLLATE NOCASE
        LIMIT 80`,
    )
    .bind(empresa.id)
    .all<any>();

  // Se houver chave de IA configurada no ambiente (GEMINI_API_KEY ou OPENAI_API_KEY), usa LLM com o contexto real
  const runtimeEnv = env as unknown as Record<string, string | undefined>;
  const geminiKey = runtimeEnv.GEMINI_API_KEY;

  if (geminiKey) {
    try {
      const contextoSistema = [
        `Você é o assistente virtual oficial da loja "${empresa.nome}". Responda sempre em português do Brasil, de forma cordial, objetiva e prestativa.`,
        `Dados de atendimento da loja: Telefone: ${empresa.rodape_telefone || 'não informado'} | WhatsApp: ${empresa.rodape_whatsapp || 'não informado'} | E-mail: ${empresa.rodape_email || 'não informado'} | Horário: ${empresa.rodape_horario || 'comercial'} | Endereço: ${empresa.rodape_endereco || 'não informado'} | Suporte/Trocas: ${empresa.rodape_suporte || 'consulte nosso atendimento'}.`,
        cliente
          ? `Cliente logado: ${cliente.nome}. Pedidos do cliente: ${
              meusPedidos.length === 0
                ? 'Nenhum pedido realizado ainda.'
                : meusPedidos
                    .map(
                      (p) =>
                        `Pedido #${p.id} (${p.criado_em}) - Status: ${STATUS_PEDIDO_INFO[p.status]?.titulo || p.status} - Total: ${formatMoney(p.valor_total)} - Itens: ${p.itens.map((i: any) => `${formatQty(i.quantidade)}x ${i.produto_nome}`).join(', ')}`,
                    )
                    .join(' | ')
            }`
          : 'O cliente ainda não fez login na loja.',
        `Catálogo de produtos disponíveis em estoque (${produtos.length}): ${produtos
          .map(
            (pr) =>
              `[${pr.nome}${pr.categoria ? ` (${pr.categoria})` : ''}: ${formatMoney(pr.preco_venda)} — Estoque: ${formatQty(pr.estoque_atual)} ${pr.unidade || 'UN'}${pr.descricao ? ` — ${pr.descricao}` : ''}]`,
          )
          .join('; ')}`,
      ].join('\n');

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: contextoSistema }] },
            contents: [{ role: 'user', parts: [{ text: mensagem }] }],
          }),
        },
      );
      if (resp.ok) {
        const data: any = await resp.json();
        const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (txt) return json({ resposta: txt });
      }
    } catch {
      // Fallback para o motor local abaixo
    }
  }

  // Motor inteligente local com acesso em tempo real aos pedidos do cliente, produtos, estoque e suporte
  const msgNorm = normalizar(mensagem);

  // 1. Consulta a um número específico de pedido (#123 ou "pedido 123")
  const matchPedidoNum = msgNorm.match(/(?:pedido\s*#?\s*|#\s*)(\d+)/);
  if (matchPedidoNum) {
    const numPedido = Number(matchPedidoNum[1]);
    if (!cliente) {
      return json({
        resposta: `Para consultar os detalhes do **Pedido #${numPedido}**, faça login na sua conta da loja.`,
      });
    }
    const ped = meusPedidos.find((p) => Number(p.id) === numPedido);
    if (!ped) {
      return json({
        resposta: `Não encontrei o **Pedido #${numPedido}** vinculado à sua conta (${cliente.nome}). Você possui **${meusPedidos.length}** pedido(s) registrado(s).`,
      });
    }
    const stInfo = STATUS_PEDIDO_INFO[ped.status] ?? {
      titulo: ped.status,
      mensagem: '',
    };
    const listaItens = ped.itens
      .map(
        (i: any) =>
          `• **${formatQty(Number(i.quantidade))} ${i.unidade || 'UN'}** × ${i.produto_nome} (${formatMoney(Number(i.subtotal))})`,
      )
      .join('\n');
    return json({
      resposta: [
        `📦 **Detalhes do Pedido #${ped.id}**`,
        `• **Situação atual:** ${stInfo.titulo}`,
        stInfo.mensagem ? `• *${stInfo.mensagem}*` : '',
        `• **Data:** ${ped.criado_em}`,
        `• **Valor Total:** ${formatMoney(Number(ped.valor_total))}`,
        `• **Itens:**\n${listaItens}`,
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }

  // 2. Perguntas gerais sobre pedidos, entregas, status ou compras do cliente
  if (
    /\b(pedido|pedidos|compra|compras|status|situacao|rastreio|entrega|entregue|separacao|andamento)\b/.test(
      msgNorm,
    )
  ) {
    if (!cliente) {
      return json({
        resposta:
          'Para consultar seus pedidos e o status de entrega, acesse sua conta clicando em **Entrar**.',
      });
    }
    if (meusPedidos.length === 0) {
      return json({
        resposta: `Olá, **${cliente.nome.split(' ')[0]}**! Você ainda não possui pedidos finalizados nesta loja. Adicione produtos ao carrinho para fazer seu primeiro pedido!`,
      });
    }
    const resumo = meusPedidos.slice(0, 5).map((p) => {
      const st = STATUS_PEDIDO_INFO[p.status]?.titulo ?? p.status;
      const qtdItens = p.itens.reduce((acc: number, i: any) => acc + Number(i.quantidade), 0);
      return `• **Pedido #${p.id}** (${p.criado_em.slice(0, 10)}) — **${st}** — ${formatQty(qtdItens)} item(ns) — **${formatMoney(Number(p.valor_total))}**`;
    });
    return json({
      resposta: [
        `📦 **Seus últimos pedidos (${cliente.nome.split(' ')[0]}):**`,
        ...resumo,
        '',
        'Se quiser ver os itens de um pedido específico, digite por exemplo **"pedido #' +
          meusPedidos[0].id +
          '"** ou acesse o menu **Compras** no topo da página.',
      ].join('\n'),
    });
  }

  // 3. Perguntas sobre contato, suporte, telefone, whatsapp, horário, trocas, endereço
  if (
    /\b(contato|suporte|telefone|whatsapp|whats|zap|email|e-mail|endereco|localizacao|onde fica|horario|atendimento|troca|devolucao|garantia|ajuda|falar|atendente)\b/.test(
      msgNorm,
    )
  ) {
    const linhas: string[] = [`📞 **Canais de Atendimento — ${empresa.nome}**`];
    if (empresa.rodape_telefone) linhas.push(`• **Telefone:** ${empresa.rodape_telefone}`);
    if (empresa.rodape_whatsapp) linhas.push(`• **WhatsApp:** ${empresa.rodape_whatsapp}`);
    if (empresa.rodape_email) linhas.push(`• **E-mail:** ${empresa.rodape_email}`);
    if (empresa.rodape_horario) linhas.push(`• **Horário:** ${empresa.rodape_horario}`);
    if (empresa.rodape_endereco) linhas.push(`• **Endereço:** ${empresa.rodape_endereco}`);
    if (empresa.rodape_suporte) linhas.push(`\n🛡️ **Suporte / Políticas:**\n${empresa.rodape_suporte}`);
    if (linhas.length === 1) {
      linhas.push(
        'Nossa equipe está à disposição! Consulte os dados no rodapé da loja para suporte com seus pedidos.',
      );
    }
    return json({ resposta: linhas.join('\n') });
  }

  // 4. Busca específica de produtos por palavras-chave da pergunta
  const stopWords = new Set([
    'o', 'a', 'os', 'as', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na',
    'por', 'para', 'com', 'tem', 'voce', 'voces', 'qual', 'quais', 'quanto', 'custa',
    'preco', 'valor', 'estoque', 'disponivel', 'produto', 'produtos', 'quero', 'saber',
    'sobre', 'vende', 'loja', 'bom', 'dia', 'boa', 'tarde', 'noite', 'ola', 'oi', 'me',
    'mostre', 'mostrar', 'ver', 'catalogo', 'lista',
  ]);
  const termos = msgNorm
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !stopWords.has(t));

  if (termos.length > 0) {
    const encontrados = produtos.filter((pr) => {
      const alvo = normalizar(`${pr.nome} ${pr.categoria || ''} ${pr.descricao || ''} ${pr.codigo || ''}`);
      return termos.some((t) => alvo.includes(t));
    });

    if (encontrados.length > 0) {
      const lista = encontrados.slice(0, 6).map(
        (pr) =>
          `• **${pr.nome}** — **${formatMoney(Number(pr.preco_venda))}** *(Disponível: ${formatQty(Number(pr.estoque_atual))} ${pr.unidade || 'UN'})*${
            pr.descricao ? `\n  _${pr.descricao.slice(0, 90)}_` : ''
          }`,
      );
      return json({
        resposta: [
          `🔍 Encontrei **${encontrados.length}** produto(s) disponível(is) em estoque:`,
          ...lista,
          encontrados.length > 6 ? `\n*(E mais ${encontrados.length - 6} item(ns) no catálogo)*` : '',
          '\nClique sobre o produto na vitrine para abrir os detalhes e adicionar ao carrinho!',
        ]
          .filter(Boolean)
          .join('\n'),
      });
    }
  }

  // 5. Se perguntou sobre catálogo / produtos / preços / estoque de forma geral
  if (/\b(produto|produtos|catalogo|estoque|preco|precos|valor|disponivel|disponiveis|vende|comprar)\b/.test(msgNorm)) {
    if (produtos.length === 0) {
      return json({
        resposta: 'No momento não há produtos com estoque disponível na vitrine.',
      });
    }
    const amostra = produtos.slice(0, 6).map(
      (pr) =>
        `• **${pr.nome}** — **${formatMoney(Number(pr.preco_venda))}** *(${formatQty(Number(pr.estoque_atual))} ${pr.unidade || 'UN'} em estoque)*`,
    );
    return json({
      resposta: [
        `🛍️ Temos **${produtos.length} produto(s)** com pronta entrega em estoque! Alguns destaques:`,
        ...amostra,
        '',
        'Digite o **nome do produto** que você procura para eu verificar o preço e a quantidade disponível!',
      ].join('\n'),
    });
  }

  // 6. Saudação ou resposta padrão amigável com guia do que o bot sabe fazer
  return json({
    resposta: [
      `Olá${cliente ? `, **${cliente.nome.split(' ')[0]}**` : ''}! 👋 Sou o assistente virtual da **${empresa.nome}**.`,
      'Posso ajudar você agora mesmo com:',
      '• 📦 **Meus pedidos:** pergunte *"qual o status dos meus pedidos"* ou *"pedido #1"*',
      '• 🏷️ **Produtos e Estoque:** digite o nome de um produto para ver preço e quantidade disponível',
      '• 📞 **Suporte e Contato:** pergunte sobre *"horário de atendimento"*, *"WhatsApp"*, *"trocas"* ou *"endereço"*',
      '',
      'Como posso ajudar você hoje?',
    ].join('\n'),
  });
};
