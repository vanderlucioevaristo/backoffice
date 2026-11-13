import type { APIRoute } from 'astro';
import { destroyClientSession, CLIENT_SESSION_COOKIE } from '../../../lib/auth';

const handleSair: APIRoute = async ({ url, params, cookies, redirect }) => {
  const empCodigo = String(params.empresa ?? '').toLowerCase();
  const token = cookies.get(CLIENT_SESSION_COOKIE)?.value;
  if (token) await destroyClientSession(token);
  cookies.delete(CLIENT_SESSION_COOKIE, { path: '/' });
  const expirado = url.searchParams.get('expirado') === '1';
  return redirect(expirado ? `/loja/${empCodigo}/login?expirado=1` : `/loja/${empCodigo}/login`);
};

export const POST = handleSair;
export const GET = handleSair;
