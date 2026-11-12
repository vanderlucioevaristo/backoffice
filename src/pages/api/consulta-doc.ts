import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { onlyDigits, validCPF, validCNPJ } from '../../lib/validate';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

async function fetchJson(url: string, headers: Record<string, string> = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Backoffice/1.0', ...headers },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const GET: APIRoute = async ({ url }) => {

  const doc = onlyDigits(url.searchParams.get('doc') ?? '');

  // ==================== CNPJ (14 dígitos) ====================
  if (doc.length === 14) {
    if (!validCNPJ(doc)) {
      return json({ erro: 'CNPJ inválido. Verifique os dígitos informados.' }, 400);
    }

    // 1ª opção: BrasilAPI (Receita Federal / Minha Receita)
    const br: any = await fetchJson(`https://brasilapi.com.br/api/cnpj/v1/${doc}`);
    if (br && (br.razao_social || br.cnpj)) {
      const socio = Array.isArray(br.qsa) && br.qsa.length > 0 ? br.qsa[0].nome_socio || '' : '';
      const logradouro = [br.descricao_tipo_de_logradouro, br.logradouro].filter(Boolean).join(' ').trim();
      return json({
        ok: true,
        aviso: 'Dados públicos da Receita Federal carregados. Confira e clique em Salvar.',
        dados: {
          tipo_pessoa: 'J',
          documento: doc,
          nome: br.razao_social ?? '',
          nome_fantasia: br.nome_fantasia ?? '',
          rg_ie: '',
          email: (br.email ?? '').toLowerCase(),
          telefone: br.ddd_telefone_1 ?? '',
          celular: br.ddd_telefone_2 ?? '',
          contato: socio,
          cep: onlyDigits(String(br.cep ?? '')),
          logradouro,
          numero: br.numero ?? '',
          complemento: br.complemento ?? '',
          bairro: br.bairro ?? '',
          cidade: br.municipio ?? '',
          uf: (br.uf ?? '').toUpperCase(),
          ativo: br.descricao_situacao_cadastral ? br.descricao_situacao_cadastral === 'ATIVA' : true,
          observacoes: br.cnae_fiscal_descricao ? `Atividade principal: ${br.cnae_fiscal_descricao}` : '',
        },
      });
    }

    // 2ª opção (fallback): publica.cnpj.ws (também traz Inscrição Estadual quando disponível)
    const ws: any = await fetchJson(`https://publica.cnpj.ws/cnpj/${doc}`);
    if (ws && ws.razao_social) {
      const est = ws.estabelecimento ?? {};
      const ieAtiva = Array.isArray(est.inscricoes_estaduais)
        ? (est.inscricoes_estaduais.find((i: any) => i.ativo) ?? est.inscricoes_estaduais[0])
        : null;
      const socio = Array.isArray(ws.socios) && ws.socios.length > 0 ? ws.socios[0].nome || '' : '';
      const logradouro = [est.tipo_logradouro, est.logradouro].filter(Boolean).join(' ').trim();
      return json({
        ok: true,
        aviso: 'Dados públicos do CNPJ carregados. Confira e clique em Salvar.',
        dados: {
          tipo_pessoa: 'J',
          documento: doc,
          nome: ws.razao_social ?? '',
          nome_fantasia: est.nome_fantasia ?? '',
          rg_ie: ieAtiva?.inscricao_estadual ?? '',
          email: (est.email ?? '').toLowerCase(),
          telefone: [est.ddd1, est.telefone1].filter(Boolean).join(''),
          celular: [est.ddd2, est.telefone2].filter(Boolean).join(''),
          contato: socio,
          cep: onlyDigits(String(est.cep ?? '')),
          logradouro,
          numero: est.numero ?? '',
          complemento: est.complemento ?? '',
          bairro: est.bairro ?? '',
          cidade: est.cidade?.nome ?? '',
          uf: (est.estado?.sigla ?? '').toUpperCase(),
          ativo: est.situacao_cadastral ? est.situacao_cadastral === 'Ativa' : true,
          observacoes: est.atividade_principal?.descricao ? `Atividade principal: ${est.atividade_principal.descricao}` : '',
        },
      });
    }

    // 3ª opção (fallback): ReceitaWS
    const rws: any = await fetchJson(`https://receitaws.com.br/v1/cnpj/${doc}`);
    if (rws && rws.status !== 'ERROR' && rws.nome) {
      return json({
        ok: true,
        aviso: 'Dados públicos do CNPJ carregados. Confira e clique em Salvar.',
        dados: {
          tipo_pessoa: 'J',
          documento: doc,
          nome: rws.nome ?? '',
          nome_fantasia: rws.fantasia ?? '',
          rg_ie: '',
          email: (rws.email ?? '').toLowerCase(),
          telefone: rws.telefone ?? '',
          celular: '',
          contato: Array.isArray(rws.qsa) && rws.qsa[0] ? rws.qsa[0].nome : '',
          cep: onlyDigits(String(rws.cep ?? '')),
          logradouro: rws.logradouro ?? '',
          numero: rws.numero ?? '',
          complemento: rws.complemento ?? '',
          bairro: rws.bairro ?? '',
          cidade: rws.municipio ?? '',
          uf: (rws.uf ?? '').toUpperCase(),
          ativo: true,
          observacoes: '',
        },
      });
    }

    return json({ erro: 'CNPJ não encontrado nas bases públicas da Receita Federal ou serviço temporariamente indisponível.' }, 404);
  }

  // ==================== CPF (11 dígitos) ====================
  if (doc.length === 11) {
    if (!validCPF(doc)) {
      return json({ erro: 'CPF inválido. Verifique os dígitos informados.' }, 400);
    }

    // Caso a empresa configure um endpoint de consulta de CPF (ex.: CPF_API_URL="https://.../cpf/{cpf}?token=...")
    const cpfApiTpl = String((env as any).CPF_API_URL ?? '').trim();
    if (cpfApiTpl) {
      const cpfData: any = await fetchJson(cpfApiTpl.replace('{cpf}', doc));
      if (cpfData && (cpfData.nome || cpfData.name)) {
        return json({
          ok: true,
          aviso: 'Dados do CPF carregados. Confira e clique em Salvar.',
          dados: {
            tipo_pessoa: 'F',
            documento: doc,
            nome: cpfData.nome ?? cpfData.name ?? '',
            nome_fantasia: '',
            rg_ie: cpfData.rg ?? '',
            email: cpfData.email ?? '',
            telefone: cpfData.telefone ?? '',
            celular: cpfData.celular ?? '',
            contato: '',
            cep: onlyDigits(String(cpfData.cep ?? '')),
            logradouro: cpfData.logradouro ?? '',
            numero: cpfData.numero ?? '',
            complemento: cpfData.complemento ?? '',
            bairro: cpfData.bairro ?? '',
            cidade: cpfData.cidade ?? cpfData.municipio ?? '',
            uf: (cpfData.uf ?? '').toUpperCase(),
            ativo: true,
            observacoes: '',
          },
        });
      }
    }

    // Por força da LGPD, a Receita Federal não disponibiliza base aberta gratuita de endereço/nome por CPF.
    // Retornamos o CPF validado e tipo Pessoa Física para preencher o formulário.
    return json({
      ok: true,
      aviso:
        'CPF válido! Por restrição da LGPD, dados pessoais de Pessoa Física não ficam em bases públicas gratuitas — o CPF foi preenchido para você completar os demais campos e salvar.',
      dados: {
        tipo_pessoa: 'F',
        documento: doc,
      },
    });
  }

  return json({ erro: 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).' }, 400);
};
