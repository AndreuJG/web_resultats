const { reactData } = require('./official-html');
const { createSourceCache, getText, unwrapSnapshot } = require('./source-cache');
const { resultCacheSeconds, attachStandings } = require('./result-cache-policy');

const { createClient, eligible } = require('./fiba-live');
const { defaultRound, lastStartedRound, nextMatchAt } = require('./round-selection');
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' });
function sourceUrls(competition, now) {
  const d = new Date(now), year = d.getUTCFullYear() - (d.getUTCMonth() < 6 ? 1 : 0);
  const base = competition === 'BCL' ? 'https://www.championsleague.basketball/en' : `https://www.fiba.basketball/en/events/euroleague-women-${String(year).slice(-2)}-${String(year + 1).slice(-2)}`;
  return { gamesUrl: base + '/games', standingsUrl: base + '/standings' };
}
function utcDate(value) {
  if (!value || value.startsWith('0001-')) return null;
  const d = new Date(/[Zz]|[+-]\d\d:\d\d$/.test(value) ? value : value + 'Z');
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
function week(date) {
  const parts = Object.fromEntries(dayFormat.formatToParts(new Date(date)).map(x => [x.type, x.value]));
  const d = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}
function phaseName(name) {
  const path = /^(Semi-Finals?|Final) Path (\d+)$/.exec(name || '');
  if (path) return 'Fase prèvia · ' + (path[1] === 'Final' ? 'Final' : 'Semifinal') + ' · Camí ' + path[2];
  return ({ '1st Round': 'Primera fase', '2nd Round': 'Segona fase', 'First Round': 'Primera fase', 'Second Round': 'Segona fase', 'Group Phase': 'Fase de grups', '3rd Place Game': 'Tercer lloc', 'Regular Season - First Round': 'Primera fase', 'Regular Season - Second Round': 'Segona fase', 'Regular Season': 'Fase regular', 'Quarter-Finals': 'Quarts de final', 'Semi-Finals': 'Semifinals', 'Final': 'Final', 'Third Place Game': 'Tercer lloc', 'Semi-Final Play-In': 'Play-in de semifinals', 'Quarter-Final Play-In': 'Play-in de quarts de final' }[name] || name);
}
function elwSection(round) {
  const name = round.roundName;
  if (round.roundKind === 'Qualifiers' || / Path \d+$/.test(name || '')) return { id: 'qualifiers', label: 'Fase prèvia' };
  if (['First Round', '1st Round', 'Regular Season - First Round'].includes(name)) return { id: 'first', label: 'Primera fase · Grups A–D' };
  if (['Second Round', '2nd Round', 'Regular Season - Second Round'].includes(name)) return { id: 'second', label: 'Segona fase · Grups E–F' };
  if (['Semi-Final Play-In', 'Quarter-Final Play-In'].includes(name)) return { id: 'playin', label: 'Play-in' };
  if (['Quarter-Finals', 'Semi-Finals', 'Final', 'Third Place Game', '3rd Place Game'].includes(name)) return { id: 'finalsix', label: 'Final Six' };
  return { id: 'round-' + round.roundId, label: phaseName(name) };
}
function team(value, competition, national = false) {
  if (!value || !value.teamId) return { name: 'Pendent de classificació' };
  // Club codes confirmed by the official BCL draw/team lists. Never use venue country.
  const spanish = { ELW: ['ZARAG', 'VBC', 'GIR'], BCL: ['UCAM', 'UNI', 'SBB', 'AJB'] };
  const country = national ? value.code : spanish[competition]?.includes(value.code) ? 'ESP' : competition === 'BCL' && ['HOLO', 'HERZ'].includes(value.code) ? 'ISR' : undefined;
  const names = { ESP: 'Espanya', DEN: 'Dinamarca', GEO: 'Geòrgia', UKR: 'Ucraïna', GRE: 'Grècia', MNE: 'Montenegro', CZE: 'Txèquia', BUL: 'Bulgària', CRO: 'Croàcia', GER: 'Alemanya', JPN: 'Japó', AUS: 'Austràlia', USA: 'Estats Units' };
  return { name: national && names[value.code] || value.officialName || value.shortName, code: value.code, country };
}
function normalize(games, items, competition, selection, now, options = {}) {
  if (!games.length || games.some(g => g.competition?.competitionCode !== (options.sourceCode || competition))) throw new Error('Unexpected FIBA competition');
  const teams = new Map(), buckets = new Map();
  for (const g of games) {
    for (const t of [g.teamA, g.teamB]) if (t?.teamId) teams.set(t.teamId, team(t, competition, options.national));
    if (options.teamFilter && ![g.teamA?.code, g.teamB?.code].includes(options.teamFilter)) continue;
    const date = utcDate(g.gameDateTimeUTC), monday = date ? week(date) : null;
    const key = `${g.round.roundId}:${options.phaseOnly ? 'phase' : monday || 'pending'}`;
    if (!buckets.has(key)) {
      const section = competition === 'ELW' ? elwSection(g.round) : null;
      const name = (section?.id === 'finalsix' ? 'Final Six · ' : '') + phaseName(g.round.roundName);
      buckets.set(key, { phase: g.round.roundId, name, section, monday, games: [] });
    }
    const validScore = [g.teamAScore, g.teamBScore].every(n => Number.isInteger(n) && n >= 0);
    const final = [4, 5, 999].includes(g.liveGameStatus) || g.gameResultStatusCode === 'VALID';
    const state = g.isPostponed ? 'unavailable' : final && validScore ? 'final' : g.isLive === true && validScore ? 'live' : 'scheduled';
    const clock = [g.currentPeriod, g.chrono].filter(Boolean).join(' · ');
    const group = competition === 'ELW' && !['first', 'second'].includes(buckets.get(key).section.id) ? undefined : g.groupPairingCode;
    buckets.get(key).games.push({ code: g.gameId, date, timeUnknown: !g.hasTimeGameDateTime, group, home: team(g.teamA, competition, options.national), away: team(g.teamB, competition, options.national), score: ['live', 'final'].includes(state) ? [g.teamAScore, g.teamBScore] : null, state, label: g.isPostponed ? 'Ajornat' : state === 'final' ? 'Final' : state === 'live' ? 'En joc' + (clock ? ' · ' + clock : '') : 'Pendent' });
  }
  const groups = [...buckets.values()].sort((a, b) => (a.monday || '9999').localeCompare(b.monday || '9999') || a.phase - b.phase);
  groups.forEach((b, i) => { b.id = i + 1; b.label = options.phaseOnly ? b.name : b.name + ' · ' + (b.monday ? 'Setmana del ' + b.monday.slice(8) + '/' + b.monday.slice(5, 7) : 'Data per confirmar'); });
  if (!groups.length) throw new Error('No matches for selected team');
  const calendar = groups.map(b => ({ round: b.id, games: b.games }));
  const current = groups.find(b => b.id === (lastStartedRound(calendar, now) || calendar[0]).round);
  const chosen = groups.find(b => b.id === (selection == null ? defaultRound(calendar, now, competition).round : Number(selection)));
  if (!chosen) throw Object.assign(new Error('Unknown FIBA selection'), { status: 400 });
  const explicitPhase = options.national || competition === 'ELW' && selection != null;
  const phase = items?.find(item => item.roundIds?.includes(explicitPhase ? chosen.phase : current.phase));
  const hasTable = item => item?.data?.groups?.some(g => g.teamsStats?.some(t => teams.has(t.team)));
  const latestTable = groups.filter(b => b.id <= current.id).reverse().map(b => items?.find(item => item.roundIds?.includes(b.phase))).find(hasTable);
  let standingPhase = explicitPhase ? [phase].find(hasTable) : latestTable;
  // A future group's seed order is not a classification of played matches.
  if (competition === 'ELW' && explicitPhase && standingPhase && !standingPhase.data.groups.some(g => g.teamsStats?.some(t => t.gamesPlayed > 0))
    && !games.some(g => g.round.roundId === chosen.phase && (g.isLive || [4, 5, 999].includes(g.liveGameStatus) || Date.parse(utcDate(g.gameDateTimeUTC)) <= now))) standingPhase = undefined;
  const standings = standingPhase?.data?.groups?.map(group => ({ name: 'Grup ' + group.groupName, teams: (group.teamsStats || []).filter(t => teams.has(t.team)).map(t => ({ ...teams.get(t.team), position: t.rank, played: t.gamesPlayed, won: t.gamesWon, lost: t.gamesLost })).sort((a, b) => a.position - b.position) })).filter(g => g.teams.length && (!options.teamFilter || g.teams.some(t => t.code === options.teamFilter)));
  const data = { competition, season: 'F' + games[0].competition.start.slice(0, 4), round: chosen.id, rounds: groups.map(b => b.id), roundLabels: Object.fromEntries(groups.map(b => [b.id, b.label])), selectionLabel: 'Setmana / fase', roundLabel: chosen.label, games: chosen.games.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')), standings: standings?.length ? { value: standings, phase: standingPhase.standingHeaderName } : null, standingsNote: standingPhase?.standingHeaderName ? 'Classificació oficial actual · ' + phaseName(standingPhase.standingHeaderName) : undefined, currentRound: selection == null, nextMatchAt: selection == null ? nextMatchAt(groups.flatMap(b => b.games), now) : null, standingsMessage: phase && phase.type !== 'groups' ? 'Aquesta fase és eliminatòria i no té classificació de lliga.' : phase ? 'La classificació d’aquesta fase encara no està publicada.' : undefined };
  if (competition === 'ELW') {
    const sections = new Map();
    for (const b of groups) {
      if (!sections.has(b.section.id)) sections.set(b.section.id, { label: b.section.label, rounds: [] });
      sections.get(b.section.id).rounds.push(b.id);
    }
    data.roundSections = [...sections.values()];
    data.selectionLabel = 'Fase / setmana';
    data.standingsTitle = 'Classificació · ' + (standingPhase ? phaseName(standingPhase.standingHeaderName) : chosen.section.label);
    data.standingsNote = undefined;
    const latestRound = groups.filter(b => b.id <= current.id && latestTable?.roundIds?.includes(b.phase)).at(-1);
    if (!data.standings && latestRound && latestRound.phase !== chosen.phase) data.currentStandingsRound = latestRound.id;
  }
  return data;
}
function createService({ competition, request = fetch, cache, now = Date.now, defer } = {}) {
  const cached = createSourceCache(cache, now);
  const live = createClient({ request, cache, now });
  return async selection => {
    const urls = sourceUrls(competition, now());
    const [games, table] = await Promise.all([
      cached(`fiba:v3:${urls.gamesUrl}`, (value, at, time) => resultCacheSeconds(value.map(g => ({
        date: utcDate(g.gameDateTimeUTC), timeUnknown: !g.hasTimeGameDateTime,
        state: g.isPostponed ? 'unavailable' : [4, 5, 999].includes(g.liveGameStatus) || g.gameResultStatusCode === 'VALID' ? 'final' : g.isLive === true ? 'live' : 'scheduled'
      })), at, time), async () => {
        const value = reactData(await getText(urls.gamesUrl, request), x => x.event && Array.isArray(x.games), x => x.games);
        normalize(value, undefined, competition, null, now());
        return value;
      }, 2592000, { defer }),
      cached(`fiba:v3:${urls.standingsUrl}`, 60, async () => reactData(await getText(urls.standingsUrl, request), x => Array.isArray(x.items) && x.items.some(i => i.standingHeaderName), x => x.items), 2592000, { defer }).catch(() => null)
    ]);
    const data = unwrapSnapshot({ value: { ...normalize(games.value, table?.value, competition, selection, now()), ...urls }, at: games.at, stale: games.stale, refreshing: games.refreshing }, now());
    if (table) attachStandings(data, table, now());
    const sources = new Map(games.value.map(game => [game.gameId, game]));
    await Promise.all(data.games.map(async game => {
      const base = sources.get(game.code);
      if (!base || !eligible(base, now())) return;
      try {
        const snapshot = await live(base, urls.gamesUrl);
        if (snapshot.value) {
          Object.assign(game, snapshot.value, { checkedAt: snapshot.at, stale: snapshot.stale, refreshing: false });
          if (snapshot.stale) game.label = 'Dades antigues · ' + game.label.replace('En joc', 'Últim marcador');
          return;
        }
      } catch (error) { console.warn('FIBA live:', game.code, error.message); }
      // The HTML can be minutes behind. Never advertise that fallback as live.
      if (game.state === 'live') {
        game.stale = true;
        game.refreshing = false;
        game.label = 'Dades antigues · ' + game.label.replace('En joc', 'Últim marcador');
      }
    }));
    return data;
  };
}
module.exports = { createService, normalize, utcDate, sourceUrls };
