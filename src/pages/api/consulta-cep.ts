import type { APIRoute } from 'astro';
import { onlyDigits } from '../../lib/validate';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

function decodeXml(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function xmlTag(xml: string, tag: string) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? decodeXml(m[1].trim()) : '';
}

async function consultarSigepCorreios(cep: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cli="http://cliente.bean.master.sigep.bsb.correios.com.br/">
  <soapenv:Header/>
  <soapenv:Body>
    <cli:consultaCEP><cep>${cep}</cep></cli:consultaCEP>
  </soapenv:Body>
</soapenv:Envelope>`;
  try {
    const r = await fetch('https://apps.correios.com.br/SigepMasterJPA/AtendeClienteService/AtendeCliente', {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body: soap,
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const xml = await r.text();
    const uf = xmlTag(xml, 'uf').toUpperCase();
    const cidade = xmlTag(xml, 'cidade');
    if (!uf && !cidade) return null;
    return {
      cep,
      logradouro: xmlTag(xml, 'end'),
      complemento: xmlTag(xml, 'complemento2'),
      bairro: xmlTag(xml, 'bairro'),
      cidade,
      uf,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Backoffice/1.0' },
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const GET: APIRoute = async ({ url }) => {

  const cep = onlyDigits(url.searchParams.get('cep') ?? '');
  if (cep.length !== 8) {
    return json({ erro: 'Informe um CEP válido com 8 dígitos.' }, 400);
  }

  // 1ª tentativa: Webservice SOAP dos Correios (SIGEP)
  const sigep = await consultarSigepCorreios(cep);
  if (sigep) return json({ ok: true, endereco: sigep });

  // 2ª tentativa: BrasilAPI (consulta em paralelo na base dos Correios)
  const br: any = await fetchJson(`https://brasilapi.com.br/api/cep/v2/${cep}`);
  if (br && (br.city || br.state)) {
    return json({
      ok: true,
      endereco: {
        cep,
        logradouro: br.street ?? '',
        complemento: '',
        bairro: br.neighborhood ?? '',
        cidade: br.city ?? '',
        uf: (br.state ?? '').toUpperCase(),
      },
    });
  }

  // 3ª tentativa: ViaCEP (base DNE dos Correios)
  const vc: any = await fetchJson(`https://viacep.com.br/ws/${cep}/json/`);
  if (vc && !vc.erro && (vc.localidade || vc.uf)) {
    return json({
      ok: true,
      endereco: {
        cep,
        logradouro: vc.logradouro ?? '',
        complemento: vc.complemento ?? '',
        bairro: vc.bairro ?? '',
        cidade: vc.localidade ?? '',
        uf: (vc.uf ?? '').toUpperCase(),
      },
    });
  }

  return json({ erro: 'CEP não encontrado na base dos Correios.' }, 404);
};
