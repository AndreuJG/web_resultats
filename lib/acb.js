const { acbData } = require('./official-html');
const { createSourceCache, getText, unwrapSnapshot } = require('./source-cache');
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
  if (!roundInfo || !season || !matches.matches.length || table.selectedFilters.season !== season.id) throw new Error('Invalid ACB season/round');
  const teams = table.standings.map(t => {
    if (!t.team?.shortName || ![t.position, t.matchesPlayed, t.wins, t.losses].every(Number.isInteger) || t.wins + t.losses !== t.matchesPlayed) throw new Error('Invalid ACB standing');
    return { name: t.team.shortName, position: t.position, played: t.matchesPlayed, won: t.wins, lost: t.losses };
  });
  if (teams.length < 2) throw new Error('ACB standings missing');
  const tableRound = table.availableFilters.rounds.find(r => r.id === table.selectedFilters.round)?.roundNumber;
  return { competition: 'ACB', season: 'A' + season.startYear, round: roundInfo.roundNumber, rounds: filters.rounds.filter(r => r.roundNumber > 0).map(r => r.roundNumber), games: matches.matches.map(g => acbGame(g, now)).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)), standingsNote: 'Classificació oficial actual' + (tableRound ? ' · Jornada ' + tableRound : ''), standings: { value: [{ name: 'Lliga Endesa', teams: teams.sort((a, b) => a.position - b.position) }] } };
}

function createService({ cache, fetch: request = fetch, now = Date.now } = {}) {
  const cached = createSourceCache(cache, now);
  const page = async (url, type) => acbData(await getText(url, request), type);
  return async roundParam => {
    const snapshot = await cached('acb:round:' + (roundParam || 'current'), 20, async () => {
      const initial = await cached('acb:context', 300, () => page(BASE + 'partidos', 'matches'));
      const chosen = roundParam === null ? null : initial.value.availableFilters.rounds.find(r => r.roundNumber === Number(roundParam));
      if (roundParam !== null && !chosen) { const error = new Error('Unknown ACB round'); error.status = 400; throw error; }
      const [matches, table] = await Promise.all([page(BASE + 'partidos' + (chosen ? '?jornada=' + chosen.id : ''), 'matches'), page(BASE + 'clasificacion', 'standings')]);
      if (chosen && matches.selectedFilters.round !== chosen.id) throw new Error('ACB round selection ignored');
      return normalize(matches, table, now());
    });
    return unwrapSnapshot(snapshot, now());
  };
}

module.exports = { createService, normalize, acbGame };
