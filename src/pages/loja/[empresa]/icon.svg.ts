import type { APIRoute } from 'astro';
import { getLojaEmpresa } from '../../../lib/auth';

export const GET: APIRoute = async ({ params }) => {
  const empCodigo = String(params.empresa ?? '').toLowerCase();
  const empresa = await getLojaEmpresa(empCodigo);
  const nome = empresa?.nome || 'Loja';
  const rawBg =
    !empresa?.cor_primaria || empresa.cor_primaria === '#2563eb'
      ? '#3483fa'
      : empresa.cor_primaria;
  const bg = /^#[0-9a-fA-F]{6}$/.test(rawBg) ? rawBg : '#3483fa';

  const palavras = nome
    .replace(/[^a-zA-ZÀ-ÿ0-9 ]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const iniciaisRaw =
    palavras.length >= 2
      ? (palavras[0][0] + palavras[1][0]).toUpperCase()
      : nome.replace(/[^a-zA-ZÀ-ÿ0-9]/g, '').slice(0, 2).toUpperCase() || 'LJ';
  const iniciais = iniciaisRaw.replace(/[<>&"']/g, '');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="112" fill="${bg}"/>
  <circle cx="256" cy="256" r="204" fill="rgba(255,255,255,0.12)"/>
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="188" font-weight="800">${iniciais}</text>
</svg>`;

  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
