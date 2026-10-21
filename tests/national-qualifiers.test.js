const test = require('node:test');
const assert = require('node:assert/strict');
const { build, events, createService } = require('../lib/national');
const { zonesFor } = require('../lib/standings-zones');
const { render } = require('../lib/euroleague-page');
const now = Date.parse('2026-10-21T12:00:00Z');
const codes = ['ESP', 'GRE', 'FRA', 'GER', 'ITA', 'POR', 'FIN', 'SWE', 'BEL', 'LTU', 'UKR', 'DEN', 'IRL', 'POL', 'SVK', 'CYP', 'ISL', 'CZE', 'HUN', 'TUR'];
const teams = Object.fromEntries(codes.map((code, i) => [code, { teamId: i + 1, code, officialName: code === 'ESP' ? 'Spain' : code }]));
const html = value => '<script>self.__next_f.push(' + JSON.stringify([1, 'a:' + JSON.stringify(value) + '\n']) + ')</script>';
function fixture(competition) {
  const definition = events[competition][0];
  const phases = competition === 'ESM' ? [
    ['1st Round', '2026-07-05T17:00:00', { A: ['ESP', 'GRE', 'FRA', 'GER'], B: ['ITA', 'POR', 'FIN', 'SWE'] }],
    ['2nd Round', '2026-11-26T17:00:00', { I: ['ESP', 'GRE', 'FRA', 'GER', 'ITA', 'POR'], J: ['FIN', 'SWE', 'BEL', 'LTU', 'UKR', 'DEN'] }]
  ] : [
    ['First Round', '2025-11-09T17:00:00', { A: ['GRE', 'IRL', 'POL', 'SVK'], G: ['POR', 'CYP', 'ISL'] }],
    ['Hosts', '2025-11-12T17:00:00', { H: ['BEL', 'FIN', 'LTU', 'SWE'] }],
    ['Second Round', '2026-11-10T17:00:00', { I: ['GER', 'ITA', 'FRA', 'TUR'], J: ['ESP', 'CZE', 'HUN', 'POR'] }]
  ];
  let id = 1;
  const games = [], items = [];
  phases.forEach(([name, date, groups], index) => {
    const roundId = index + 1, played = date < '2026-10' ? 2 : 0;
    const round = { roundId, roundName: name };
    items.push({ standingHeaderName: name, roundIds: [roundId], type: 'groups', data: { groups: Object.entries(groups).map(([groupName, members]) => ({ groupName, teamsStats: members.map((code, i) => ({ team: teams[code].teamId, rank: i + 1, gamesPlayed: played, gamesWon: played, gamesLost: 0 })) })) } });
    for (const [groupPairingCode, members] of Object.entries(groups)) {
      for (let n = 0; n < members.length; n += 2) games.push({ gameId: id++, round, groupPairingCode, gameDateTimeUTC: date, hasTimeGameDateTime: true, teamA: teams[members[n]], teamB: teams[members[(n + 1) % members.length]], teamAScore: played ? 80 : 0, teamBScore: played ? 70 : 0, liveGameStatus: played ? 999 : 1, isLive: false, competition: { competitionCode: definition.code, gender: definition.gender, competitionType: 'National Teams', season: 2027, start: '2025-11-09' } });
    }
    if (name === 'Hosts') games.push({ ...games.at(-1), gameId: id++, gameDateTimeUTC: '2027-02-13T17:00:00', liveGameStatus: 1 });
  });
  return { definition, at: now, stale: false, value: { games, items } };
}
const zoneCode = (d, group, position) => zonesFor(d, group)?.zones.find(z => position >= z.from && position <= z.to)?.code;

test('men expose every European group and three qualifying places in each phase', () => {
  const source = fixture('ESM');
  const second = build([source], 'ESM', null, now);
  assert.equal(second.phase, 2);
  assert.equal(second.games.length, 6);
  assert.deepEqual(second.availableGroups, [{ code: 'I', spain: true }, { code: 'J', spain: false }]);
  for (const group of second.standings.value) {
    assert.equal(zoneCode(second, group, 3), 'M');
    assert.equal(zoneCode(second, group, 4), undefined);
  }
  const first = build([source], 'ESM', 1, now);
  for (const group of first.standings.value) {
    assert.equal(zoneCode(first, group, 3), '2F');
    assert.equal(zoneCode(first, group, 4), undefined);
  }
});

