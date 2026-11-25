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

  // As páginas da loja virtual (/loja/...), chat, webhooks e consultas públicas têm controle próprio de acesso
  const isLojaPublic =
    path.startsWith('/loja/') ||
    path === '/api/loja-chat' ||
    path === '/api/loja-metricas' ||
    path === '/api/calcular-frete' ||
    path === '/api/consulta-cep' ||
    path === '/api/consulta-doc' ||
    path === '/api/infinitepay-webhook';

  // Proteção CSRF para métodos que alteram estado (exceto webhooks externos autenticados via API)
  const method = ctx.request.method.toUpperCase();
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && path !== '/api/infinitepay-webhook') {
    const origin = ctx.request.headers.get('origin');
    const referer = ctx.request.headers.get('referer');
    const expectedHost = ctx.url.host;
    if (origin) {
      try {
        if (new URL(origin).host !== expectedHost) {
          return new Response('Requisição bloqueada por proteção CSRF (Origin inválido).', { status: 403 });
        }
      } catch {
        return new Response('Requisição bloqueada por proteção CSRF.', { status: 403 });
      }
    } else if (referer) {
      try {
        if (new URL(referer).host !== expectedHost) {
          return new Response('Requisição bloqueada por proteção CSRF (Referer inválido).', { status: 403 });
        }
      } catch {
        return new Response('Requisição bloqueada por proteção CSRF.', { status: 403 });
      }
    }
  }

  if (!user && !PUBLIC.includes(path) && !isLojaPublic) {
    if (token) {
      ctx.cookies.delete(SESSION_COOKIE, { path: '/' });
      return ctx.redirect('/login?expirado=1');
    }
    return ctx.redirect('/login');
  }
  if ((path.startsWith('/usuarios') || path.startsWith('/loja-config')) && user?.perfil !== 'admin') {
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
    out.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    out.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    out.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
    out.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    out.headers.set(
      'Content-Security-Policy',
      "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' https://cepcerto.com https://unpkg.com; style-src 'self' 'unsafe-inline' https:; img-src 'self' https: data: blob:; frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    );
    return out;
  } catch {
    return res;
  }
});
