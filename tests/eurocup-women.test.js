const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { normalize, createService, sourceUrls } = require('../lib/fiba');
const { render } = require('../lib/euroleague-page');
const { zonesFor } = require('../lib/standings-zones');
const tv = require('../lib/tv');
const now = Date.parse('2026-10-21T19:00:00Z');
const teams = [
  { teamId: 1, organisationId: 58145, code: 'BAXI', officialName: 'Club Universitario de Ferrol' },
  { teamId: 2, organisationId: 58380, code: 'CBK', officialName: 'CIMSA CBK Mersin' },
  { teamId: 3, organisationId: 8904, code: 'ASHD', officialName: 'Maccabi Bnot Ashdod' },
  { teamId: 4, organisationId: 65468, code: 'RML', officialName: 'Elitzur Ramle' }
];
function fixture() {
  const games = [];
  const competition = { competitionCode: 'ECW', gender: 'Women', competitionType: 'Clubs', season: 2027, start: '2026-09-23' };
  let id = 1;
  const add = (round, number, date, a = 0, b = 1, group = 'A') => {
    const final = date < '2026-10-21';
    games.push({ gameId: id++, gameName: round.roundId + '-' + group + '-' + number, round, gameNumber: number,
      competition, gameDateTimeUTC: date, hasTimeGameDateTime: true, groupPairingCode: group,
      teamA: a == null ? null : teams[a], teamB: b == null ? null : teams[b],
      teamAScore: final ? 80 : 0, teamBScore: final ? 70 : 0, liveGameStatus: final ? 999 : 1, isLive: false, gameResultStatusCode: 'EMPTY' });
  };
  const qualifying = { roundId: 1, roundNumber: 1, roundName: 'Qualifiers' };
  add(qualifying, 'A', '2026-09-24T18:00:00', 0, 1, '1');
  add(qualifying, 'B', '2026-10-01T18:00:00', 1, 0, '1');
  const regular = { roundId: 2, roundNumber: 2, roundName: 'Regular Season' };
  const patterns = [[[0, 1], [2, 3]], [[0, 2], [3, 1]], [[0, 3], [1, 2]]];
  const dates = ['2026-10-14', '2026-10-21', '2026-10-28', '2026-11-04', '2026-11-25', '2026-12-02'];
  let number = 1;
  for (let d = 0; d < 6; d++) for (const pair of patterns[d % 3]) {
    const [a, b] = d < 3 ? pair : [...pair].reverse();
    add(regular, String(number++), dates[d] + 'T18:00:00', a, b);
  }
  add({ roundId: 3, roundNumber: 3, roundName: 'Play-Off Round 1' }, 'A', '2027-01-07T00:00:00', null, null, '1');
  add({ roundId: 3, roundNumber: 3, roundName: 'Play-Off Round 1' }, 'B', '2027-01-14T00:00:00', null, null, '1');
  games.at(-1).hasTimeGameDateTime = false;
  games.at(-2).hasTimeGameDateTime = false;
  const items = [
    { type: 'flat', roundIds: [1], standingHeaderName: 'Qualifiers', data: {} },
    { type: 'groups', roundIds: [2], standingHeaderName: 'Regular Season', data: { groups: [{ groupName: 'A', teamsStats: teams.map((t, i) => ({ team: t.teamId, rank: i + 1, gamesPlayed: 1, gamesWon: i < 2 ? 1 : 0, gamesLost: i < 2 ? 0 : 1 })) }] } },
    { type: 'bracket', roundIds: [3], standingHeaderName: 'Play-Offs', data: {} }
  ];
  return { games, items };
}
const html = value => '<script>self.__next_f.push(' + JSON.stringify([1, 'a:' + JSON.stringify(value) + '\n']) + ')</script>';

test('EuroCup Women has its own current-season source and rejects male, foreign and wrong-year data', () => {
  assert.equal(sourceUrls('ECW', now).gamesUrl, 'https://www.fiba.basketball/en/events/eurocup-women-26-27/games');
  assert.equal(sourceUrls('ECW', Date.parse('2027-03-01')).gamesUrl, sourceUrls('ECW', now).gamesUrl);
  const { games, items } = fixture();
  for (const change of [{ gender: 'Men' }, { competitionCode: 'ELW' }, { season: 2026 }, { competitionType: 'National Teams' }]) {
    assert.throws(() => normalize(games.map(g => ({ ...g, competition: { ...g.competition, ...change } })), items, 'ECW', null, now), /Unexpected/);
  }
});

