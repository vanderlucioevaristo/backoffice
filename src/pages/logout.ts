import type { APIRoute } from 'astro';
import { destroySession, SESSION_COOKIE } from '../lib/auth';

const handleLogout: APIRoute = async ({ url, cookies, redirect }) => {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  cookies.delete(SESSION_COOKIE, { path: '/' });
  const expirado = url.searchParams.get('expirado') === '1';
  return redirect(expirado ? '/login?expirado=1' : '/login');
};

export const POST = handleLogout;
export const GET = handleLogout;
