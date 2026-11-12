import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { db } from '../../lib/auth';
import { onlyDigits, validCNPJ } from '../../lib/validate';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

/** Valida o dígito verificador (módulo 11) da chave de acesso de 44 dígitos da NF-e. */
function validChaveNFe(c: string) {
  if (c.length !== 44 || !/^\d{44}$/.test(c)) return false;
  let peso = 2;
  let soma = 0;
  for (let i = 42; i >= 0; i--) {
    soma += Number(c[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = resto === 0 || resto === 1 ? 0 : 11 - resto;
  return dv === Number(c[43]);
}

function xmlTag(xml: string, tag: string) {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}

function xmlAll(xml: string, tag: string) {
  const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

type EmitenteDados = {
  documento: string;
  nome: string;
  nome_fantasia: string;
  rg_ie: string;
  telefone: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

type NfeParsed = {
  chave_acesso: string;
  numero: string;
  serie: string;
  data_emissao: string;
  emitente_cnpj: string;
  emitente_nome: string;
  emitente: EmitenteDados;
  valor_frete: number;
  valor_desconto: number;
  valor_outros: number;
  observacoes: string;
  itens: Array<{
    codigo: string;
    ean: string;
    nome: string;
    ncm: string;
    unidade: string;
    quantidade: number;
    valor_unitario: number;
  }>;
};

function parseNfeXml(xml: string): NfeParsed | null {
  const infNFe = xmlTag(xml, 'infNFe');
  if (!infNFe) return null;

  const idMatch = xml.match(/infNFe[^>]*\bId=["']NFe(\d{44})["']/i);
  const chave = idMatch ? idMatch[1] : onlyDigits(xmlTag(xml, 'chNFe'));

  const ide = xmlTag(infNFe, 'ide');
  const emit = xmlTag(infNFe, 'emit');
  const enderEmit = xmlTag(emit, 'enderEmit');
  const total = xmlTag(xmlTag(infNFe, 'total'), 'ICMSTot');
  const infAdic = xmlTag(infNFe, 'infAdic');

  const dhEmi = xmlTag(ide, 'dhEmi') || xmlTag(ide, 'dEmi');
  const dataEmissao = dhEmi ? dhEmi.slice(0, 10) : new Date().toISOString().slice(0, 10);

  const dets = xmlAll(infNFe, 'det');
  const itens = dets.map((det) => {
    const prod = xmlTag(det, 'prod');
    const eanRaw = xmlTag(prod, 'cEAN') || xmlTag(prod, 'cEANTrib');
    const ean = eanRaw && eanRaw !== 'SEM GTIN' ? eanRaw : '';
    return {
      codigo: xmlTag(prod, 'cProd'),
      ean,
      nome: xmlTag(prod, 'xProd'),
      ncm: onlyDigits(xmlTag(prod, 'NCM')),
      unidade: (xmlTag(prod, 'uCom') || 'UN').toUpperCase(),
      quantidade: Number(xmlTag(prod, 'qCom') || 0),
      valor_unitario: Number(xmlTag(prod, 'vUnCom') || 0),
    };
  });

  const emitDoc = onlyDigits(xmlTag(emit, 'CNPJ') || xmlTag(emit, 'CPF'));
  const emitNome = xmlTag(emit, 'xNome');
  const ieRaw = xmlTag(emit, 'IE');

  return {
    chave_acesso: chave,
    numero: String(Number(xmlTag(ide, 'nNF') || 0) || xmlTag(ide, 'nNF')),
    serie: String(Number(xmlTag(ide, 'serie') || 0) || xmlTag(ide, 'serie') || '1'),
    data_emissao: dataEmissao,
    emitente_cnpj: emitDoc,
    emitente_nome: emitNome,
    emitente: {
      documento: emitDoc,
      nome: emitNome,
      nome_fantasia: xmlTag(emit, 'xFant'),
      rg_ie: ieRaw && ieRaw !== 'ISENTO' ? ieRaw : '',
      telefone: onlyDigits(xmlTag(enderEmit, 'fone')),
      cep: onlyDigits(xmlTag(enderEmit, 'CEP')),
      logradouro: xmlTag(enderEmit, 'xLgr'),
      numero: xmlTag(enderEmit, 'nro'),
      complemento: xmlTag(enderEmit, 'xCpl'),
      bairro: xmlTag(enderEmit, 'xBairro'),
      cidade: xmlTag(enderEmit, 'xMun'),
      uf: xmlTag(enderEmit, 'UF').toUpperCase(),
    },
    valor_frete: Number(xmlTag(total, 'vFrete') || 0),
    valor_desconto: Number(xmlTag(total, 'vDesc') || 0),
    valor_outros: Number(xmlTag(total, 'vOutro') || 0),
    observacoes: xmlTag(infAdic, 'infCpl'),
    itens,
  };
}

async function fetchNfeAmbienteExterno(chave: string): Promise<NfeParsed | null> {
  // Permite configurar um conector SEFAZ/DFe (ex.: NFE_API_URL="https://.../nfe/{chave}")
  const tpl = String((env as any).NFE_API_URL ?? '').trim();
  const token = String((env as any).NFE_API_TOKEN ?? '').trim();
  if (!tpl) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const headers: Record<string, string> = { Accept: 'application/json, application/xml, text/xml' };
    if (token) headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    const res = await fetch(tpl.replace('{chave}', chave), { headers, signal: ctrl.signal });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.trim().startsWith('<')) return parseNfeXml(text);
    const data: any = JSON.parse(text);
    if (data?.xml) return parseNfeXml(String(data.xml));
    if (data?.nfeProc || data?.NFe) {
      const inf = data.nfeProc?.NFe?.infNFe ?? data.NFe?.infNFe ?? {};
      const detList = Array.isArray(inf.det) ? inf.det : inf.det ? [inf.det] : [];
      const emitDoc = onlyDigits(String(inf.emit?.CNPJ ?? inf.emit?.CPF ?? ''));
      const emitNome = String(inf.emit?.xNome ?? '');
      const ender = inf.emit?.enderEmit ?? {};
      return {
        chave_acesso: chave,
        numero: String(inf.ide?.nNF ?? ''),
        serie: String(inf.ide?.serie ?? '1'),
        data_emissao: String(inf.ide?.dhEmi ?? inf.ide?.dEmi ?? '').slice(0, 10),
        emitente_cnpj: emitDoc,
        emitente_nome: emitNome,
        emitente: {
          documento: emitDoc,
          nome: emitNome,
          nome_fantasia: String(inf.emit?.xFant ?? ''),
          rg_ie: String(inf.emit?.IE ?? ''),
          telefone: onlyDigits(String(ender.fone ?? '')),
          cep: onlyDigits(String(ender.CEP ?? '')),
          logradouro: String(ender.xLgr ?? ''),
          numero: String(ender.nro ?? ''),
          complemento: String(ender.xCpl ?? ''),
          bairro: String(ender.xBairro ?? ''),
          cidade: String(ender.xMun ?? ''),
          uf: String(ender.UF ?? '').toUpperCase(),
        },
        valor_frete: Number(inf.total?.ICMSTot?.vFrete ?? 0),
        valor_desconto: Number(inf.total?.ICMSTot?.vDesc ?? 0),
        valor_outros: Number(inf.total?.ICMSTot?.vOutro ?? 0),
        observacoes: String(inf.infAdic?.infCpl ?? ''),
        itens: detList.map((d: any) => ({
          codigo: String(d.prod?.cProd ?? ''),
          ean: d.prod?.cEAN && d.prod.cEAN !== 'SEM GTIN' ? String(d.prod.cEAN) : '',
          nome: String(d.prod?.xProd ?? ''),
          ncm: onlyDigits(String(d.prod?.NCM ?? '')),
          unidade: String(d.prod?.uCom ?? 'UN').toUpperCase(),
          quantidade: Number(d.prod?.qCom ?? 0),
          valor_unitario: Number(d.prod?.vUnCom ?? 0),
        })),
      };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Decompõe a chave de 44 dígitos da NF-e nos campos oficiais do layout SEFAZ. */
function extrairDadosDaChave44(chave: string): NfeParsed {
  // Posições (0-based):
  // 00..01 cUF (2) | 02..05 AAMM (4) | 06..19 CNPJ emitente (14) | 20..21 mod (2)
  // 22..24 serie (3) | 25..33 nNF (9) | 34 tpEmis (1) | 35..42 cNF (8) | 43 cDV (1)
  const aamm = chave.slice(2, 6);
  const ano = 2000 + Number(aamm.slice(0, 2));
  const mes = aamm.slice(2, 4);
  const hoje = new Date().toISOString().slice(0, 10);
  const dataEmissao = hoje.startsWith(`${ano}-${mes}`) ? hoje : `${ano}-${mes}-01`;

  const cnpj = chave.slice(6, 20);
  const serie = String(Number(chave.slice(22, 25)));
  const numero = String(Number(chave.slice(25, 34)));

  return {
    chave_acesso: chave,
    numero,
    serie,
    data_emissao: dataEmissao,
    emitente_cnpj: cnpj,
    emitente_nome: '',
    emitente: {
      documento: cnpj,
      nome: '',
      nome_fantasia: '',
      rg_ie: '',
      telefone: '',
      cep: '',
      logradouro: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      uf: '',
    },
    valor_frete: 0,
    valor_desconto: 0,
    valor_outros: 0,
    observacoes: '',
    itens: [],
  };
}

async function enriquecerEmitentePorCnpj(emit: EmitenteDados) {
  if (!emit.documento || emit.documento.length !== 14 || emit.nome) return emit;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${emit.documento}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Backoffice/1.0' },
      signal: ctrl.signal,
    });
    if (!r.ok) return emit;
    const br: any = await r.json();
    if (br && br.razao_social) {
      return {
        documento: emit.documento,
        nome: br.razao_social ?? '',
        nome_fantasia: br.nome_fantasia ?? '',
        rg_ie: '',
        telefone: br.ddd_telefone_1 ?? '',
        cep: onlyDigits(String(br.cep ?? '')),
        logradouro: [br.descricao_tipo_de_logradouro, br.logradouro].filter(Boolean).join(' ').trim(),
        numero: br.numero ?? '',
        complemento: br.complemento ?? '',
        bairro: br.bairro ?? '',
        cidade: br.municipio ?? '',
        uf: String(br.uf ?? '').toUpperCase(),
      };
    }
  } catch {} finally {
    clearTimeout(timer);
  }
  return emit;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const u = locals.user;
  if (!u) return json({ erro: 'Não autenticado.' }, 401);

  const body: any = await request.json().catch(() => ({}));
  const chaveRaw = onlyDigits(String(body.chave ?? ''));
  const xmlRaw = String(body.xml ?? '').trim();

  let parsed: NfeParsed | null = null;
  let origem = 'xml';

  if (xmlRaw) {
    parsed = parseNfeXml(xmlRaw);
    if (!parsed) {
      return json({ erro: 'O arquivo/texto enviado não é um XML de NF-e válido.' }, 400);
    }
  } else if (chaveRaw) {
    if (chaveRaw.length !== 44) {
      return json({ erro: 'A chave de acesso da NF-e deve conter exatamente 44 dígitos.' }, 400);
    }
    if (!validChaveNFe(chaveRaw)) {
      return json({ erro: 'Chave de acesso da NF-e inválida (dígito verificador incorreto).' }, 400);
    }
    parsed = await fetchNfeAmbienteExterno(chaveRaw);
    if (parsed) {
      origem = 'api';
    } else {
      parsed = extrairDadosDaChave44(chaveRaw);
      origem = 'chave';
    }
  } else {
    return json({ erro: 'Informe a chave de acesso da NF-e (44 dígitos) ou selecione o XML da NF-e.' }, 400);
  }

  // Localiza o fornecedor pelo CNPJ emitente na empresa logada
  let fornecedor: { id: number; nome: string; documento: string } | null = null;
  if (parsed.emitente_cnpj) {
    fornecedor =
      (await db()
        .prepare('SELECT id, nome, documento FROM parceiros WHERE empresa_id = ? AND documento = ? AND eh_fornecedor = 1')
        .bind(u.empresaId, parsed.emitente_cnpj)
        .first<{ id: number; nome: string; documento: string }>()) ?? null;

    if (!fornecedor) {
      parsed.emitente = await enriquecerEmitentePorCnpj(parsed.emitente);
      parsed.emitente_nome = parsed.emitente.nome || parsed.emitente_nome;
    }
  }

  // Carrega os produtos da empresa e os vínculos com fornecedor para casar os itens da NF-e
  const { results: produtos } = await db()
    .prepare('SELECT id, codigo, codigo_barras, nome, preco_custo, preco_venda FROM produtos WHERE empresa_id = ? AND ativo = 1')
    .bind(u.empresaId)
    .all<{ id: number; codigo: string | null; codigo_barras: string | null; nome: string; preco_custo: number; preco_venda: number }>();

  const { results: vinculos } = await db()
    .prepare('SELECT produto_id, fornecedor_id, codigo_fornecedor FROM produtos_fornecedores WHERE empresa_id = ?')
    .bind(u.empresaId)
    .all<{ produto_id: number; fornecedor_id: number; codigo_fornecedor: string | null }>();

  const itensMapeados = parsed.itens.map((it) => {
    let prodMatch: (typeof produtos)[number] | undefined;

    // 1º: código do produto no fornecedor (produtos_fornecedores)
    if (fornecedor && it.codigo) {
      const v = vinculos.find(
        (x) => x.fornecedor_id === fornecedor!.id && x.codigo_fornecedor && x.codigo_fornecedor.toLowerCase() === it.codigo.toLowerCase(),
      );
      if (v) prodMatch = produtos.find((p) => p.id === v.produto_id);
    }
    // 2º: EAN / código de barras
    if (!prodMatch && it.ean) {
      prodMatch = produtos.find((p) => p.codigo_barras && p.codigo_barras === it.ean);
    }
    // 3º: SKU / código interno
    if (!prodMatch && it.codigo) {
      prodMatch = produtos.find((p) => p.codigo && p.codigo.toLowerCase() === it.codigo.toLowerCase());
    }
    // 4º: Nome igual
    if (!prodMatch && it.nome) {
      prodMatch = produtos.find((p) => p.nome.toLowerCase() === it.nome.toLowerCase());
    }

    return {
      ...it,
      produto_id: prodMatch?.id ?? 0,
      preco_venda_atual: prodMatch?.preco_venda ?? null,
    };
  });

  // Se o XML não veio e só tínhamos a chave, mas o fornecedor tem produtos vinculados,
  // pré-carrega os produtos habituais daquele fornecedor para agilizar o lançamento
  if (origem === 'chave' && itensMapeados.length === 0 && fornecedor) {
    const vincsForn = vinculos.filter((v) => v.fornecedor_id === fornecedor!.id);
    for (const vf of vincsForn) {
      const pr = produtos.find((p) => p.id === vf.produto_id);
      if (pr) {
        itensMapeados.push({
          codigo: vf.codigo_fornecedor ?? pr.codigo ?? '',
          ean: pr.codigo_barras ?? '',
          nome: pr.nome,
          ncm: '',
          unidade: 'UN',
          quantidade: 1,
          valor_unitario: pr.preco_custo ?? 0,
          produto_id: pr.id,
          preco_venda_atual: pr.preco_venda ?? null,
        });
      }
    }
  }

  const naoIdentificados = itensMapeados.filter((i) => !i.produto_id).length;
  let aviso = 'Dados da NF-e carregados no formulário. Confira os campos e clique em "Confirmar entrada e alimentar estoque" para salvar.';
  if (!fornecedor && parsed.emitente_cnpj && validCNPJ(parsed.emitente_cnpj)) {
    aviso = `Emitente CNPJ ${parsed.emitente_cnpj}${parsed.emitente_nome ? ` (${parsed.emitente_nome})` : ''} ainda não está cadastrado como fornecedor. Cadastre-o ou selecione o fornecedor antes de salvar.`;
  } else if (naoIdentificados > 0) {
    aviso = `Dados da NF-e carregados! ${naoIdentificados} item(ns) da nota não foram associados automaticamente — selecione o produto correspondente na lista antes de salvar.`;
  } else if (origem === 'chave') {
    aviso =
      'Dados extraídos da Chave de Acesso da NF-e (nº, série, emissão e CNPJ do fornecedor). Para carregar também todos os itens da nota automaticamente sem digitar, selecione o arquivo XML da NF-e no diálogo.';
  }

  return json({
    ok: true,
    origem,
    aviso,
    nota: {
      chave_acesso: parsed.chave_acesso,
      numero: parsed.numero,
      serie: parsed.serie,
      data_emissao: parsed.data_emissao,
      fornecedor_id: fornecedor?.id ?? 0,
      emitente_cnpj: parsed.emitente_cnpj,
      emitente_nome: parsed.emitente_nome,
      emitente: parsed.emitente,
      valor_frete: parsed.valor_frete,
      valor_desconto: parsed.valor_desconto,
      valor_outros: parsed.valor_outros,
      observacoes: parsed.observacoes,
      itens: itensMapeados,
    },
  });
};
