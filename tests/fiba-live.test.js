const test = require('node:test');
const assert = require('node:assert/strict');
const { createService } = require('../lib/fiba');
const { parseLive } = require('../lib/fiba-live');
const { render } = require('../lib/euroleague-page');
const start = Date.parse('2026-10-21T19:17:00Z');
const base = {
  gameId: 135189, gameName: '31152-C-4', competition: { competitionCode: 'ELW', start: '2026-09-23' },
  round: { roundId: 31152, roundName: 'First Round' }, groupPairingCode: 'C',
  teamA: { teamId: 1, organisationId: 65548, code: 'VBC', officialName: 'Valencia Basket Club' },
  teamB: { teamId: 2, organisationId: 9252, code: 'FCB', officialName: 'Flammes Carolo' },
  gameDateTimeUTC: '2026-10-21T18:00:00', hasTimeGameDateTime: true,
  teamAScore: 35, teamBScore: 39, isLive: true, liveGameStatus: 3, gameResultStatusCode: 'EMPTY', currentPeriod: 'Q3', chrono: '08:53'
};
const live = (overrides = {}) => ({ id: 135189, technicalName: '31152-C-4', status: 3, teamA: { oId: 65548, score: 49 }, teamB: { oId: 9252, score: 58 }, quarter: 'Q3', remainingTime: '00:21', ...overrides });
const body = game => ({ game: { content: game } });
const html = value => '<script>self.__next_f.push(' + JSON.stringify([1, 'a:' + JSON.stringify(value) + '\n']) + ')</script>';
function fixture(calendarGame = base) {
  let time = start, current = live(), failure = false, empty = false;
  const calls = [];
  const load = createService({ competition: 'ELW', now: () => time, request: async (url, options) => {
    calls.push(url);
    if (url.includes('/api/game-live-info/')) {
      assert.equal(options.cache, 'no-store');
      if (failure) throw new Error('live endpoint offline');
      return Response.json(body(empty ? null : current));
    }
    return new Response(html(url.endsWith('/games') ? { event: {}, games: [calendarGame] } : {
      items: [{ type: 'groups', roundIds: [31152], standingHeaderName: 'First Round', data: { groups: [{ groupName: 'C', teamsStats: [{ team: 1, rank: 1, gamesPlayed: 1, gamesWon: 1, gamesLost: 0 }] }] } }]
    }));
  } });
  return { load, calls, advance: () => { time += 31000; }, set: value => { current = value; }, offline: () => { failure = true; }, empty: () => { failure = false; empty = true; } };
}

test('FIBA direct feed validates game and both organisations, including reversed home/away order', () => {
  assert.deepEqual(parseLive(body(live()), base).score, [49, 58]);
  assert.deepEqual(parseLive(body(live({ teamA: { oId: 9252, score: 58 }, teamB: { oId: 65548, score: 49 } })), base).score, [49, 58]);
  for (const change of [{ id: 1 }, { technicalName: 'OTHER-C-4' }, { teamB: { oId: 999, score: 58 } }, { teamA: { oId: 65548, score: '49' } }, { status: 123 }]) assert.throws(() => parseLive(body(live(change)), base));
  assert.equal(parseLive(body(null), base), null);
  assert.deepEqual(parseLive(body(live({ status: 2 })), base), { state: 'scheduled', score: null, label: 'Calfament' });
});

test('direct scores and clocks advance while FIBA HTML remains frozen, and finished games lose the live indicator', async () => {
  const source = fixture();
  const first = await source.load(null);
  assert.deepEqual(first.games[0].score, [49, 58]);
  assert.match(first.games[0].label, /Q3.*00:21/);
  source.advance(); source.set(live({ teamA: { oId: 65548, score: 53 }, teamB: { oId: 9252, score: 60 }, quarter: 'Q4', remainingTime: '08:54' }));
  const second = await source.load(null);
  assert.deepEqual(second.games[0].score, [53, 60]);
  assert.match(second.games[0].label, /Q4.*08:54/);
  assert.match(render(second), /class="live-dot"/);
  source.advance(); source.set(live({ status: 5, teamA: { oId: 65548, score: 78 }, teamB: { oId: 9252, score: 89 }, quarter: 'Q4', remainingTime: '00:00' }));
  const final = await source.load(null);
  assert.equal(final.games[0].state, 'final');
  assert.deepEqual(final.games[0].score, [78, 89]);
  assert.doesNotMatch(render(final), /class="live-dot"/);
  assert.equal(final.standings.value[0].teams[0].played, 1);
  const count = source.calls.length;
  source.advance();
  assert.equal((await source.load(null)).games[0].state, 'final');
  assert.equal(source.calls.slice(count).filter(url => url.includes('/api/game-live-info/')).length, 0);
});

test('failed or empty direct feed preserves the last valid score and its timestamp without advertising it as current live data', async () => {
  const source = fixture();
  const first = await source.load(null);
  source.advance(); source.offline();
  const old = await source.load(null);
  assert.deepEqual(old.games[0].score, [49, 58]);
  assert.equal(old.games[0].checkedAt, first.games[0].checkedAt);
  assert.equal(old.games[0].stale, true);
  assert.doesNotMatch(render(old), /class="live-dot"/);
  source.advance(); source.empty();
  const empty = await source.load(null);
  assert.deepEqual(empty.games[0].score, [49, 58]);
  assert.equal(empty.games[0].checkedAt, first.games[0].checkedAt);
  assert.equal(empty.games[0].stale, true);
});

test('a cold feed failure marks the delayed HTML score as old rather than showing the live pilot', async () => {
  const source = fixture(); source.offline();
  const data = await source.load(null);
  assert.deepEqual(data.games[0].score, [35, 39]);
  assert.equal(data.games[0].stale, true);
  assert.match(data.games[0].label, /Últim marcador/);
  assert.doesNotMatch(render(data), /class="live-dot"/);
});


test('a match still pending in delayed HTML can already be live, including an explicit official 0-0', async () => {
  const source = fixture({ ...base, isLive: false, liveGameStatus: 1, teamAScore: 0, teamBScore: 0, currentPeriod: '', chrono: null });
  source.set(live({ teamA: { oId: 65548, score: 0 }, teamB: { oId: 9252, score: 0 }, quarter: 'Q1', remainingTime: '09:59' }));
  const data = await source.load(null);
  assert.equal(data.games[0].state, 'live');
  assert.deepEqual(data.games[0].score, [0, 0]);
  assert.match(data.games[0].label, /Q1.*09:59/);
  assert.match(render(data), /class="live-dot"/);
});
