const { createSourceCache } = require('./source-cache');
const { attrs } = require('./feb-classic-source');
const API = 'https://intrafeb.feb.es/LiveStats.API/api/v1/overview';
function createClient({ request = fetch, cache, now = Date.now } = {}) {
  const cached = createSourceCache(cache, now);
  // Public viewer session, held only in process memory. Never persist or log it.
  let credential, credentialAt;
  function session(html) {
    const block = html.match(/id="contentToken"[\s\S]*?<\/div>/)?.[0];
    const input = block?.match(/<input\b([^>]*)>/)?.[1];
    if (input) { credential = attrs(input).value; credentialAt = now(); }
  }
  return { session, async load() {
    return cached('feb:classic:overview:v1', 15, async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (!credential || now() - credentialAt > 300000) {
          const page = await request('https://baloncestoenvivo.feb.es/', { signal: AbortSignal.timeout(4500) });
          if (!page.ok) throw new Error('FEB viewer unavailable');
          session(await page.text());
        }
        if (!credential) throw new Error('FEB viewer session unavailable');
        const response = await request(API, { headers: { Accept: 'application/json', Authorization: 'Bearer ' + credential }, signal: AbortSignal.timeout(4500) });
        if (response.status === 401 && !attempt) { credential = null; continue; }
        if (!response.ok) throw new Error('FEB live HTTP ' + response.status);
        const body = await response.json();
        if (!Array.isArray(body.OVERVIEW?.COMPETITIONS)) throw new Error('Invalid FEB live overview');
        return body.OVERVIEW.COMPETITIONS.flatMap(c => (c.GAMES || []).map(g => ({ ...g, sourceCompetition: c.id })));
      }
    }, 600);
  } };
}
function liveGame(raw, base, competition) {
  if (Number(raw.ID) !== base.idPartido || String(raw.sourceCompetition) !== String(raw.CompID) || raw.Competition !== (competition === 'LF' ? 'LF ENDESA' : 'TERCERA FEB')) return null;
  const sameTeam = (team, id, name) => team.classicId ? team.classicId === Number(id) : team.name.trim().replace(/\s+/g, ' ').toUpperCase() === String(name).trim().replace(/\s+/g, ' ').toUpperCase();
  if (!sameTeam(base.teamA, raw.TeamAID, raw.TeamA) || !sameTeam(base.teamB, raw.TeamBID, raw.TeamB)) return null;
  if (![raw.ScoreA, raw.ScoreB].every(n => Number.isInteger(n) && n >= 0 && n <= 999)) return null;
  const state = Number(raw.Status) === 3 ? 'final' : Number(raw.Status) === 2 ? 'live' : Number(raw.Status) === 1 ? 'upcoming' : null;
  if (!state || state === 'final' && raw.ScoreA === raw.ScoreB) return null;
  return { idPartido: base.idPartido, state, scoreA: raw.ScoreA, scoreB: raw.ScoreB, quarter: raw.Quarter, clock: raw.Time };
}
module.exports = { createClient, liveGame };
