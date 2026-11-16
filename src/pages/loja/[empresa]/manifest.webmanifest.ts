import type { APIRoute } from 'astro';
import { getLojaEmpresa } from '../../../lib/auth';
import { gerarManifestoPwaLoja } from '../../../lib/empresa-service';

export const GET: APIRoute = async ({ params }) => {
  const empCodigo = String(params.empresa ?? '').toLowerCase();
  const empresa = await getLojaEmpresa(empCodigo);
  if (!empresa) {
    return new Response('Not found', { status: 404 });
  }

  const manifest = gerarManifestoPwaLoja(empresa);

  return new Response(JSON.stringify(manifest, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
