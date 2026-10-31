const { reactData } = require('./official-html');
const { createSourceCache, getText } = require('./source-cache');
function parseHeader(h, base, season) {
  if (h.matchId !== base.id || h.competitionId !== 1 || h.teams?.home?.id !== base.homeTeam.id || h.teams?.away?.id !== base.awayTeam.id
    || [h.teams.home, h.teams.away].some(t => t.editionId !== season || t.competitionId !== 1)
    || Date.parse(h.start) !== Date.parse(base.startDateTime)) throw new Error('ACB live identity mismatch');
  const final = h.status === 'FINALIZED', live = ['STARTED', 'LIVE', 'IN_PROGRESS', 'PLAYING'].includes(h.status);
  const score = [h.currentHomeScore, h.currentAwayScore];
  if ((live || final) && (!score.every(n => Number.isInteger(n) && n >= 0 && n <= 999) || final && score[0] === score[1])) throw new Error('Invalid ACB live score');
  const period = Number.isInteger(h.currentQuarter) && h.currentQuarter > 0 && h.currentQuarter <= 20 ? h.currentQuarter : null;
  const clock = /^\d{1,2}:\d{2}$/.test(h.timeLeft || '') ? h.timeLeft : '';
  if (live || final) return { state: final ? 'final' : 'live', score, period, label: final ? 'Final' : 'En joc' + (h.isOnHalfTime ? ' · Descans' : period ? ' · ' + period + 'Q' : '') + (clock ? ' · ' + clock : '') };
  if (h.status === 'NOT_STARTED') return { state: 'scheduled', score: null, period, label: 'Pendent' };
  if (/POSTPON|SUSPEND|CANCEL/.test(h.status || '')) return { state: 'unavailable', score: null, period, label: 'Ajornat o suspés' };
  throw new Error('Unknown ACB live status');
}
function createClient({ cache, request = fetch, now = Date.now }) {
  const cached = createSourceCache(cache, now);
  return (base, season) => cached('acb:live:v1:' + season + ':' + base.id, value => value.state === 'final' ? 3600 : 15, async () => {
    const html = await getText('https://live.acb.com/es/partidos/' + base.id + '/resumen', (url, options) => request(url, { ...options, signal: AbortSignal.timeout(3500) }));
    const header = reactData(html, x => x.matchId === base.id && x.currentHomeScore !== undefined && x.currentAwayScore !== undefined);
    return parseHeader(header, base, season);
  }, 86400, { reconcile: (next, old) => {
    if (!old) return next;
    const a = next.value, b = old.value;
    const backward = b.state === 'final' && a.state !== 'final' || b.state === 'live' && a.state === 'scheduled'
      || a.period != null && b.period != null && a.period < b.period
      || a.state === 'live' && b.score && a.score.some((n, i) => n < b.score[i]);
    return backward ? { ...old, stale: true } : next;
  } });
}
module.exports = { createClient, parseHeader };
