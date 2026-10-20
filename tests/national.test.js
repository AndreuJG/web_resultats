const test = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('../lib/national');
const { render } = require('../lib/euroleague-page');
const tv = require('../lib/tv');
const now = Date.parse('2026-10-16T12:00:00Z');
const spain = { teamId: 1, code: 'ESP', officialName: 'Spain' };
const greece = { teamId: 2, code: 'GRE', officialName: 'Greece' };
const france = { teamId: 3, code: 'FRA', officialName: 'France' };
const germany = { teamId: 4, code: 'GER', officialName: 'Germany' };
function match(phase, date, home = spain, away = greece, code = 'WCQ-EUR', gender = 'Men') {
  return { gameId: phase, round: { roundId: phase, roundName: phase === 1 ? '1st Round' : '2nd Round' }, gameDateTimeUTC: date, hasTimeGameDateTime: true, teamA: home, teamB: away, competition: { competitionCode: code, start: '2025-11-01', gender, competitionType: 'National Teams' }, gameResultStatusCode: 'EMPTY', isLive: false, teamAScore: 0, teamBScore: 0 };
}
const group = (name, ids) => ({ groupName: name, teamsStats: ids.map((team, i) => ({ team, rank: i + 1, gamesPlayed: 0, gamesWon: 0, gamesLost: 0 })) });
function source(games, code = 'WCQ-EUR', gender = 'Men', label = 'Classificació Mundial 2027') {
  return { definition: { code, gender, label, slug: 'official-event' }, at: now, stale: false, value: { games, items: [
    { type: 'groups', roundIds: [1], data: { groups: [group('A', [1, 2]), group('OTHER', [3, 4])] } },
    { type: 'groups', roundIds: [2], data: { groups: [group('I', [1, 2]), group('OTHER', [3, 4])] } }
  ] } };
}
test('national pages contain only Spain fixtures and its full group for the selected phase', () => {
  const data = build([source([match(1, '2026-07-01T18:00:00'), match(2, '2026-11-26T18:00:00'), match(2, '2026-11-26T18:00:00', france, germany)])], 'ESM', null, now);
  assert.equal(data.games.length, 1);
  assert.equal(data.round, 2);
  assert.equal(data.standings.value.length, 1);
  assert.equal(data.standings.value[0].name, 'Grup I');
  assert.equal(data.standings.value[0].teams.length, 2);
  assert.equal(data.games[0].home.name, 'Espanya');
  data.generatedAt = now; data.standings.at = now;
  const html = render(data);
  assert.match(html, /<strong>Espanya<\/strong>/);
  assert.doesNotMatch(html, /Temporada 2025–2026|Grup OTHER/);
});
test('women world cup history and qualifiers stay separate; gender and source code are validated', () => {
  const past = source([match(1, '2026-09-04T18:00:00', spain, germany, 'WMW', 'Women')], 'WMW', 'Women', 'Mundial 2026');
  const future = source([match(2, '2026-11-10T18:00:00', spain, france, 'EMSW-Q', 'Women')], 'EMSW-Q', 'Women', 'EuroBasket 2027');
  assert.equal(build([past, future], 'ESW', null, now).seasonLabel, 'EuroBasket 2027');
  assert.equal(build([past, future], 'ESW', 1, now).seasonLabel, 'Mundial 2026');
  assert.throws(() => build([{ ...past, definition: { ...past.definition, gender: 'Men' } }], 'ESM', null, now), /Invalid national/);
  assert.throws(() => build([{ ...past, definition: { ...past.definition, code: 'WRONG' } }], 'ESW', null, now), /Unexpected FIBA/);
});
test('TV recognises Spain selection announcements without mixing women and men or other national teams', () => {
  assert.equal(tv.competition('Clasificación Mundial 2027: España - Grecia'), 'ESM');
  assert.equal(tv.competition('EuroBasket femenino 2027: España - Bulgaria'), 'ESW');
  assert.equal(tv.competition('Amistoso selección española: España - Francia'), 'NATIONAL');
  assert.equal(tv.competition('Euroliga femenina Valencia - Basket'), 'ELW');
  const event = { date: '2026-10-17T18:00:00Z', competition: 'ESW', title: 'España - Bulgaria', source: 'https://www.movistarplus.es', channels: [] };
  assert.equal(tv.mergeEvents([event, { ...event, title: 'Francia - Bulgaria' }], now).length, 1);
});
test('Manu Aroca is bold in simple and detailed statistics without highlighting other Aroca players', () => {
  const { normalize } = require('../lib/feb-stats');
  const body = { HEADER: { competition: 'TERCERA FEB', round: 'E-A', time: 'FINAL', statusText: 'FINISHED', TEAM: [{ id: '1', clubCode: '460031', name: 'CB TABERNES BLANQUES', pts: '72' }, { id: '2', name: 'Club B', pts: '83' }] }, BOXSCORE: { TEAM: [{ id: '1', name: 'CB TABERNES BLANQUES', PLAYER: [{ id: '1467686', name: 'M. AROCA RUBIO' }, { id: '999', name: 'J. AROCA RUBIO' }] }] } };
  const data = normalize(body, '123'); data.generatedAt = now;
  for (const detail of [false, true]) {
    const html = require('../lib/feb-stats-page').render(data, { detail });
    assert.match(html, /<strong>M\. AROCA RUBIO<\/strong>/);
    assert.doesNotMatch(html, /<strong>J\. AROCA RUBIO<\/strong>/);
  }
});


test('national default retains the played phase the following day before advancing to the next fixtures', () => {
  const played = { ...match(1, '2026-10-18T18:00:00'), gameResultStatusCode: 'VALID', teamAScore: 80, teamBScore: 70 };
  const next = match(2, '2026-11-26T18:00:00');
  const data = [source([played, next])];
  assert.equal(build(data, 'ESM', null, Date.parse('2026-10-19T12:00:00Z')).round, 1);
  assert.equal(build(data, 'ESM', null, Date.parse('2026-10-20T12:00:00Z')).round, 2);
});
