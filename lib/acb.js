const { acbData } = require('./official-html');
const { createSourceCache, getText, unwrapSnapshot } = require('./source-cache');
const { resultCacheSeconds, attachStandings } = require('./result-cache-policy');
const BASE = 'https://www.acb.com/es/liga/';

function acbGame(g, now = Date.now()) {
  if (!g.homeTeam?.shortName || !g.awayTeam?.shortName || !Number.isFinite(Date.parse(g.startDateTime))) throw new Error('Invalid ACB match');
  const state = g.matchStatus === 'FINALIZED' ? 'final' : ['IN_PROGRESS', 'LIVE', 'PLAYING', 'STARTED'].includes(g.matchStatus) ? 'live' : g.matchStatus === 'NOT_STARTED' && Date.parse(g.startDateTime) > now ? 'scheduled' : 'unavailable';
  const score = ['live', 'final'].includes(state) && [g.homeScore, g.awayScore].every(x => Number.isInteger(x) && x >= 0) ? [g.homeScore, g.awayScore] : null;
  if (['live', 'final'].includes(state) && !score) throw new Error('Invalid ACB score');
  return { code: g.id, date: g.startDateTime, home: { name: g.homeTeam.shortName }, away: { name: g.awayTeam.shortName }, score, state, stale: false, label: state === 'final' ? 'Final' : state === 'live' ? 'En joc' + (g.isOnHalfTime ? ' · Descans' : g.currentQuarter ? ' · ' + g.currentQuarter + 'Q' : '') : state === 'scheduled' ? 'Pendent' : 'Marcador no disponible' };
}

function normalize(matches, table, now = Date.now()) {
  const filters = matches.availableFilters;
  const roundInfo = filters.rounds.find(r => r.id === matches.selectedFilters.round);
  const season = filters.seasons.find(s => s.id === matches.selectedFilters.season);
  if (!roundInfo || !season || !matches.matches.length || table && table.selectedFilters.season !== season.id) throw new Error('Invalid ACB season/round');
  const teams = (table?.standings || []).map(t => {
    if (!t.team?.shortName || ![t.position, t.matchesPlayed, t.wins, t.losses].every(Number.isInteger) || t.wins + t.losses !== t.matchesPlayed) throw new Error('Invalid ACB standing');
    return { name: t.team.shortName, position: t.position, played: t.matchesPlayed, won: t.wins, lost: t.losses };
  });
  if (table && teams.length < 2) throw new Error('ACB standings missing');
  const tableRound = table?.availableFilters.rounds.find(r => r.id === table.selectedFilters.round)?.roundNumber;
  return { competition: 'ACB', season: 'A' + season.startYear, round: roundInfo.roundNumber, rounds: filters.rounds.filter(r => r.roundNumber > 0).map(r => r.roundNumber), games: matches.matches.map(g => acbGame(g, now)).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)), standingsNote: table ? 'Classificació oficial actual' + (tableRound ? ' · Jornada ' + tableRound : '') : undefined, standings: table ? { value: [{ name: 'Lliga Endesa', teams: teams.sort((a, b) => a.position - b.position) }] } : null };
}

function createService({ cache, fetch: request = fetch, now = Date.now, defer } = {}) {
  const cached = createSourceCache(cache, now);
  const page = async (url, type) => acbData(await getText(url, request), type);
  return async roundParam => {
    const initial = await cached('acb:v2:context', 300, () => page(BASE + 'partidos', 'matches'), 2592000, { defer });
    const season = initial.value.selectedFilters.season;
    const chosen = roundParam === null ? null : initial.value.availableFilters.rounds.find(r => r.roundNumber === Number(roundParam));
    if (roundParam !== null && !chosen) throw Object.assign(new Error('Unknown ACB round'), { status: 400 });
    const [matches, table] = await Promise.all([
      cached('acb:v2:games:' + season + ':' + (chosen?.id || 'current'),
        (value, at, time) => resultCacheSeconds(value.matches.map(g => acbGame(g, time)), at, time, chosen ? 86400 : 60),
        async () => {
          const value = !chosen && !initial.stale && now() - initial.at < 20000 ? initial.value : await page(BASE + 'partidos' + (chosen ? '?jornada=' + chosen.id : ''), 'matches');
          if (value.selectedFilters.season !== season || chosen && value.selectedFilters.round !== chosen.id || !value.matches.length) throw new Error('ACB selection ignored');
          value.matches.forEach(g => acbGame(g, now()));
          return value;
        }, 2592000, { defer }),
      cached('acb:v2:standings:' + season, 60, async () => {
        const value = await page(BASE + 'clasificacion', 'standings');
        normalize(initial.value, value, now());
        return value;
      }, 2592000, { defer }).catch(() => null)
    ]);
    const data = unwrapSnapshot({ value: normalize(matches.value, table?.value, now()), at: matches.at, stale: matches.stale, refreshing: matches.refreshing }, now());
    return table ? attachStandings(data, table, now()) : data;
  };
}

module.exports = { createService, normalize, acbGame };
