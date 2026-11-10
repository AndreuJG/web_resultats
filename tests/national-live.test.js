const test = require('node:test');
const assert = require('node:assert/strict');
const { createService } = require('../lib/national');
const { render } = require('../lib/euroleague-page');
const start = Date.parse('2026-11-10T20:17:00Z');
const html = value => '<script>self.__next_f.push(' + JSON.stringify([1, 'a:' + JSON.stringify(value) + '\n']) + ')</script>';
const calendar = {
  gameId: 129106, gameName: '30004-J-2', gameNumber: 2,
  round: { roundId: 30004, roundName: 'Second Round' }, groupPairingCode: 'J',
  competition: { competitionCode: 'EMSW-Q', start: '2025-11-01', gender: 'Women', competitionType: 'National Teams', season: 2027 },
  teamA: { teamId: 283545, organisationId: 138, code: 'ESP', officialName: 'Spain' },
  teamB: { teamId: 283543, organisationId: 886, code: 'CZE', officialName: 'Czechia' },
  gameDateTimeUTC: '2026-11-10T19:30:00', hasTimeGameDateTime: true,
  teamAScore: 31, teamBScore: 26, isLive: true, liveGameStatus: 3, gameResultStatusCode: 'EMPTY', currentPeriod: 'Q2', chrono: '04:04'
};
const header = (extra = {}) => ({ id: 129106, technicalName: '30004-J-2', status: 3,
  teamA: { oId: 138, score: 43 }, teamB: { oId: 886, score: 36 }, quarter: 'Q2', remainingTime: '00:00', ...extra });
function fixture(competition = 'ESW', missingIdentity = false) {
  let time = start, current = header(), offline = false;
  const calls = [];
  const game = competition === 'ESM' ? { ...calendar, competition: { ...calendar.competition, gender: 'Men', competitionCode: 'WCQ-EUR' } } : { ...calendar };
  if (missingIdentity) game.teamA = { ...game.teamA, organisationId: undefined };
  const other = { ...game, gameId: 129107, gameName: '30004-K-2', groupPairingCode: 'K', teamA: { teamId: 10, organisationId: 10, code: 'FRA', officialName: 'France' }, teamB: { teamId: 11, organisationId: 11, code: 'GER', officialName: 'Germany' } };
  const load = createService({ competition, now: () => time, request: async (url, options) => {
    calls.push(url);
    if (url.includes('/api/game-live-info/')) {
      assert.match(url, /\/129106\/light$/); // No requests for a filtered-out group.
      assert.equal(options.cache, 'no-store');
      if (offline) throw new Error('live unavailable');
      return Response.json({ game: { content: current } });
    }
    return new Response(html(url.endsWith('/games') ? { event: {}, games: [game, other] } : { items: [{ type: 'groups', roundIds: [30004], standingHeaderName: 'Second Round', data: { groups: [] } }] }));
  } });
  return { load: () => load(null, 'J'), calls, advance: () => { time += 31000; }, set: next => { current = next; }, offline: () => { offline = true; } };
}

test('national women and men use the current direct feed, not the frozen calendar clock, preserving filters and final state', async () => {
  for (const competition of ['ESW', 'ESM']) {
    const source = fixture(competition);
    const first = await source.load();
    assert.equal(first.games.length, 1);
    assert.deepEqual(first.games[0].score, [43, 36]);
    assert.match(first.games[0].label, /Q2 · 00:00/);
    assert.doesNotMatch(first.games[0].label, /04:04/);
    assert.match(render(first), /class="live-dot"/);
    const at = first.games[0].checkedAt;
    const count = source.calls.length;
    assert.deepEqual((await source.load()).games[0].score, [43, 36]);
    assert.equal(source.calls.length, count);
    source.advance();
    source.set(header({ quarter: 'Q3', remainingTime: '08:42', teamA: { oId: 138, score: 48 }, teamB: { oId: 886, score: 40 } }));
    const second = await source.load();
    assert.deepEqual(second.games[0].score, [48, 40]);
    assert.match(second.games[0].label, /Q3 · 08:42/);
    assert.ok(second.games[0].checkedAt > at);
    source.advance(); source.set(header({ status: 5, quarter: 'Q4', remainingTime: '00:00', teamA: { oId: 138, score: 80 }, teamB: { oId: 886, score: 70 } }));
    const final = await source.load();
    assert.equal(final.games[0].state, 'final');
    assert.doesNotMatch(render(final), /class="live-dot"/);
  }
});

test('national feed failure retains its real timestamp and marks the score old; a cold failure cannot advertise the stale HTML as live', async () => {
  const source = fixture();
  const first = await source.load();
  source.advance(); source.offline();
  const retained = await source.load();
  assert.deepEqual(retained.games[0].score, [43, 36]);
  assert.equal(retained.games[0].checkedAt, first.games[0].checkedAt);
  assert.equal(retained.games[0].stale, true);
  assert.doesNotMatch(render(retained), /class="live-dot"/);
  const cold = fixture(); cold.offline();
  const fallback = await cold.load();
  assert.deepEqual(fallback.games[0].score, [31, 26]);
  assert.equal(fallback.games[0].stale, true);
  assert.match(fallback.games[0].label, /Dades antigues/);
  assert.doesNotMatch(render(fallback), /class="live-dot"/);
});

test('a live calendar without official organisation identities is marked old without querying an unverifiable feed', async () => {
  const source = fixture('ESW', true);
  const data = await source.load();
  assert.equal(source.calls.some(url => url.includes('/api/game-live-info/')), false);
  assert.deepEqual(data.games[0].score, [31, 26]);
  assert.equal(data.games[0].stale, true);
  assert.match(data.games[0].label, /Dades antigues/);
  assert.doesNotMatch(render(data), /class="live-dot"/);
});
