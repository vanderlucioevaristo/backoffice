-- Garante que a empresa lojateste exista e esteja ativa com agenda e pagamentos habilitados
INSERT OR IGNORE INTO empresas (
  codigo, razao_social, nome_fantasia, cnpj, ativa,
  loja_nome, cor_primaria, cor_secundaria, cor_fundo, cor_texto,
  agenda_ativa, agenda_menu_texto, agenda_inicio, agenda_fim, agenda_intervalo_min, agenda_dias_semana,
  cep_origem, nubank_pix_ativo, nubank_link_ativo, nubank_chave_pix, nubank_cidade_pix,
  rodape_telefone, rodape_whatsapp, rodape_email, rodape_horario, rodape_endereco
) VALUES (
  'lojateste',
  'LOJA TESTE COMERCIO E SERVICOS LTDA',
  'Loja Teste Oficial',
  '65491970000182',
  1,
  'Loja Teste Oficial',
  '#3483fa',
  '#ffe600',
  '#ebebeb',
  '#333333',
  1,
  'Agende aqui seu serviço',
  '08:00',
  '18:00',
  30,
  '1,2,3,4,5,6',
  '01310100',
  1,
  1,
  '65491970000182',
  'SAO PAULO',
  '(11) 3000-1234',
  '(11) 99999-1234',
  'atendimento@lojateste.com.br',
  'Seg a Sáb, das 8h às 18h',
  'Av. Paulista, 1000 - Bela Vista, São Paulo/SP - CEP 01310-100'
);

-- Remove produtos de teste anteriores com os mesmos códigos na lojateste para evitar duplicidade
DELETE FROM produtos
 WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = 'lojateste')
   AND codigo IN ('LT-001','LT-002','LT-003','LT-004','LT-005','LT-006','LT-007','LT-008','LT-009','LT-010','LT-011','LT-012');

