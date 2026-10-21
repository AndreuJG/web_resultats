const { reactData } = require('./official-html');
const { createSourceCache, getText, unwrapSnapshot } = require('./source-cache');
const { resultCacheSeconds, attachStandings } = require('./result-cache-policy');
const { selectPhase, filterGroups } = require('./phase-navigation');

const { createClient, eligible } = require('./fiba-live');
const { defaultRound, lastStartedRound, nextMatchAt } = require('./round-selection');
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' });
function sourceUrls(competition, now) {
  const d = new Date(now), year = d.getUTCFullYear() - (d.getUTCMonth() < 6 ? 1 : 0);
  const base = competition === 'BCL' ? 'https://www.championsleague.basketball/en' : `https://www.fiba.basketball/en/events/${competition === 'ECW' ? 'eurocup' : 'euroleague'}-women-${String(year).slice(-2)}-${String(year + 1).slice(-2)}`;
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
  return ({ '1st Round': 'Primera fase', '2nd Round': 'Segona fase', 'First Round': 'Primera fase', 'Second Round': 'Segona fase', 'Hosts': 'Amfitriones', 'Group Phase': 'Fase de grups', '3rd Place Game': 'Tercer lloc', 'Regular Season - First Round': 'Primera fase', 'Regular Season - Second Round': 'Segona fase', 'Regular Season': 'Fase regular', 'Quarter-Finals': 'Quarts de final', 'Semi-Finals': 'Semifinals', 'Final': 'Final', 'Third Place Game': 'Tercer lloc', 'Semi-Final Play-In': 'Play-in de semifinals', 'Quarter-Final Play-In': 'Play-in de quarts de final' }[name] || name);
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
function sectionFor(round, competition) {
  if (competition === 'ELW') {
    const section = elwSection(round);
    return { ...section, id: ({ qualifiers: 1, first: 2, second: 3, playin: 4, finalsix: 5 })[section.id] || round.roundId };
  }
  if (competition === 'ECW') return { id: round.roundId, label: ecwNames[round.roundName] || phaseName(round.roundName) };
  const known = { 'Regular Season': [1, 'Fase regular'], 'Play-ins': [2, 'Play-in'], 'Round of 16': [3, 'Top 16'], 'Quarter-Finals': [4, 'Quarts de final'], 'Semi-Finals': [5, 'Final Four'], '3rd Place Game': [5, 'Final Four'], Final: [5, 'Final Four'] }[round.roundName];
  return known ? { id: known[0], label: known[1] } : { id: round.roundId, label: phaseName(round.roundName) };
}
const ecwNames = { Qualifiers: 'Fase prèvia', 'Regular Season': 'Fase regular · Grups A–L', 'Play-Off Round 1': 'Primera eliminatòria', 'Round of 16': 'Octaus de final', 'Quarter-Finals': 'Quarts de final', 'Semi-Finals': 'Semifinals', Finals: 'Final' };
function ecwBucket(g) {
  const number = Number(g.gameNumber);
  if (g.round.roundName === 'Regular Season' && /^[A-L]$/.test(g.groupPairingCode || '') && Number.isInteger(number) && number >= 1 && number <= 12) {
    const day = Math.ceil(number / 2);
    return { key: 'day-' + day, order: day, label: 'Jornada ' + day };
  }
  if (g.round.roundName !== 'Regular Season' && ['A', 'B'].includes(g.gameNumber)) return { key: g.gameNumber, order: g.gameNumber === 'A' ? 1 : 2, label: g.gameNumber === 'A' ? 'Anada' : 'Tornada' };
  return null;
}
function ecwLabel(bucket) {
  const dates = [...new Set(bucket.games.filter(g => g.date).map(g => {
    const parts = Object.fromEntries(dayFormat.formatToParts(new Date(g.date)).map(p => [p.type, p.value]));
    return parts.year + '-' + parts.month + '-' + parts.day;
  }))].sort();
  const day = value => value.slice(8) + '/' + value.slice(5, 7);
  return bucket.name + ' · ' + bucket.slot.label + ' · ' + (dates.length ? day(dates[0]) + (dates.length > 1 ? ' – ' + day(dates.at(-1)) : '') : 'Data per confirmar');
}
function ecwSelectionGames(bucket) {
  if (!bucket.slot?.key.startsWith('day-') || bucket.games.some(g => g.state === 'live')) return bucket.games;
  const weeks = new Map();
  for (const g of bucket.games) if (g.date) {
    const key = week(g.date);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key).push(g);
  }
  // A few rearranged fixtures must not pin the default to a November round in
  // October, or retain October results until a lone postponed game in December.
  const main = [...weeks.values()].sort((a, b) => b.length - a.length)[0];
  return main?.length > bucket.games.length / 2 ? main : bucket.games;
}
function team(value, competition, national = false) {
  if (!value || !value.teamId) return { name: 'Pendent de classificació' };
  // Club codes confirmed by the official BCL draw/team lists. Never use venue country.
  const spanish = { ELW: ['ZARAG', 'VBC', 'GIR'], ECW: ['BAXI', 'DME', 'HGJ', 'CAB', 'MEINS', 'GIR', 'VBC', 'ZARAG'], BCL: ['UCAM', 'UNI', 'SBB', 'AJB'] };
  const israeli = { BCL: ['HOLO', 'HERZ'], ECW: ['ASHD', 'RML'] };
  const country = national ? value.code : spanish[competition]?.includes(value.code) ? 'ESP' : israeli[competition]?.includes(value.code) ? 'ISR' : undefined;
  const names = { ESP: 'Espanya', DEN: 'Dinamarca', GEO: 'Geòrgia', UKR: 'Ucraïna', GRE: 'Grècia', MNE: 'Montenegro', CZE: 'Txèquia', BUL: 'Bulgària', CRO: 'Croàcia', GER: 'Alemanya', JPN: 'Japó', AUS: 'Austràlia', USA: 'Estats Units', FRA: 'França', ITA: 'Itàlia', LTU: 'Lituània', LAT: 'Letònia', BEL: 'Bèlgica', BIH: 'Bòsnia i Hercegovina', GBR: 'Gran Bretanya', NED: 'Països Baixos', CYP: 'Xipre', ROU: 'Romania', SUI: 'Suïssa', ISR: 'Israel', SRB: 'Sèrbia', POR: 'Portugal', TUR: 'Turquia', HUN: 'Hongria', FIN: 'Finlàndia', POL: 'Polònia', AUT: 'Àustria', ISL: 'Islàndia', SLO: 'Eslovènia', SVK: 'Eslovàquia', NOR: 'Noruega', LUX: 'Luxemburg', AZE: 'Azerbaidjan', ARM: 'Armènia', IRL: 'Irlanda', KOS: 'Kosovo', MKD: 'Macedònia del Nord', EST: 'Estònia', SWE: 'Suècia' };
  return { name: national && names[value.code] || competition === 'ECW' && value.shortName || value.officialName || value.shortName, code: value.code, country };
}
function normalize(games, items, competition, selection, now, options = {}) {
  if (!games.length || games.some(g => g.competition?.competitionCode !== (options.sourceCode || competition))) throw new Error('Unexpected FIBA competition');
  if (competition === 'ECW') {
    const d = new Date(now), season = d.getUTCFullYear() + (d.getUTCMonth() >= 6 ? 1 : 0);
    if (games.some(g => g.competition.gender !== 'Women' || g.competition.competitionType !== 'Clubs' || g.competition.season !== season)) throw new Error('Unexpected EuroCup Women edition');
  }
  const teams = new Map(), buckets = new Map();
  for (const g of games) {
    for (const t of [g.teamA, g.teamB]) if (t?.teamId) teams.set(t.teamId, team(t, competition, options.national));
    if (options.teamFilter && ![g.teamA?.code, g.teamB?.code].includes(options.teamFilter)) continue;
    const date = utcDate(g.gameDateTimeUTC), monday = date ? week(date) : null;
    const slot = competition === 'ECW' ? ecwBucket(g) : null;
    const key = `${g.round.roundId}:${options.phaseOnly ? 'phase' : slot?.key || monday || 'pending'}`;
    if (!buckets.has(key)) {
      const section = competition === 'ELW' ? elwSection(g.round) : competition === 'ECW' ? { id: g.round.roundId, label: ecwNames[g.round.roundName] || phaseName(g.round.roundName) } : null;
      const name = (section?.id === 'finalsix' ? 'Final Six · ' : '') + (competition === 'ECW' ? ecwNames[g.round.roundName] || phaseName(g.round.roundName) : phaseName(g.round.roundName));
      buckets.set(key, { phase: g.round.roundId, phaseOrder: g.round.roundOrder || g.round.roundNumber || g.round.roundId, slot, name, section, navigationSection: options.phaseControls ? sectionFor(g.round, competition) : null, monday, games: [] });
    }
    const validScore = [g.teamAScore, g.teamBScore].every(n => Number.isInteger(n) && n >= 0);
    const final = [4, 5, 999].includes(g.liveGameStatus) || g.gameResultStatusCode === 'VALID';
    const state = g.isPostponed ? 'unavailable' : final && validScore ? 'final' : g.isLive === true && validScore ? 'live' : 'scheduled';
    const clock = [g.currentPeriod, g.chrono].filter(Boolean).join(' · ');
    const group = competition === 'ELW' && !['first', 'second'].includes(buckets.get(key).section.id) || competition === 'ECW' && g.round.roundName !== 'Regular Season'
      || options.phaseControls && competition === 'BCL' && !['Regular Season', 'Round of 16'].includes(g.round.roundName) ? undefined : g.groupPairingCode;
    buckets.get(key).games.push({ code: g.gameId, date, timeUnknown: !g.hasTimeGameDateTime, group, home: team(g.teamA, competition, options.national), away: team(g.teamB, competition, options.national), score: ['live', 'final'].includes(state) ? [g.teamAScore, g.teamBScore] : null, state, label: g.isPostponed ? 'Ajornat' : state === 'final' ? 'Final' : state === 'live' ? 'En joc' + (clock ? ' · ' + clock : '') : 'Pendent' });
  }
  const groups = [...buckets.values()].sort((a, b) => competition === 'ECW'
    ? a.phaseOrder - b.phaseOrder || (a.slot?.order || 99) - (b.slot?.order || 99) || (a.monday || '9999').localeCompare(b.monday || '9999')
    : (a.monday || '9999').localeCompare(b.monday || '9999') || a.phase - b.phase);
  groups.forEach((b, i) => { b.id = i + 1; b.label = options.phaseOnly ? b.name : competition === 'ECW' && b.slot ? ecwLabel(b) : b.name + ' · ' + (b.monday ? 'Setmana del ' + b.monday.slice(8) + '/' + b.monday.slice(5, 7) : 'Data per confirmar'); });
  if (!groups.length) throw new Error('No matches for selected team');
  const calendar = groups.map(b => ({ round: b.id, games: competition === 'ECW' ? ecwSelectionGames(b) : b.games }));
  const sections = new Map();
  if (options.phaseControls) for (const b of groups) {
    const s = b.navigationSection;
    if (!sections.has(s.id)) sections.set(s.id, { ...s, rounds: [] });
    sections.get(s.id).rounds.push(b.id);
  }
  const navigation = options.phaseControls ? selectPhase([...sections.values()].sort((a, b) => a.id - b.id), calendar, selection, options.phaseParam, now, competition) : null;
  const current = groups.find(b => b.id === (lastStartedRound(calendar, now) || calendar[0]).round);
  const chosen = groups.find(b => b.id === (navigation ? navigation.round : selection == null ? defaultRound(calendar, now, competition).round : Number(selection)));
  if (!chosen) throw Object.assign(new Error('Unknown FIBA selection'), { status: 400 });
  const explicitPhase = options.national || options.phaseControls || ['ELW', 'ECW'].includes(competition) && selection != null;
  const phase = items?.find(item => item.roundIds?.includes(explicitPhase ? chosen.phase : current.phase));
  const hasTable = item => item?.data?.groups?.some(g => g.teamsStats?.some(t => teams.has(t.team)));
  const latestTable = groups.filter(b => b.id <= current.id).reverse().map(b => items?.find(item => item.roundIds?.includes(b.phase))).find(hasTable);
  let standingPhase = explicitPhase ? [phase].find(hasTable) : latestTable;
  // A future group's seed order is not a classification of played matches.
  if ((['ELW', 'ECW'].includes(competition) || options.phaseControls) && explicitPhase && standingPhase && !standingPhase.data.groups.some(g => g.teamsStats?.some(t => t.gamesPlayed > 0))
    && !games.some(g => g.round.roundId === chosen.phase && (g.isLive || [4, 5, 999].includes(g.liveGameStatus) || Date.parse(utcDate(g.gameDateTimeUTC)) <= now))) standingPhase = undefined;
  const standings = standingPhase?.data?.groups?.map(group => ({ name: 'Grup ' + group.groupName, teams: (group.teamsStats || []).filter(t => teams.has(t.team)).map(t => ({ ...teams.get(t.team), position: t.rank, played: t.gamesPlayed, won: t.gamesWon, lost: t.gamesLost })).sort((a, b) => a.position - b.position) })).filter(g => g.teams.length && (!options.teamFilter || g.teams.some(t => t.code === options.teamFilter)));
  const data = { competition, season: 'F' + games[0].competition.start.slice(0, 4), round: chosen.id, rounds: groups.map(b => b.id), roundLabels: Object.fromEntries(groups.map(b => [b.id, b.label])), selectionLabel: 'Setmana / fase', roundLabel: chosen.label, games: chosen.games.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')), standings: standings?.length ? { value: standings, phase: standingPhase.standingHeaderName } : null, standingsNote: standingPhase?.standingHeaderName ? 'Classificació oficial actual · ' + phaseName(standingPhase.standingHeaderName) : undefined, currentRound: selection == null, nextMatchAt: selection == null ? nextMatchAt(groups.flatMap(b => b.games), now) : null, standingsMessage: phase && phase.type !== 'groups' ? 'Aquesta fase és eliminatòria i no té classificació de lliga.' : phase ? 'La classificació d’aquesta fase encara no està publicada.' : undefined };
  if (['ELW', 'ECW'].includes(competition)) {
    const sections = new Map();
    for (const b of groups) {
      if (!sections.has(b.section.id)) sections.set(b.section.id, { label: b.section.label, rounds: [] });
      sections.get(b.section.id).rounds.push(b.id);
    }
    data.roundSections = [...sections.values()];
    data.selectionLabel = competition === 'ECW' ? 'Fase / jornada' : 'Fase / setmana';
    data.standingsTitle = 'Classificació · ' + (standingPhase ? competition === 'ECW' ? ecwNames[standingPhase.standingHeaderName] || phaseName(standingPhase.standingHeaderName) : phaseName(standingPhase.standingHeaderName) : chosen.section.label);
    data.standingsNote = undefined;
    const latestRound = groups.filter(b => b.id <= current.id && latestTable?.roundIds?.includes(b.phase)).at(-1);
    if (!data.standings && latestRound && latestRound.phase !== chosen.phase) data.currentStandingsRound = latestRound.id;
  }
  if (navigation) {
    Object.assign(data, navigation);
    data.selectionLabel = competition === 'ECW' ? 'Jornada / partit' : 'Setmana / partit';
    data.roundLabels = Object.fromEntries(groups.map(b => [b.id, ['first', 'second'].includes(b.section?.id) || competition === 'ECW' || competition === 'BCL' && ['Fase regular', 'Top 16'].includes(b.navigationSection.label)
      ? b.label.slice(b.name.length + 3) : b.label.replace(/^Final Six · /, '')]));
    data.nextMatchAt = selection == null ? nextMatchAt(groups.filter(b => navigation.phaseAutomatic || b.navigationSection.id === navigation.phase).flatMap(b => b.games), now) : null;
    data.standingsTitle = 'Classificació · ' + navigation.phaseLabel;
    data.standingsNote = undefined;
    const latestRound = groups.filter(b => b.id <= current.id && latestTable?.roundIds?.includes(b.phase)).at(-1);
    if (!data.standings && latestRound && latestRound.phase !== chosen.phase) data.currentStandingsRound = latestRound.id;
    filterGroups(data, groups.filter(b => b.navigationSection.id === navigation.phase).flatMap(b => b.games), options.groupParam);
  }
  return data;
}
function createService({ competition, request = fetch, cache, now = Date.now, defer } = {}) {
  const cached = createSourceCache(cache, now);
  const live = createClient({ request, cache, now });
  return async (selection, groupParam, phaseParam) => {
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
    const data = unwrapSnapshot({ value: { ...normalize(games.value, table?.value, competition, selection, now(), { phaseControls: true, phaseParam, groupParam }), ...urls }, at: games.at, stale: games.stale, refreshing: games.refreshing }, now());
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
