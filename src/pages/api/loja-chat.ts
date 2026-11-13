import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { CLIENT_SESSION_COOKIE, IDLE_TIMEOUT_SEC, db, getLojaEmpresa, getSessionClient } from '../../lib/auth';
import { DIAS_SEMANA_LABELS } from '../../lib/empresa-service';
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
  if (token && !cliente) {
    cookies.delete(CLIENT_SESSION_COOKIE, { path: '/' });
    return json({ sessaoExpirada: true, erro: 'Sua sessão expirou por inatividade.' }, 401);
  }
  if (token && cliente) {
    cookies.set(CLIENT_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      path: '/',
      maxAge: IDLE_TIMEOUT_SEC,
    });
  }

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

  // Carrega serviços disponíveis para agendamento e os agendamentos DO PRÓPRIO cliente logado
  const { results: servicos } = await db()
    .prepare(
      `SELECT id, nome, descricao, duracao_minutos, preco
         FROM servicos
        WHERE empresa_id = ? AND ativo = 1
        ORDER BY nome COLLATE NOCASE`,
    )
    .bind(empresa.id)
    .all<any>();

  let meusAgendamentos: any[] = [];
  if (cliente) {
    const { results: ags } = await db()
      .prepare(
        `SELECT a.id, a.data, a.hora_inicio, a.hora_fim, a.duracao_minutos, a.preco, a.status, a.observacoes,
                s.nome AS servico_nome
           FROM agendamentos a
           JOIN servicos s ON s.id = a.servico_id AND s.empresa_id = a.empresa_id
          WHERE a.empresa_id = ? AND a.parceiro_id = ?
          ORDER BY a.data DESC, a.hora_inicio DESC
          LIMIT 10`,
      )
      .bind(empresa.id, cliente.id)
      .all<any>();
    meusAgendamentos = ags;
  }

  const diasFuncionamento = DIAS_SEMANA_LABELS.filter((d) =>
    String(empresa.agenda_dias_semana ?? '1,2,3,4,5')
      .split(',')
      .map((s) => s.trim())
      .includes(String(d.valor)),
  )
    .map((d) => d.longo)
    .join(', ');

  function formatDataBr(ymd: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : ymd;
  }

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
        `Agenda de serviços na loja: ${empresa.agenda_ativa === 1 ? `Ativa no menu "${empresa.agenda_menu_texto || 'Agenda'}". Dias de funcionamento: ${diasFuncionamento || 'consulte a loja'}, das ${empresa.agenda_inicio} às ${empresa.agenda_fim}.` : 'Desativada no momento.'}`,
        `Serviços disponíveis (${servicos.length}): ${
          servicos.length === 0
            ? 'Nenhum serviço cadastrado.'
            : servicos
                .map((s) => `[${s.nome}: duração ${s.duracao_minutos} min — R$ ${formatMoney(Number(s.preco))}${s.descricao ? ` — ${s.descricao}` : ''}]`)
                .join('; ')
        }`,
        cliente
          ? `Agendamentos do próprio cliente logado (${cliente.nome}): ${
              meusAgendamentos.length === 0
                ? 'Nenhum agendamento marcado.'
                : meusAgendamentos
                    .map(
                      (a) =>
                        `Agendamento #${a.id} em ${formatDataBr(a.data)} das ${a.hora_inicio} às ${a.hora_fim} (${a.duracao_minutos} min) - Serviço: ${a.servico_nome} - Status: ${a.status} - Valor: R$ ${formatMoney(Number(a.preco))}`,
                    )
                    .join(' | ')
            }`
          : '',
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
        resposta: `Olá, **${cliente.nome}**! Você ainda não possui pedidos finalizados nesta loja. Adicione produtos ao carrinho para fazer seu primeiro pedido!`,
      });
    }
    const resumo = meusPedidos.slice(0, 5).map((p) => {
      const st = STATUS_PEDIDO_INFO[p.status]?.titulo ?? p.status;
      const qtdItens = p.itens.reduce((acc: number, i: any) => acc + Number(i.quantidade), 0);
      return `• **Pedido #${p.id}** (${p.criado_em.slice(0, 10)}) — **${st}** — ${formatQty(qtdItens)} item(ns) — **${formatMoney(Number(p.valor_total))}**`;
    });
    return json({
      resposta: [
        `📦 **Seus últimos pedidos (${cliente.nome}):**`,
        ...resumo,
        '',
        'Se quiser ver os itens de um pedido específico, digite por exemplo **"pedido #' +
          meusPedidos[0].id +
          '"** ou acesse o menu **Compras** no topo da página.',
      ].join('\n'),
    });
  }

  // 2.5. Perguntas sobre agenda, agendamentos, serviços, procedimentos, horários disponíveis ou marcação
  if (
    /\b(agenda|agendamento|agendamentos|agendar|agendei|marcar|marcado|servico|servicos|procedimento|procedimentos|consulta|duracao|vaga|vagas|disponibilidade|dias de funcionamento)\b/.test(
      msgNorm,
    )
  ) {
    const blocos: string[] = [];

    if (cliente) {
      if (meusAgendamentos.length > 0) {
        blocos.push(`📅 **Seus Agendamentos (${cliente.nome}):**`);
        for (const a of meusAgendamentos.slice(0, 5)) {
          blocos.push(
            `• **${formatDataBr(a.data)} das ${a.hora_inicio} às ${a.hora_fim}** — **${a.servico_nome}** (${a.duracao_minutos} min) — R$ ${formatMoney(Number(a.preco))} — Status: **${a.status}**`,
          );
        }
        blocos.push('');
      } else {
        blocos.push(`📅 Olá, **${cliente.nome}**! Você ainda não possui agendamentos registrados nesta loja.\n`);
      }
    } else {
      blocos.push('📅 Faça login na loja para consultar seus agendamentos ou reservar um horário.\n');
    }

    if (servicos.length > 0) {
      blocos.push(`🛠️ **Serviços / Procedimentos Disponíveis (${servicos.length}):**`);
      for (const s of servicos.slice(0, 8)) {
        blocos.push(
          `• **${s.nome}** — ⏱️ Duração: **${s.duracao_minutos} min** — **R$ ${formatMoney(Number(s.preco))}**${
            s.descricao ? `\n  _${s.descricao}_` : ''
          }`,
        );
      }
      blocos.push('');
    }

    if (empresa.agenda_ativa === 1) {
      blocos.push(
        `🕒 **Funcionamento da Agenda:** ${diasFuncionamento || 'Consulte a loja'}, das **${empresa.agenda_inicio}** às **${empresa.agenda_fim}**.`,
      );
      blocos.push(
        `👉 Para escolher uma data e reservar seu horário, clique em **📅 ${empresa.agenda_menu_texto || 'Agenda'}** no menu superior da loja!`,
      );
    } else if (servicos.length === 0) {
      blocos.push('No momento a agenda online de serviços não está habilitada nesta loja.');
    }

    return json({ resposta: blocos.join('\n') });
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
      `Olá${cliente ? `, **${cliente.nome}**` : ''}! 👋 Sou o assistente virtual da **${empresa.nome}**.`,
      'Posso ajudar você agora mesmo com:',
      '• 📦 **Meus pedidos:** pergunte *"qual o status dos meus pedidos"* ou *"pedido #1"*',
      '• 📅 **Agendamentos e Serviços:** pergunte *"quais os meus agendamentos"* ou *"quais serviços posso agendar"*',
      '• 🏷️ **Produtos e Estoque:** digite o nome de um produto para ver preço e quantidade disponível',
      '• 📞 **Suporte e Contato:** pergunte sobre *"horário de atendimento"*, *"WhatsApp"*, *"trocas"* ou *"endereço"*',
      '',
      'Como posso ajudar você hoje?',
    ].join('\n'),
  });
};
