const { reactData } = require('./official-html');
const { createSourceCache, getText, unwrapSnapshot } = require('./source-cache');
const { normalize, utcDate } = require('./fiba');
const { defaultRound, nextMatchAt } = require('./round-selection');
const { resultCacheSeconds, attachStandings } = require('./result-cache-policy');
const events = {
  ESM: [{ slug: 'fiba-basketball-world-cup-2027-european-qualifiers', code: 'WCQ-EUR', gender: 'Men', year: 2027, label: 'Classificació al Mundial 2027 · Europa' }],
  ESW: [{ slug: 'fiba-womens-eurobasket-2027-qualifiers', code: 'EMSW-Q', gender: 'Women', year: 2027, label: 'Classificació a l’EuroBasket 2027' }]
};
function validate(games, definition) {
  if (!games.length || games.some(g => g.competition?.gender !== definition.gender || g.competition?.competitionCode !== definition.code
    || g.competition?.competitionType !== 'National Teams' || g.competition?.season !== definition.year)) throw new Error('Invalid national event');
}
function build(sources, competition, selection, now, groupParam) {
  const views = [];
  for (const source of sources) {
    const { games, items } = source.value;
    const definition = source.definition;
    if (!events[competition]?.some(e => e.slug === definition.slug && e.code === definition.code && e.gender === definition.gender && e.year === definition.year)) throw new Error('Invalid national event');
    validate(games, definition);
    const options = { sourceCode: definition.code, national: true, phaseOnly: true };
    const first = normalize(games, items, competition, null, now, options);
    for (const round of first.rounds) {
      const data = round === first.round ? first : normalize(games, items, competition, round, now, options);
      const label = data.roundLabel + (data.games.some(g => [g.home.code, g.away.code].includes('ESP')) ? ' · Espanya' : '');
      views.push({ ...data, nationalEvent: definition.slug, eventSeason: 2027, seasonLabel: definition.label, label, sourceAt: source.at, sourceStale: source.stale,
        gamesUrl: `https://www.fiba.basketball/en/events/${definition.slug}/games`, standingsUrl: `https://www.fiba.basketball/en/events/${definition.slug}/standings`, standingsTitle: 'Classificació · ' + data.roundLabel, standingsNote: undefined });
    }
  }
  // Hosts' parallel exhibition schedule must not pin the qualifying phase.
  const automatic = defaultRound(views.map((view, index) => ({ round: index + 1, games: view.games, hosts: view.roundLabel === 'Amfitriones' })).filter(v => !v.hosts), now, competition);
  const selected = views[(selection == null ? automatic?.round : Number(selection)) - 1];
  if (!selected) throw Object.assign(new Error('National selection not found'), { status: 400 });
  const codes = [...new Set([...selected.games.map(g => g.group), ...(selected.standings?.value || []).map(g => g.name.replace(/^Grup /, ''))])].filter(c => /^[A-Z]$/.test(c || '')).sort();
  const availableGroups = codes.map(code => ({ code, spain: selected.games.some(g => g.group === code && [g.home.code, g.away.code].includes('ESP')) || selected.standings?.value.some(g => g.name === 'Grup ' + code && g.teams.some(t => t.code === 'ESP')) === true }));
  const selectedGroup = availableGroups.some(g => g.code === groupParam) ? groupParam : null;
  const data = { ...selected, round: views.indexOf(selected) + 1, rounds: views.map((_, i) => i + 1), roundLabels: Object.fromEntries(views.map((v, i) => [i + 1, v.label])), selectionLabel: 'Fase', availableGroups, selectedGroup, currentRound: selection == null, nextMatchAt: selection == null ? nextMatchAt(views.flatMap(v => v.games), now) : null };
  if (selectedGroup) {
    data.games = data.games.filter(g => g.group === selectedGroup);
    if (data.standings) data.standings = { ...data.standings, value: data.standings.value.filter(g => g.name === 'Grup ' + selectedGroup) };
  }
  return data;
}
function createService({ competition, cache, request = fetch, now = Date.now, defer } = {}) {
  if (!events[competition]) throw new Error('Unknown national selection');
  const cached = createSourceCache(cache, now);
  return async (selection, group) => {
    // All group views share the same sources; scores and tables age independently.
    const sources = await Promise.all(events[competition].map(async definition => {
      const base = 'https://www.fiba.basketball/en/events/' + definition.slug;
      const [games, table] = await Promise.all([
        cached('national:games:v2:' + definition.slug, (value, at, time) => resultCacheSeconds(value.map(g => ({
          date: utcDate(g.gameDateTimeUTC), timeUnknown: !g.hasTimeGameDateTime,
          state: g.isPostponed ? 'unavailable' : [4, 5, 999].includes(g.liveGameStatus) || g.gameResultStatusCode === 'VALID' ? 'final' : g.isLive ? 'live' : 'scheduled'
        })), at, time), async () => {
          const value = reactData(await getText(base + '/games', request), x => x.event && Array.isArray(x.games), x => x.games);
          validate(value, definition);
          return value;
        }, 2592000, { defer }),
        cached('national:standings:v2:' + definition.slug, 60, async () => reactData(await getText(base + '/standings', request), x => Array.isArray(x.items) && x.items.some(i => i.standingHeaderName), x => x.items), 2592000, { defer }).catch(() => null)
      ]);
      return { ...games, value: { games: games.value, items: table?.value }, definition, table };
    }));
    const data = build(sources, competition, selection, now(), group);
    const selectedSource = sources.find(s => s.definition.slug === data.nationalEvent);
    const result = unwrapSnapshot({ value: data, at: data.sourceAt, stale: data.sourceStale, refreshing: selectedSource.refreshing }, now());
    if (selectedSource.table) attachStandings(result, selectedSource.table, now());
    return result;
  };
}
module.exports = { events, build, createService };
