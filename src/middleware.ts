import { defineMiddleware } from 'astro:middleware';
import { ensureSchema, getSessionUser, SESSION_COOKIE, IDLE_TIMEOUT_SEC } from './lib/auth';

const PUBLIC = [
  '/login',
  '/recuperar-senha',
  '/manifest.webmanifest',
  '/sw.js',
  '/icon-backoffice.svg',
  '/favicon.svg',
];

export const onRequest = defineMiddleware(async (ctx, next) => {
  await ensureSchema();

  const path = ctx.url.pathname;
  const token = ctx.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await getSessionUser(token) : null;
  ctx.locals.user = user;

  if (user && token) {
    // Renova o cookie pelo tempo de inatividade configurado na empresa
    ctx.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      path: '/',
      maxAge: user.tempoSessaoSegundos || IDLE_TIMEOUT_SEC,
    });
  }

  // As páginas da loja virtual (/loja/...), chat e consultas públicas têm controle próprio de acesso
  const isLojaPublic =
    path.startsWith('/loja/') ||
    path === '/api/loja-chat' ||
    path === '/api/calcular-frete' ||
    path === '/api/consulta-cep' ||
    path === '/api/consulta-doc' ||
    path === '/api/infinitepay-webhook';

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
  if (
    (path.startsWith('/empresas') || path === '/cadastro-empresa') &&
    (user?.perfil !== 'admin' || user?.empresaCodigo !== 'vanderltda')
  ) {
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
