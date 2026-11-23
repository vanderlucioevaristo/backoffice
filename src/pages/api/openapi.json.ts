import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ url, locals }) => {
  const empPadrao = locals.user?.empresaCodigo || 'lojateste';

  const spec = {
    openapi: '3.0.3',
    info: {
      title: 'Backoffice & Loja Virtual Multi-Empresa — API',
      version: '1.0.0',
      description:
        'Documentação interativa (OpenAPI 3.0 / Swagger) dos endpoints de consulta cadastral (CEP, CPF/CNPJ), cálculo de frete (Correios PAC/SEDEX), assistente virtual da loja, webhooks de pagamento (InfinitePay) e recursos PWA.',
    },
    servers: [
      {
        url: url.origin,
        description: 'Servidor Atual (Backoffice / Loja Virtual)',
      },
    ],
    tags: [
      { name: 'Consultas Públicas', description: 'Consulta de CEP (Correios) e CPF/CNPJ (Receita Federal)' },
      { name: 'Frete e Logística', description: 'Cotação de frete PAC, SEDEX e Retirada por peso e dimensões' },
      { name: 'Loja Virtual & Assistente', description: 'Atendimento automatizado e recursos públicos das lojas' },
      { name: 'Pagamentos & Webhooks', description: 'Notificações automáticas de confirmação de pagamento' },
    ],
    paths: {
      '/api/consulta-cep': {
        get: {
          tags: ['Consultas Públicas'],
          summary: 'Consulta endereço completo por CEP',
          description:
            'Consulta o CEP em cascata na base SIGEP dos Correios, BrasilAPI e ViaCEP, retornando logradouro, bairro, cidade e UF.',
          parameters: [
            {
              name: 'cep',
              in: 'query',
              required: true,
              description: 'CEP com 8 dígitos (com ou sem hífen)',
              schema: { type: 'string', example: '01310-100' },
            },
          ],
          responses: {
            '200': {
              description: 'Endereço localizado com sucesso',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean', example: true },
                      endereco: {
                        type: 'object',
                        properties: {
                          cep: { type: 'string', example: '01310100' },
                          logradouro: { type: 'string', example: 'Avenida Paulista' },
                          complemento: { type: 'string', example: '' },
                          bairro: { type: 'string', example: 'Bela Vista' },
                          cidade: { type: 'string', example: 'São Paulo' },
                          uf: { type: 'string', example: 'SP' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'CEP inválido' },
            '404': { description: 'CEP não encontrado' },
          },
        },
      },
      '/api/consulta-doc': {
        get: {
          tags: ['Consultas Públicas'],
          summary: 'Valida e consulta CPF ou CNPJ (numérico ou novo formato alfanumérico)',
          description:
            'Valida os dígitos verificadores de CPF (11 dígitos) ou CNPJ (14 caracteres numéricos ou alfanuméricos) e consulta dados cadastrais públicos da Receita Federal.',
          parameters: [
            {
              name: 'doc',
              in: 'query',
              required: true,
              description: 'Número do CPF ou CNPJ a ser validado/consultado',
              schema: { type: 'string', example: '65491970000182' },
            },
            {
              name: 'novo',
              in: 'query',
              required: false,
              description: 'Defina como "1" para CNPJ no novo padrão alfanumérico',
              schema: { type: 'string', enum: ['0', '1'], example: '0' },
            },
          ],
          responses: {
            '200': {
              description: 'Documento validado e dados retornados',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean', example: true },
                      aviso: { type: 'string' },
                      dados: {
                        type: 'object',
                        properties: {
                          tipo_pessoa: { type: 'string', enum: ['F', 'J'], example: 'J' },
                          documento: { type: 'string', example: '65491970000182' },
                          nome: { type: 'string', example: 'VANDER EVARISTO LTDA' },
                          nome_fantasia: { type: 'string' },
                          email: { type: 'string' },
                          telefone: { type: 'string' },
                          cep: { type: 'string' },
                          logradouro: { type: 'string' },
                          numero: { type: 'string' },
                          bairro: { type: 'string' },
                          cidade: { type: 'string' },
                          uf: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'CPF ou CNPJ inválido' },
            '404': { description: 'CNPJ não encontrado nas bases públicas' },
          },
        },
      },
      '/api/calcular-frete': {
        post: {
          tags: ['Frete e Logística'],
          summary: 'Calcula frete e prazo via Correios (PAC, SEDEX e Retirada)',
          description:
            'Calcula o valor e o prazo estimado de entrega a partir do CEP de origem da loja, CEP de destino do cliente, peso físico (kg) e cubagem (C × L × A em cm) dos produtos.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['empresa', 'cepDestino'],
                  properties: {
                    empresa: {
                      type: 'string',
                      description: 'Código da empresa/loja',
                      example: empPadrao,
                    },
                    cepDestino: {
                      type: 'string',
                      description: 'CEP de destino com 8 dígitos',
                      example: '20040-002',
                    },
                    itens: {
                      type: 'array',
                      description: 'Lista de produtos para cotar (opcional se o cliente estiver logado com itens no carrinho)',
                      items: {
                        type: 'object',
                        required: ['produtoId', 'quantidade'],
                        properties: {
                          produtoId: { type: 'integer', example: 1 },
                          quantidade: { type: 'number', example: 2 },
                          precoUnitario: { type: 'number', example: 199.9 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Cotação calculada com sucesso',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean', example: true },
                      cepOrigem: { type: 'string', example: '01310100' },
                      cepDestino: { type: 'string', example: '20040002' },
                      pesoFisicoKg: { type: 'number', example: 0.9 },
                      pesoCubicoKg: { type: 'number', example: 0.432 },
                      pesoTarifadoKg: { type: 'number', example: 0.9 },
                      localidadeDestino: { type: 'string', example: 'Rio de Janeiro/RJ' },
                      opcoes: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            codigo: { type: 'string', enum: ['PAC', 'SEDEX', 'RETIRADA'] },
                            nome: { type: 'string', example: 'Correios PAC' },
                            valor: { type: 'number', example: 24.9 },
                            prazoDias: { type: 'integer', example: 6 },
                            descricao: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Parâmetros inválidos ou carrinho vazio' },
          },
        },
      },
      '/api/loja-chat': {
        post: {
          tags: ['Loja Virtual & Assistente'],
          summary: 'Envia pergunta ao Assistente Virtual da Loja',
          description:
            'Responde dúvidas sobre produtos em estoque, ofertas em destaque, agendamentos de serviços e pedidos do cliente autenticado na loja.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['empresa', 'mensagem'],
                  properties: {
                    empresa: { type: 'string', example: empPadrao },
                    mensagem: { type: 'string', example: 'Quais são as ofertas em destaque?' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Resposta do assistente virtual',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean', example: true },
                      resposta: { type: 'string' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Cliente não autenticado na loja virtual' },
          },
        },
      },
      '/api/infinitepay-webhook': {
        post: {
          tags: ['Pagamentos & Webhooks'],
          summary: 'Webhook de confirmação automática de pagamento InfinitePay',
          description:
            'Recebe a notificação de pagamento da InfinitePay, valida a autenticidade da transação no endpoint oficial `/payment_check` da InfinitePay e atualiza o status do pedido para `PAGO`.',
          parameters: [
            {
              name: 'empresa',
              in: 'query',
              required: false,
              description: 'Código da empresa/loja',
              schema: { type: 'string', example: empPadrao },
            },
            {
              name: 'pedido',
              in: 'query',
              required: false,
              description: 'ID numérico do pedido',
              schema: { type: 'integer', example: 1 },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['order_nsu', 'transaction_nsu'],
                  properties: {
                    order_nsu: { type: 'string', example: 'PED-1' },
                    transaction_nsu: { type: 'string', example: '00000000-0000-0000-0000-000000000000' },
                    invoice_slug: { type: 'string', example: 'abc123xyz' },
                    paid: { type: 'boolean', example: true },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Pagamento verificado e confirmado com sucesso' },
            '400': { description: 'Payload inválido' },
            '403': { description: 'Transação não confirmada pela API oficial da InfinitePay' },
            '404': { description: 'Pedido não encontrado' },
          },
        },
      },
      '/loja/{empresa}/manifest.webmanifest': {
        get: {
          tags: ['Loja Virtual & Assistente'],
          summary: 'Retorna o Web App Manifest (PWA) personalizado da loja',
          parameters: [
            {
              name: 'empresa',
              in: 'path',
              required: true,
              description: 'Código da empresa/loja',
              schema: { type: 'string', example: empPadrao },
            },
          ],
          responses: {
            '200': { description: 'JSON do Web App Manifest da loja' },
            '404': { description: 'Loja não encontrada' },
          },
        },
      },
      '/loja/{empresa}/icon.svg': {
        get: {
          tags: ['Loja Virtual & Assistente'],
          summary: 'Gera o ícone SVG dinâmico da loja com as cores e iniciais da empresa',
          parameters: [
            {
              name: 'empresa',
              in: 'path',
              required: true,
              description: 'Código da empresa/loja',
              schema: { type: 'string', example: empPadrao },
            },
          ],
          responses: {
            '200': { description: 'Imagem SVG do ícone da loja' },
          },
        },
      },
    },
  };

  return new Response(JSON.stringify(spec, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