-- Insere 12 produtos variados com estoque, fotos SVG, peso (kg) e dimensões (cm) para cálculo dos Correios
INSERT INTO produtos (
  empresa_id, codigo, codigo_barras, nome, descricao, categoria, marca, unidade, ncm,
  preco_custo, preco_venda, estoque_atual, estoque_minimo,
  peso_kg, comprimento_cm, largura_cm, altura_cm, formato_correios,
  localizacao, foto, ativo
) VALUES
(
  (SELECT id FROM empresas WHERE codigo = 'lojateste'),
  'LT-001', '7891000000011',
  'Smartphone Pro Max 256GB 5G Titânio',
  'Tela OLED 6.7" 120Hz, Câmera Tripla 48MP, 256GB de armazenamento interno, Bateria de longa duração e carregamento ultra-rápido.',
  'Celulares e Smartphones', 'TechMobile', 'UN', '85171300',
  4200.00, 5899.90, 15, 3,
  0.450, 18, 12, 6, 1,
  'Corredor A - Cofre 1',
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect width="320" height="320" rx="28" fill="%23eff6ff"/><rect x="95" y="36" width="130" height="248" rx="22" fill="%231e293b" stroke="%23475569" stroke-width="6"/><rect x="105" y="54" width="110" height="212" rx="12" fill="%233b82f6"/><circle cx="160" cy="45" r="4" fill="%230f172a"/><text x="160" y="165" font-family="sans-serif" font-size="22" font-weight="bold" fill="%23ffffff" text-anchor="middle">5G PRO</text></svg>',
  1
),
(
  (SELECT id FROM empresas WHERE codigo = 'lojateste'),
  'LT-002', '7891000000028',
  'Notebook Ultra Slim i7 16GB SSD 512GB',
  'Processador Intel Core i7 de última geração, 16GB RAM DDR5, SSD NVMe 512GB, Tela 15.6" Full HD IPS Antirreflexo, Chassi em alumínio.',
  'Informática', 'UltraBook', 'UN', '84713012',
  3100.00, 4499.00, 10, 2,
  1.850, 42, 30, 9, 1,
  'Corredor A - Prat. 2',
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect width="320" height="320" rx="28" fill="%23f8fafc"/><rect x="56" y="68" width="208" height="136" rx="10" fill="%230f172a" stroke="%23334155" stroke-width="6"/><rect x="68" y="80" width="184" height="112" fill="%232563eb"/><path d="M32 206h256l-16 24H48z" fill="%2364748b"/><text x="160" y="145" font-family="sans-serif" font-size="22" font-weight="bold" fill="%23ffffff" text-anchor="middle">Core i7</text></svg>',
  1
),
(
  (SELECT id FROM empresas WHERE codigo = 'lojateste'),
  'LT-003', '7891000000035',
  'Fone Bluetooth Noise Cancelling Studio ANC',
  'Cancelamento ativo de ruído (ANC), até 40 horas de bateria contínua, conexão multiponto Bluetooth 5.3 e almofadas ultra macias.',
  'Áudio e Som', 'SoundWave', 'UN', '85183000',
  210.00, 389.90, 25, 5,
  0.380, 22, 18, 10, 1,
  'Corredor B - Prat. 1',
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect width="320" height="320" rx="28" fill="%23faf5ff"/><path d="M80 170v-20a80 80 0 0 1 160 0v20" fill="none" stroke="%237c3aed" stroke-width="18" stroke-linecap="round"/><rect x="60" y="155" width="36" height="70" rx="16" fill="%235b21b6"/><rect x="224" y="155" width="36" height="70" rx="16" fill="%235b21b6"/><text x="160" y="265" font-family="sans-serif" font-size="18" font-weight="bold" fill="%235b21b6" text-anchor="middle">STUDIO ANC</text></svg>',
  1
),
(
  (SELECT id FROM empresas WHERE codigo = 'lojateste'),
  'LT-004', '7891000000042',
  'Smartwatch Fitness GPS AMOLED à Prova D''Água',
  'Monitoramento cardíaco e oxigênio 24h, GPS integrado de alta precisão, mais de 100 modos esportivos e tela AMOLED de 1.43".',
  'Acessórios', 'FitPulse', 'UN', '85176277',
  180.00, 349.00, 30, 5,
  0.220, 16, 11, 7, 1,
  'Corredor B - Prat. 2',
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect width="320" height="320" rx="28" fill="%23ecfdf5"/><rect x="128" y="36" width="64" height="248" rx="18" fill="%23047857"/><rect x="102" y="92" width="116" height="136" rx="28" fill="%23111827" stroke="%2310b981" stroke-width="6"/><text x="160" y="168" font-family="sans-serif" font-size="24" font-weight="bold" fill="%2334d399" text-anchor="middle">09:41</text></svg>',
  1
),
(
  (SELECT id FROM empresas WHERE codigo = 'lojateste'),
  'LT-005', '7891000000059',
  'Cafeteira Espresso Automática Inox 15 Bar',
  'Bomba italiana de 15 Bar de pressão, vaporizador de leite integrado para cappuccino, reservatório de 1,5L removível.',
  'Casa e Cozinha', 'CasaChef', 'UN', '85167100',
  420.00, 749.90, 12, 3,
  3.600, 34, 28, 32, 1,
  'Corredor C - Prat. 1',
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect width="320" height="320" rx="28" fill="%23fff7ed"/><rect x="88" y="52" width="144" height="216" rx="18" fill="%23334155"/><rect x="104" y="68" width="112" height="44" rx="8" fill="%23f97316"/><rect x="124" y="168" width="72" height="64" rx="8" fill="%23ffffff"/><text x="160" y="97" font-family="sans-serif" font-size="16" font-weight="bold" fill="%23ffffff" text-anchor="middle">15 BAR</text></svg>',
  1
),
(
  (SELECT id FROM empresas WHERE codigo = 'lojateste'),
  'LT-006', '7891000000066',
  'Fritadeira Elétrica Air Fryer Digital 5,5 Litros',
  'Painel touch LED com 8 funções pré-programadas, cesto antiaderente removível de 5,5L e potência de 1700W sem óleo.',
  'Casa e Cozinha', 'CasaChef', 'UN', '85166000',
  260.00, 469.90, 18, 4,
  4.200, 36, 36, 35, 1,
  'Corredor C - Prat. 2',
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect width="320" height="320" rx="28" fill="%23fef2f2"/><rect x="92" y="48" width="136" height="224" rx="42" fill="%231f2937"/><circle cx="160" cy="110" r="26" fill="%23ef4444"/><rect x="148" y="160" width="24" height="72" rx="10" fill="%239ca3af"/><text x="160" y="116" font-family="sans-serif" font-size="14" font-weight="bold" fill="%23ffffff" text-anchor="middle">5.5L</text></svg>',
  1
),
(
  (SELECT id FROM empresas WHERE codigo = 'lojateste'),
  'LT-007', '7891000000073',
  'Monitor Gamer Curvo 27" 165Hz 1ms Full HD',
  'Painel VA Curvo 1500R, taxa de atualização de 165Hz, tempo de resposta 1ms, FreeSync Premium, entradas HDMI e DisplayPort.',
  'Informática', 'HyperView', 'UN', '85285220',
  780.00, 1299.00, 9, 2,
  4.800, 66, 44, 16, 1,
  'Corredor A - Prat. 4',
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect width="320" height="320" rx="28" fill="%23f0f9ff"/><rect x="44" y="64" width="232" height="142" rx="10" fill="%230f172a" stroke="%230284c7" stroke-width="6"/><rect x="144" y="206" width="32" height="38" fill="%23334155"/><rect x="104" y="244" width="112" height="12" rx="6" fill="%23475569"/><text x="160" y="145" font-family="sans-serif" font-size="24" font-weight="bold" fill="%2338bdf8" text-anchor="middle">27" 165Hz</text></svg>',
  1
),
(
  (SELECT id FROM empresas WHERE codigo = 'lojateste'),
  'LT-008', '7891000000080',
  'Teclado Mecânico Gamer RGB Switch Blue ABNT2',
  'Teclas mecânicas Switch Blue táteis, iluminação Rainbow RGB configurável, layout ABNT2 com Ç e estrutura reforçada em metal.',
  'Informática', 'HyperView', 'UN', '84716052',
  110.00, 219.90, 22, 5,
  0.850, 46, 17, 6, 1,
  'Corredor B - Prat. 3',
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect width="320" height="320" rx="28" fill="%23f5f3ff"/><rect x="36" y="110" width="248" height="100" rx="14" fill="%231e1b4b" stroke="%238b5cf6" stroke-width="5"/><rect x="54" y="128" width="212" height="16" rx="4" fill="%23ec4899"/><rect x="54" y="152" width="212" height="16" rx="4" fill="%238b5cf6"/><rect x="54" y="176" width="212" height="16" rx="4" fill="%2306b6d4"/></svg>',
  1
),
(
  (SELECT id FROM empresas WHERE codigo = 'lojateste'),
  'LT-009', '7891000000097',
  'Mochila Executiva Impermeável p/ Notebook 17" USB',
  'Tecido Oxford impermeável de alta densidade, compartimento acolchoado para notebook até 17", saída USB externa e costura reforçada.',
  'Acessórios', 'UrbanBag', 'UN', '42029200',
  85.00, 179.90, 35, 6,
  0.720, 45, 32, 16, 1,
  'Corredor D - Prat. 1',
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect width="320" height="320" rx="28" fill="%23f1f5f9"/><rect x="88" y="64" width="144" height="204" rx="36" fill="%23334155"/><rect x="108" y="146" width="104" height="96" rx="18" fill="%231e293b" stroke="%2394a3b8" stroke-width="4"/><path d="M132 64a28 28 0 0 1 56 0" fill="none" stroke="%23334155" stroke-width="12"/></svg>',
  1
),
(
  (SELECT id FROM empresas WHERE codigo = 'lojateste'),
  'LT-010', '7891000000103',
  'Tênis Esportivo Running Ultra Light Amortecimento',
  'Solado em EVA de dupla densidade para absorção de impacto, cabedal em malha respirável Knit e palmilha anatômica ortopédica.',
  'Esporte e Lazer', 'RunFast', 'PAR', '64041100',
  130.00, 269.90, 20, 4,
  0.680, 33, 22, 13, 1,
  'Corredor D - Prat. 3',
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect width="320" height="320" rx="28" fill="%23ecfeff"/><path d="M52 204c0-28 42-68 88-68l36 28h72c14 0 24 14 24 40H52z" fill="%230891b2"/><rect x="48" y="204" width="228" height="24" rx="12" fill="%23ffffff" stroke="%230e7490" stroke-width="4"/><text x="160" y="192" font-family="sans-serif" font-size="16" font-weight="bold" fill="%23ffffff" text-anchor="middle">RUN PRO</text></svg>',
  1
),
(
  (SELECT id FROM empresas WHERE codigo = 'lojateste'),
  'LT-011', '7891000000110',
  'Caixa de Som Bluetooth Portátil 40W IPX7 à Prova D''Água',
  'Som estéreo potente de 40W RMS com radiadores passivos de graves, proteção IPX7 resistente à água e bateria para até 18 horas.',
  'Áudio e Som', 'SoundWave', 'UN', '85182200',
  165.00, 319.90, 16, 4,
  0.950, 24, 12, 12, 1,
  'Corredor B - Prat. 4',
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect width="320" height="320" rx="28" fill="%23eff6ff"/><rect x="52" y="106" width="216" height="108" rx="54" fill="%231d4ed8"/><circle cx="116" cy="160" r="32" fill="%231e3a8a"/><circle cx="204" cy="160" r="32" fill="%231e3a8a"/><text x="160" y="256" font-family="sans-serif" font-size="18" font-weight="bold" fill="%231d4ed8" text-anchor="middle">BOOM 40W</text></svg>',
  1
),
(
  (SELECT id FROM empresas WHERE codigo = 'lojateste'),
  'LT-012', '7891000000127',
  'Kit Parafusadeira e Furadeira Impacto 20V + Maleta 45 Peças',
  'Bateria de Lítio 20V 2.0Ah, mandril de aperto rápido 3/8", 18 níveis de torque + função impacto, iluminação LED e maleta completa.',
  'Ferramentas', 'MasterTool', 'KIT', '84672100',
  220.00, 399.90, 14, 3,
  2.450, 35, 29, 11, 1,
  'Corredor E - Prat. 1',
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect width="320" height="320" rx="28" fill="%23fefce8"/><path d="M96 96h116a16 16 0 0 1 16 16v32a16 16 0 0 1-16 16h-52l-18 68h-36l16-68H96z" fill="%23eab308" stroke="%23854d0e" stroke-width="5"/><rect x="102" y="228" width="64" height="28" rx="6" fill="%231f2937"/><text x="160" y="136" font-family="sans-serif" font-size="18" font-weight="bold" fill="%231f2937" text-anchor="middle">20V MAX</text></svg>',
  1
);

