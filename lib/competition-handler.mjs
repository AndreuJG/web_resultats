import { getCache, waitUntil } from '@vercel/functions';
import service from './euroleague.js';
import view from './euroleague-page.js';
import competitions from './competitions.js';
import acb from './acb.js';
import feb from './feb.js';
import fiba from './fiba.js';
import national from './national.js';

export function createHandler(competition) {
  const adapter = competitions[competition]?.national ? national : competitions[competition]?.fiba ? fiba : competition === 'ACB' ? acb : competitions[competition]?.febEdition ? feb : service;
  const load = adapter.createService({ competition, cache: process.env.VERCEL ? getCache() : undefined, defer: process.env.VERCEL ? waitUntil : undefined });
  return async function GET(request) {
    const url = new URL(request.url);
    const phaseControls = competitions[competition]?.national || ['U', 'ELW', 'ECW', 'BCL'].includes(competition);
    const round = url.searchParams.get('jornada');
    const phase = phaseControls ? url.searchParams.get('fase') : null;
    const group = phaseControls ? url.searchParams.get('grup') || null : null;
    const errorPage = (message, status) => new Response(view.renderError(message, competition), { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    if (round !== null && !/^[1-9]\d{0,2}$/.test(round)) return errorPage('Jornada no vàlida.', 400);
    if (phase !== null && !/^[1-9]\d{0,5}$/.test(phase)) return errorPage('Fase no vàlida.', 400);
    if (group !== null && !/^[A-Z]$/.test(group)) return errorPage('Grup no vàlid.', 400);
    try {
      // Old national links used jornada for the phase; keep those bookmarks valid.
      const data = competitions[competition]?.national
        ? phase === null ? await load(round, group) : await load(phase, group, round)
        : await load(round, group, phase);
      return new Response(view.render(data, url.searchParams.get('auto') !== '0'), { headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Vercel-CDN-Cache-Control': 'public, max-age=' + (data.cacheSeconds || 10),
        'X-Content-Type-Options': 'nosniff'
      } });
    } catch (error) {
      console.error(competitions[competition].title + ':', error.message);
      return errorPage(error.status === 400 ? 'Aquesta jornada no està disponible.' : 'La font oficial no respon ara. Torna a provar-ho en uns segons.', error.status || 503);
    }
  };
}
