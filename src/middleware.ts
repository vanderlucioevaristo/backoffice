import { defineMiddleware } from 'astro:middleware';
import { getSessionUser, SESSION_COOKIE } from './lib/auth';

const PUBLIC = ['/login', '/cadastro-empresa', '/recuperar-senha'];

export const onRequest = defineMiddleware(async (ctx, next) => {
  const path = ctx.url.pathname;
  const token = ctx.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await getSessionUser(token) : null;
  ctx.locals.user = user;

  // As páginas da loja virtual (/loja/...) e a consulta de CEP têm controle próprio de acesso do cliente
  const isLojaPublic = path.startsWith('/loja/') || path === '/api/consulta-cep' || path === '/api/consulta-doc';

  if (!user && !PUBLIC.includes(path) && !isLojaPublic) {
    if (token) ctx.cookies.delete(SESSION_COOKIE, { path: '/' });
    return ctx.redirect('/login');
  }
  if (path.startsWith('/usuarios') && user?.perfil !== 'admin') {
    return ctx.redirect('/?erro=permissao');
  }
  const res = await next();
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  return res;
});