-- Cadastra também 4 ofertas em destaque para o carrossel da lojateste
INSERT OR REPLACE INTO loja_ofertas (empresa_id, produto_id, titulo_oferta, preco_oferta, ordem, ativa)
SELECT e.id, p.id, '🔥 Super Oferta 5G', 5299.00, 1, 1
  FROM empresas e JOIN produtos p ON p.empresa_id = e.id
 WHERE e.codigo = 'lojateste' AND p.codigo = 'LT-001';

INSERT OR REPLACE INTO loja_ofertas (empresa_id, produto_id, titulo_oferta, preco_oferta, ordem, ativa)
SELECT e.id, p.id, '⚡ Desconto Gamer', 1099.00, 2, 1
  FROM empresas e JOIN produtos p ON p.empresa_id = e.id
 WHERE e.codigo = 'lojateste' AND p.codigo = 'LT-007';

INSERT OR REPLACE INTO loja_ofertas (empresa_id, produto_id, titulo_oferta, preco_oferta, ordem, ativa)
SELECT e.id, p.id, '🎧 Semana do Áudio', 299.90, 3, 1
  FROM empresas e JOIN produtos p ON p.empresa_id = e.id
 WHERE e.codigo = 'lojateste' AND p.codigo = 'LT-003';

INSERT OR REPLACE INTO loja_ofertas (empresa_id, produto_id, titulo_oferta, preco_oferta, ordem, ativa)
SELECT e.id, p.id, '🍟 Oferta Cozinha', 389.90, 4, 1
  FROM empresas e JOIN produtos p ON p.empresa_id = e.id
 WHERE e.codigo = 'lojateste' AND p.codigo = 'LT-006';

-- Cadastra 3 serviços de exemplo na agenda da lojateste
DELETE FROM servicos
 WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = 'lojateste')
   AND nome IN ('Assistência Técnica e Diagnóstico Completo', 'Instalação de Película + Configuração Inicial', 'Manutenção Preventiva e Limpeza Interna');

INSERT INTO servicos (empresa_id, nome, descricao, duracao_minutos, preco, ativo) VALUES
(
  (SELECT id FROM empresas WHERE codigo = 'lojateste'),
  'Instalação de Película + Configuração Inicial',
  'Aplicação de película de vidro 3D e transferência completa de dados do aparelho.',
  30, 59.90, 1
),
(
  (SELECT id FROM empresas WHERE codigo = 'lojateste'),
  'Assistência Técnica e Diagnóstico Completo',
  'Avaliação técnica completa de smartphone ou notebook em laboratório.',
  45, 90.00, 1
),
(
  (SELECT id FROM empresas WHERE codigo = 'lojateste'),
  'Manutenção Preventiva e Limpeza Interna',
  'Higienização interna, troca de pasta térmica e otimização de sistema.',
  60, 149.90, 1
);
