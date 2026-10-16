const { reactData } = require('./official-html');
const { createSourceCache, getText, unwrapSnapshot } = require('./source-cache');
const { normalize } = require('./fiba');
const events = {
  ESM: [{ slug: 'fiba-basketball-world-cup-2027-european-qualifiers', code: 'WCQ-EUR', gender: 'Men', label: 'Classificació al Mundial 2027' }],
  ESW: [
    { slug: 'fiba-womens-basketball-world-cup-2026', code: 'WMW', gender: 'Women', label: 'Mundial 2026' },
    { slug: 'fiba-womens-eurobasket-2027-qualifiers', code: 'EMSW-Q', gender: 'Women', label: 'Classificació a l’EuroBasket 2027' }
  ]
};
function build(sources, competition, selection, now) {
  const views = [];
  for (const source of sources) {
    const { games, items } = source.value;
    const definition = source.definition;
    if (!games.length || games.some(g => g.competition?.gender !== definition.gender || g.competition?.competitionType !== 'National Teams')) throw new Error('Invalid national event');
    const options = { sourceCode: definition.code, national: true, teamFilter: 'ESP', phaseOnly: true };
    const first = normalize(games, items, competition, null, now, options);
    for (const round of first.rounds) {
      const data = round === first.round ? first : normalize(games, items, competition, round, now, options);
      const label = definition.label + ' · ' + data.roundLabel;
      views.push({ ...data, seasonLabel: definition.label, label, sourceAt: source.at, sourceStale: source.stale,
        gamesUrl: `https://www.fiba.basketball/en/events/${definition.slug}/games`, standingsUrl: `https://www.fiba.basketball/en/events/${definition.slug}/standings`, standingsNote: data.roundLabel });
    }
  }
  const live = views.find(v => v.games.some(g => g.state === 'live'));
  const next = views.flatMap(v => v.games.filter(g => g.date && Date.parse(g.date) >= now).map(g => ({ view: v, date: Date.parse(g.date) }))).sort((a, b) => a.date - b.date)[0]?.view;
  const recent = views.flatMap(v => v.games.filter(g => g.date).map(g => ({ view: v, date: Date.parse(g.date) }))).sort((a, b) => b.date - a.date)[0]?.view;
  const selected = selection == null ? live || next || recent : views[Number(selection) - 1];
  if (!selected) throw Object.assign(new Error('National selection not found'), { status: 400 });
  return { ...selected, round: views.indexOf(selected) + 1, rounds: views.map((_, i) => i + 1), roundLabels: Object.fromEntries(views.map((v, i) => [i + 1, v.label])), selectionLabel: 'Competició / fase' };
}
function createService({ competition, cache, request = fetch, now = Date.now } = {}) {
  if (!events[competition]) throw new Error('Unknown national selection');
  const cached = createSourceCache(cache, now);
  return async selection => {
    const snapshot = await cached(`national:v1:${competition}:${selection || 'current'}`, 20, async () => {
      const sources = await Promise.all(events[competition].map(async definition => {
        const entry = await cached('national:source:v1:' + definition.slug, 20, async () => {
          const base = 'https://www.fiba.basketball/en/events/' + definition.slug;
          const [html, table] = await Promise.all([getText(base + '/games', request), getText(base + '/standings', request).catch(() => null)]);
          const games = reactData(html, x => x.event && Array.isArray(x.games), x => x.games);
          let items;
          if (table) { try { items = reactData(table, x => Array.isArray(x.items) && x.items.some(i => i.standingHeaderName), x => x.items); } catch { /* Keep results available. */ } }
          return { games, items };
        });
        return { ...entry, definition };
      }));
      return build(sources, competition, selection, now());
    });
    return unwrapSnapshot({ ...snapshot, at: snapshot.value.sourceAt, stale: snapshot.stale || snapshot.value.sourceStale }, now());
  };
}
module.exports = { events, build, createService };
