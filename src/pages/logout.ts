import type { APIRoute } from 'astro';
import { destroySession, SESSION_COOKIE } from '../lib/auth';

export const POST: APIRoute = async ({ cookies, redirect }) => {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  cookies.delete(SESSION_COOKIE, { path: '/' });
  return redirect('/login');
};
