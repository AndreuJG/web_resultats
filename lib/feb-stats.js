const { createSourceCache, getText, unwrapSnapshot } = require('./source-cache');
const { madridDate } = require('./feb');
const API = 'https://intrafeb.feb.es/LiveStats.API/api/v1/BoxScore/';
const officialUrl = id => 'https://baloncestoenvivo.feb.es/partido/' + id;
const stat = value => value !== null && value !== undefined && /^[-+]?\d+(?:[,.]\d+)?$/.test(String(value).trim()) ? String(value).trim() : null;
function row(source) {
  return { name: String(source.name || '').trim(), no: stat(source.no), minutes: /^\d{1,3}:\d{2}$/.test(source.minFormatted || '') ? source.minFormatted : null,
    pts: stat(source.pts), rebounds: stat(source.rt), assists: stat(source.assist), valuation: stat(source.val), steals: stat(source.st), turnovers: stat(source.to), blocks: stat(source.bs), fouls: stat(source.pf), plusMinus: stat(source.pllss),
    shots: ['p2', 'p3', 'p1'].map(k => stat(source[k + 'm']) !== null && stat(source[k + 'a']) !== null ? stat(source[k + 'm']) + '/' + stat(source[k + 'a']) : null) };
}
function normalize(body, id) {
  const h = body?.HEADER;
  if (!h || !/TERCERA FEB/i.test(h.competition) || h.round?.replace(/["\s]/g, '') !== 'E-A' || !Array.isArray(h.TEAM) || h.TEAM.length !== 2 || !h.TEAM.some(t => t.clubCode === '460031' && /TABERNES BLANQUES/i.test(t.name))) {
    throw Object.assign(new Error('Not a Tabernes E-A match'), { status: 400 });
  }
  const statuses = String(h.statusText || '').toUpperCase();
  const final = statuses === 'FINISHED' || h.time === 'FINAL';
  const live = !final && (/^(?:LIVE|IN_PROGRESS|IN PROGRESS|INPROGRESS|PLAYING|STARTED)$/.test(statuses) || String(h.status) === '2');
  const scores = h.TEAM.map(t => stat(t.pts));
  const score = scores.every(s => s !== null && /^\d+$/.test(s)) && (live || final) ? scores.map(Number) : null;
  const state = score ? final ? 'final' : 'live' : live ? 'unavailable' : 'scheduled';
  const match = String(h.starttime || '').match(/^(\d{2})-(\d{2})-(\d{4})\s*-\s*(\d{2}:\d{2})/);
  const date = match ? madridDate(match[1] + '/' + match[2] + '/' + match[3], match[4]) : null;
  const teams = h.TEAM.map(t => {
    const details = body.BOXSCORE?.TEAM?.find(team => String(team.id) === String(t.id));
    if (details && details.name?.trim() !== t.name?.trim()) throw new Error('Stats team mismatch');
    const players = (details?.PLAYER || []).map(row);
    if (players.some(p => !p.name)) throw new Error('Missing player name');
    return { id: String(t.id), name: t.name.trim(), players, total: details?.TOTAL ? row(details.TOTAL) : null };
  });
  const clock = /^\d{1,2}:\d{2}$/.test(h.time || '') ? h.time : '';
  return { id: String(id), teams, quarters: (h.QUARTERS?.QUARTER || []).map(q => ({ n: String(q.n), score: [stat(q.scoreA), stat(q.scoreB)] })),
    games: [{ home: { name: teams[0].name }, away: { name: teams[1].name }, date, score, state, label: state === 'final' ? 'Final' : state === 'live' ? 'En joc' + (h.quarter ? ' · ' + h.quarter + 'Q' : '') + (clock ? ' · ' + clock : '') : 'Estadístiques pendents' }], officialUrl: officialUrl(id) };
}
function createService({ cache, request = fetch, now = Date.now } = {}) {
  const cached = createSourceCache(cache, now);
  // The FEB page provides this public viewer session credential. Keep it only
  // in memory, never in the response, persistent cache, logs or client HTML.
  let credential = null, credentialAt = 0;
  return async id => {
    if (!/^[1-9]\d{0,8}$/.test(String(id))) throw Object.assign(new Error('Invalid match ID'), { status: 400 });
    const snapshot = await cached('feb-stats:v1:' + id, 20, async () => {
      async function authorize() {
        const html = await getText(officialUrl(id), request);
        credential = html.match(/id="contentToken"[\s\S]*?<\/div>/)?.[0]?.match(/value="([^"]+)"/)?.[1];
        credentialAt = now();
        if (!credential) throw new Error('FEB public viewer session unavailable');
      }
      if (!credential || now() - credentialAt > 300000) await authorize();
      let response;
      for (let attempt = 0; attempt < 2; attempt++) {
        response = await request(API + id, { headers: { Accept: 'application/json', Authorization: 'Bearer ' + credential }, signal: AbortSignal.timeout(12000) });
        if (response.status !== 401 || attempt) break;
        await authorize();
      }
      if (!response.ok) throw new Error('FEB stats HTTP ' + response.status);
      return normalize(await response.json(), id);
    });
    return unwrapSnapshot(snapshot, now());
  };
}
module.exports = { createService, normalize, officialUrl };
