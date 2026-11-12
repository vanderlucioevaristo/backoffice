import type { APIRoute } from 'astro';
import { destroyClientSession, CLIENT_SESSION_COOKIE } from '../../../lib/auth';

export const POST: APIRoute = async ({ params, cookies, redirect }) => {
  const empCodigo = String(params.empresa ?? '').toLowerCase();
  const token = cookies.get(CLIENT_SESSION_COOKIE)?.value;
  if (token) await destroyClientSession(token);
  cookies.delete(CLIENT_SESSION_COOKIE, { path: '/' });
  return redirect(`/loja/${empCodigo}/login`);
};
