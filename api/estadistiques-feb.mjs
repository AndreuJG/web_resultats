import { getCache } from '@vercel/functions';
import service from '../lib/feb-stats.js';
import view from '../lib/feb-stats-page.js';
const load = service.createService({ cache: process.env.VERCEL ? getCache() : undefined });
export async function GET(request) {
  const query = new URL(request.url).searchParams;
  const id = query.get('partit'), round = query.get('jornada');
  const error = (message, status) => new Response(view.renderError(message), { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (!/^[1-9]\d{0,8}$/.test(id || '') || round !== null && !/^[1-9]\d{0,2}$/.test(round)) return error('Partit o jornada no vàlids.', 400);
  try {
    const data = await load(id);
    return new Response(view.render(data, { auto: query.get('auto') !== '0', detail: query.get('detall') === '1', round }), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate', 'Vercel-CDN-Cache-Control': 'public, max-age=10', 'X-Content-Type-Options': 'nosniff' } });
  } catch (e) {
    console.error('FEB statistics:', e.message);
    return error(e.status === 400 ? 'Aquest partit no correspon al CB Tabernes Blanques de Tercera FEB E-A.' : 'Les estadístiques FEB no responen ara. Torna-ho a provar en uns minuts.', e.status || 503);
  }
}