test('regular-season fixtures form six numbered matchdays, and knockout legs remain separate from group tables', () => {
  const { games, items } = fixture(), ids = [];
  for (let n = 3; n <= 8; n++) {
    const d = normalize(games, items, 'ECW', n, now);
    assert.equal(d.games.length, 2);
    assert.match(d.roundLabel, new RegExp('Jornada ' + (n - 2)));
    assert.equal(d.standings.value[0].name, 'Grup A');
    ids.push(...d.games.map(g => g.code));
  }
  assert.equal(new Set(ids).size, 12);
  const data = normalize(games, items, 'ECW', 9, now);
  assert.equal(data.standings, null);
  assert.equal(data.currentStandingsRound, 4);
  assert.match(data.standingsMessage, /eliminatòria/);
  const output = render({ ...data, generatedAt: now }, false);
  assert.match(output, /Primera eliminatòria · Anada/);
  assert.match(output, /Hora per confirmar/);
  assert.match(output, /jornada=4&amp;auto=0#classificacio/);
  assert.doesNotMatch(output, /· Grup 1|0 – 0|1970/);
  assert.equal((output.match(/<optgroup /g) || []).length, 3);
});

test('European team highlights, HP labels, Valencia orange and conditional third places are preserved', () => {
  const { games, items } = fixture();
  games.find(g => g.round.roundId === 2).teamA = { ...teams[0], code: 'VBC', officialName: 'Valencia Basket Club' };
  const d = normalize(games, items, 'ECW', 3, now), group = d.standings.value[0];
  const output = render({ ...d, generatedAt: now });
  assert.match(output, /class="valencia-basket"><strong>Valencia Basket Club/);
  assert.match(output, /HP Maccabi Bnot Ashdod/);
  assert.match(output, /HP Elitzur Ramle/);
  const rule = zonesFor(d, group);
  assert.deepEqual(rule.zones.map(z => [z.from, z.to, z.code]), [[1, 2, 'PO'], [3, 3, 'OP']]);
  assert.match(rule.note, /quatre dels dotze tercers/);
  assert.equal(zonesFor({ ...d, season: 'F2027' }, group), null);
  assert.equal(zonesFor({ ...d, standings: { ...d.standings, phase: 'Play-Offs' } }, group), null);
  assert.equal(zonesFor(d, { ...group, teams: group.teams.slice(0, 3) }), null);
  for (const code of ['BAXI', 'DME', 'HGJ', 'CAB', 'MEINS', 'GIR']) {
    const g = { ...games[0], round: { roundId: 2, roundName: 'Regular Season' }, gameNumber: '1', groupPairingCode: 'A', teamA: { ...teams[0], code, officialName: code } };
    assert.equal(normalize([g], items, 'ECW', null, now).games[0].home.country, 'ESP');
  }
});

test('automatic selection follows the next-day rule, keeps fresh standings and refreshes without pinning the round', () => {
  const { games, items } = fixture();
  assert.equal(normalize(games, items, 'ECW', null, Date.parse('2026-10-15T12:00:00Z')).round, 3);
  const d = normalize(games, items, 'ECW', null, Date.parse('2026-10-16T12:00:00Z'));
  assert.equal(d.round, 4);
  assert.equal(d.standings.value[0].teams[0].played, 1);
  assert.match(render({ ...d, generatedAt: now }), /href="\/eurocup-femenina.html">Actualitza ara/);
  assert.match(render({ ...d, generatedAt: now }, false), /href="\/eurocup-femenina.html\?auto=0">Actualitza ara/);
  const old = normalize(games, items, 'ECW', 3, now);
  assert.deepEqual(old.standings, d.standings);
  assert.match(render({ ...old, generatedAt: now }, false), /jornada=4&amp;auto=0">Següent/);
});

test('postponed and advanced outliers keep their numbered rounds without freezing the default calendar', () => {
  const { games, items } = fixture();
  // Three of four games form the main week; one is moved well beyond it.
  const regular = games.filter(g => g.round.roundId === 2);
  const more = regular.map(g => ({ ...g, gameId: g.gameId + 1000, groupPairingCode: 'B' }));
  games.push(...more);
  more[0].gameDateTimeUTC = '2026-11-02T18:00:00'; more[0].liveGameStatus = 1;
  more[8].gameDateTimeUTC = '2026-10-24T18:00:00'; more[8].liveGameStatus = 999;
  assert.equal(normalize(games, items, 'ECW', null, Date.parse('2026-10-26T12:00:00Z')).round, 5);
  assert.ok(normalize(games, items, 'ECW', 3, now).games.some(g => g.code === more[0].gameId));
  more[8].isLive = true; more[8].liveGameStatus = 3;
  assert.equal(normalize(games, items, 'ECW', null, Date.parse('2026-10-24T19:00:00Z')).round, 7);
});

test('official live feed changes a delayed ECW score, shares cached sources and retains stale data honestly', async () => {
  const { games, items } = fixture();
  let time = now, points = 55, fail = false, liveRequests = 0, scheduleRequests = 0;
  const liveGame = games.find(g => g.round.roundId === 2 && g.gameNumber === '3');
  liveGame.isLive = true; liveGame.liveGameStatus = 3; liveGame.teamAScore = 35; liveGame.teamBScore = 39;
  const load = createService({ competition: 'ECW', now: () => time, request: async url => {
    if (url.includes('/api/game-live-info/')) {
      liveRequests++;
      if (fail) throw new Error('live offline');
      const id = Number(url.match(/game-live-info\/(\d+)/)[1]), base = games.find(g => g.gameId === id);
      return Response.json({ game: { content: { id, technicalName: base.gameName, status: 3, teamA: { oId: base.teamA.organisationId, score: points }, teamB: { oId: base.teamB.organisationId, score: 60 }, quarter: 'Q4', remainingTime: '05:14' } } });
    }
    scheduleRequests++;
    return new Response(html(url.endsWith('/games') ? { event: {}, games } : { items }));
  } });
  const first = await load(null);
  assert.deepEqual(first.games.find(g => g.code === liveGame.gameId).score, [55, 60]);
  assert.match(render(first), /class="live-dot"/);
  await load(3);
  assert.equal(scheduleRequests, 2);
  time += 31000; points = 59;
  const second = await load(null), checked = second.games.find(g => g.code === liveGame.gameId).checkedAt;
  assert.deepEqual(second.games.find(g => g.code === liveGame.gameId).score, [59, 60]);
  fail = true; time += 31000;
  const old = (await load(null)).games.find(g => g.code === liveGame.gameId);
  assert.equal(old.checkedAt, checked);
  assert.equal(old.stale, true);
  assert.match(old.label, /Dades antigues/);
  assert.ok(liveRequests >= 3);
});

test('television recognises women separately, preserves today, and supplies the ECW colour without invented dials', () => {
  for (const name of ['EuroCup femenina: Jairis - Panathlitikos', 'EuroCup Women: Ferrol - Mersin', 'eurocup-femenina/ferrol-mersin']) assert.equal(tv.competition(name), 'ECW');
  assert.equal(tv.competition('BKT EuroCup: Valencia - Club'), 'U');
  const event = { date: '2026-10-21T16:00:00Z', competition: 'U', title: 'Ferrol - Mersin', source: 'https://www.movistarplus.es/deportes/baloncesto/eurocup-femenina/ferrol-mersin', channels: [] };
  const result = tv.mergeEvents([event], now);
  assert.equal(result[0].competition, 'ECW');
  const output = require('../lib/tv-page').render({ events: result, errors: [] }, false);
  assert.match(output, /tv-ECW/);
  assert.match(output, /EuroCup femenina/);
  assert.doesNotMatch(output, /EuroCup masculina|Dial Movistar \d/);
});

test('homepage places EuroCup Women immediately after EuroCup men and before national teams', () => {
  const build = fs.readFileSync('scripts/build.js', 'utf8');
  assert.match(build, /\['eurocup', [^\n]+\n  \['eurocup-femenina',/);
  const routes = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  assert.ok(routes.rewrites.some(r => r.source === '/eurocup-femenina.html' && r.destination === '/api/eurocup-femenina'));
});
