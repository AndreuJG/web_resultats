import { getCache } from '@vercel/functions';
import service from '../lib/euroleague.js';
import view from '../lib/euroleague-page.js';

const load = service.createService({ cache: process.env.VERCEL ? getCache() : undefined });

export async function GET(request) {
  const url = new URL(request.url);
  const round = url.searchParams.get('jornada');
  if (round !== null && !/^[1-9]\d{0,2}$/.test(round)) return new Response(view.renderError('Jornada no vàlida.'), { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  try {
    const data = await load(round);
    return new Response(view.render(data, url.searchParams.get('auto') !== '0'), { headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Vercel-CDN-Cache-Control': 'public, max-age=10',
      'X-Content-Type-Options': 'nosniff'
    } });
  } catch (error) {
    console.error('Euroliga:', error.message);
    return new Response(view.renderError(error.status === 400 ? 'Aquesta jornada no està disponible.' : 'La font oficial no respon ara. Torna a provar-ho en uns segons.'), { status: error.status || 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
}
