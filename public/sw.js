const CACHE_NAME = 'backoffice-pwa-v1';
const OFFLINE_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sem conexão · App</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f4f6f9; color: #1e293b; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #fff; border-radius: 16px; padding: 28px; max-width: 400px; text-align: center; box-shadow: 0 4px 18px rgba(0,0,0,.08); }
    h1 { font-size: 20px; margin: 0 0 10px; }
    p { font-size: 14px; color: #64748b; line-height: 1.5; margin: 0 0 18px; }
    button { background: #2563eb; color: #fff; border: none; border-radius: 8px; padding: 10px 18px; font-size: 14px; font-weight: 700; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h1>📡 Você está sem conexão no momento</h1>
    <p>Verifique sua internet e toque no botão abaixo para recarregar o aplicativo.</p>
    <button onclick="window.location.reload()">Tentar novamente</button>
  </div>
</body>
</html>`;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Arquivos estáticos de build (/_astro/*) e ícones: Cache-first com atualização
  if (url.pathname.startsWith('/_astro/') || url.pathname.endsWith('.svg')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const net = await fetch(req);
        if (net.ok) cache.put(req, net.clone());
        return net;
      }),
    );
    return;
  }

  // Navegação de páginas: sempre Network-first (respeitando sessões e dados em tempo real), com fallback offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response(OFFLINE_HTML, {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          }),
      ),
    );
  }
});