test('women default to the second qualifying phase while the hosts run in parallel', () => {
  const source = fixture('ESW');
  const second = build([source], 'ESW', null, now);
  assert.equal(second.phase, 3);
  assert.equal(second.phaseLabel, 'Segona fase');
  assert.equal(second.availableGroups.find(g => g.spain).code, 'J');
  for (const group of second.standings.value) {
    assert.equal(zoneCode(second, group, 2), 'EB');
    assert.equal(zoneCode(second, group, 3), undefined);
  }
  assert.doesNotMatch(render({ ...second, generatedAt: now }), /Mundial 2026/);
});

test('women third places remain conditional including the three-team group, while hosts are already qualified', () => {
  const source = fixture('ESW'), first = build([source], 'ESW', 1, now);
  for (const group of first.standings.value) {
    assert.equal(zoneCode(first, group, 2), '2F');
    assert.equal(zoneCode(first, group, 3), 'OP');
    assert.match(zonesFor(first, group).note, /sense els resultats contra els quarts/);
  }
  const hosts = build([source], 'ESW', 2, now);
  const rule = zonesFor(hosts, hosts.standings.value[0]);
  assert.equal(rule.assured, true);
  const output = render({ ...hosts, generatedAt: now });
  assert.match(output, /Les quatre amfitriones tenen plaça assegurada/);
  assert.doesNotMatch(output, /no indiquen classificació assegurada/);
});

test('group links filter games and standings together, preserve pause, and phase navigation resets the filter', () => {
  const source = fixture('ESM'), d = build([source], 'ESM', 2, now, 'I');
  assert.equal(d.games.length, 3);
  assert.equal(d.standings.value.length, 1);
  const output = render({ ...d, generatedAt: now }, false);
  assert.match(output, /Grups: <a[^>]*>Tots<\/a>/);
  assert.match(output, /<strong>I \(Espanya\)<\/strong>/);
  assert.match(output, /fase=2&amp;jornada=1&amp;grup=J&amp;auto=0/);
  assert.match(output, /fase=2&amp;grup=I&amp;auto=0">Actualitza ara/);
  assert.match(output, /fase=2&amp;grup=I">Reprén/);
  const phaseForm = output.match(/<form id="phase-form"[\s\S]*?<\/form>/)[0];
  assert.match(phaseForm, /name="fase"/);
  assert.doesNotMatch(phaseForm, /name="jornada"|name="grup"/);
  assert.match(output, /· Grup I/);
  assert.equal(build([source], 'ESM', 1, now, 'I').selectedGroup, null);
  const wrongYear = { ...d, eventSeason: 2029 };
  assert.equal(zonesFor(wrongYear, d.standings.value[0]), null);
});

test('changing group or phase reuses the full official source and never requests World Cup 2026', async () => {
  const source = fixture('ESW'), calls = [];
  const load = createService({ competition: 'ESW', now: () => now, request: async url => {
    calls.push(url);
    assert.ok(url.includes(events.ESW[0].slug));
    return new Response(html(url.endsWith('/games') ? { event: {}, games: source.value.games } : { items: source.value.items }));
  } });
  assert.equal((await load(null)).standings.value.length, 2);
  assert.equal((await load(3, 'J')).games.length, 2);
  assert.equal((await load(1)).standings.value.length, 2);
  assert.equal(calls.length, 2);
});

test('a standings outage retains its last valid groups with the original timestamp independently of scores', async () => {
  const source = fixture('ESM');
  let time = now, failure = false;
  const load = createService({ competition: 'ESM', now: () => time, request: async url => {
    if (url.endsWith('/standings') && failure) throw new Error('table offline');
    return new Response(html(url.endsWith('/games') ? { event: {}, games: source.value.games } : { items: source.value.items }));
  } });
  await load(2);
  failure = true; time += 61000;
  const d = await load(2, 'J');
  assert.equal(d.standings.value.length, 1);
  assert.equal(d.standings.stale, true);
  assert.equal(d.standings.at, now);
  assert.equal(d.scheduleStale, false);
});
