import type { APIRoute } from 'astro';
import {
  CLIENT_SESSION_COOKIE,
  IDLE_TIMEOUT_SEC,
  db,
  getLojaEmpresa,
  getSessionClient,
} from '../../lib/auth';
import { alternarFavoritoLoja } from '../../lib/empresa-service';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, erro: 'JSON inválido.' }, 400);
  }

  const empCodigo = String(body?.empresa ?? '').trim().toLowerCase();
  const produtoId = Number(body?.produtoId) || 0;

  if (!empCodigo || produtoId <= 0) {
    return json({ ok: false, erro: 'Empresa e produto são obrigatórios.' }, 400);
  }

  const empresa = await getLojaEmpresa(empCodigo);
  if (!empresa) {
    return json({ ok: false, erro: 'Loja não encontrada.' }, 404);
  }

  const token = cookies.get(CLIENT_SESSION_COOKIE)?.value;
  const cliente = token ? await getSessionClient(token, empresa.codigo) : null;
  if (!cliente) {
    return json({ ok: false, sessaoExpirada: true, erro: 'Faça login para favoritar produtos.' }, 401);
  }

  cookies.set(CLIENT_SESSION_COOKIE, token!, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: cliente.tempoSessaoSegundos || IDLE_TIMEOUT_SEC,
  });

  const res = await alternarFavoritoLoja(db(), {
    empresaId: empresa.id,
    parceiroId: cliente.id,
    produtoId,
  });

  return json(res, res.ok ? 200 : 400);
};
