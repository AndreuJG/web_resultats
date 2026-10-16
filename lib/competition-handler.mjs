import { getCache } from '@vercel/functions';
import service from './euroleague.js';
import view from './euroleague-page.js';
import competitions from './competitions.js';

export function createHandler(competition) {
  const load = service.createService({ competition, cache: process.env.VERCEL ? getCache() : undefined });
  return async function GET(request) {
    const url = new URL(request.url);
    const round = url.searchParams.get('jornada');
    const errorPage = (message, status) => new Response(view.renderError(message, competition), { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    if (round !== null && !/^[1-9]\d{0,2}$/.test(round)) return errorPage('Jornada no vàlida.', 400);
    try {
      const data = await load(round);
      return new Response(view.render(data, url.searchParams.get('auto') !== '0'), { headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Vercel-CDN-Cache-Control': 'public, max-age=10',
        'X-Content-Type-Options': 'nosniff'
      } });
    } catch (error) {
      console.error(competitions[competition].title + ':', error.message);
      return errorPage(error.status === 400 ? 'Aquesta jornada no està disponible.' : 'La font oficial no respon ara. Torna a provar-ho en uns segons.', error.status || 503);
    }
  };
}
