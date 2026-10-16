import { getCache } from '@vercel/functions';
import service from '../lib/tv.js';
import view from '../lib/tv-page.js';
const load = service.createService({ cache: process.env.VERCEL ? getCache() : undefined });
export async function GET(request) {
  try {
    const data = await load();
    return new Response(view.render(data, new URL(request.url).searchParams.get('auto') !== '0'), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate', 'Vercel-CDN-Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    console.error('TV agenda:', error.message);
    return new Response(view.renderError(), { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
}
