import { defineMiddleware } from 'astro:middleware';
import { ensureSchema, getSessionUser, SESSION_COOKIE, IDLE_TIMEOUT_SEC } from './lib/auth';

const PUBLIC = ['/login', '/cadastro-empresa', '/recuperar-senha'];

export const onRequest = defineMiddleware(async (ctx, next) => {
  await ensureSchema();

  const path = ctx.url.pathname;
  const token = ctx.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await getSessionUser(token) : null;
  ctx.locals.user = user;

  if (user && token) {
    // Renova o cookie por mais 5 minutos a cada requisição ativa
    ctx.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      path: '/',
      maxAge: IDLE_TIMEOUT_SEC,
    });
  }

  // As páginas da loja virtual (/loja/...), chat e consultas públicas têm controle próprio de acesso
  const isLojaPublic =
    path.startsWith('/loja/') ||
    path === '/api/loja-chat' ||
    path === '/api/consulta-cep' ||
    path === '/api/consulta-doc';

  if (!user && !PUBLIC.includes(path) && !isLojaPublic) {
    if (token) {
      ctx.cookies.delete(SESSION_COOKIE, { path: '/' });
      return ctx.redirect('/login?expirado=1');
    }
    return ctx.redirect('/login');
  }
  if (path.startsWith('/usuarios') && user?.perfil !== 'admin') {
    return ctx.redirect('/?erro=permissao');
  }
  const res = await next();
  try {
    const out = new Response(res.body, res);
    out.headers.set('Cache-Control', 'no-store');
    out.headers.set('X-Frame-Options', 'DENY');
    out.headers.set('X-Content-Type-Options', 'nosniff');
    return out;
  } catch {
    return res;
  }
});
