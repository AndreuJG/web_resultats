const test = require('node:test');
const assert = require('node:assert/strict');
const { resultCacheSeconds } = require('../lib/result-cache-policy');
const { refreshPolicy } = require('../lib/refresh-policy');
const acb = require('../lib/acb');
const fiba = require('../lib/fiba');
const now = Date.parse('2026-10-17T10:00:00Z');
const reactHTML = data => '<script>self.__next_f.push(' + JSON.stringify([1, 'a:' + JSON.stringify(data) + '\n']) + ')</script>';

test('source cache detects imminent games even after days without visitors and respects unknown times', () => {
  const games = [{ date: '2026-10-20T16:00:00Z', state: 'scheduled' }];
  assert.equal(resultCacheSeconds(games, now, now), 3600);
  assert.equal(resultCacheSeconds(games, now, Date.parse('2026-10-20T15:00:00Z')), 20);
  assert.equal(resultCacheSeconds([{ ...games[0], state: 'live' }], now, now), 20);
  assert.equal(resultCacheSeconds([{ date: null, timeUnknown: true, state: 'scheduled' }], now, now), 300);
  assert.equal(resultCacheSeconds([{ state: 'final' }], now, now, 86400), 86400);
});

test('old ACB fixtures are reused while the current classification refreshes independently', async () => {
  let time = now, version = 1, offline = false;
  const calls = [];
  const filters = { seasons: [{ id: 10, startYear: 2026 }], rounds: [{ id: 101, roundNumber: 1 }, { id: 102, roundNumber: 2 }] };
  const matches = round => ({ selectedFilters: { season: 10, round }, availableFilters: filters,
    matches: [{ id: round, matchStatus: 'FINALIZED', startDateTime: '2026-10-10T16:00:00Z', homeTeam: { shortName: 'Local' }, awayTeam: { shortName: 'Visitant' }, homeScore: 70, awayScore: 65 }] });
  const load = acb.createService({ now: () => time, fetch: async url => {
    calls.push(url);
    if (url.includes('clasificacion')) {
      if (offline) throw new Error('offline table');
      return new Response(reactHTML({ selectedFilters: { season: 10, round: 102 }, availableFilters: filters, standings: [
        { team: { shortName: 'Local' }, position: 1, matchesPlayed: version, wins: version, losses: 0 },
        { team: { shortName: 'Visitant' }, position: 2, matchesPlayed: version, wins: 0, losses: version }
      ] }));
    }
    return new Response(reactHTML(matches(url.includes('jornada=101') ? 101 : 102)));
  } });
  const first = await load('1');
  version = 2; time += 61000;
  const second = await load('1');
  assert.equal(calls.filter(url => url.includes('jornada=101')).length, 1);
  assert.equal(second.standings.value[0].teams[0].won, 2);
  assert.equal(second.games[0].checkedAt, first.games[0].checkedAt);
  assert.equal(second.standings.at, time);
  offline = true; time += 61000;
  const fallback = await load('1');
  assert.equal(fallback.games[0].stale, false);
  assert.equal(fallback.standings.stale, true);
  assert.equal(fallback.standings.at, second.standings.at);
  assert.equal(refreshPolicy(fallback).delay, 60000);
});

test('FIBA shares the full calendar across weeks and detects a live game outside the selected week', async () => {
  let time = now, live = false, offline = false;
  const calls = [];
  const makeGame = (id, date, final) => ({ gameId: id, competition: { competitionCode: 'ELW', start: '2026-10-01' }, round: { roundId: 11, roundName: 'Regular Season' },
    teamA: { teamId: 1, officialName: 'Local', code: 'VBC' }, teamB: { teamId: 2, officialName: 'Visitant', code: 'OTHER' },
    gameDateTimeUTC: date, hasTimeGameDateTime: true, teamAScore: final ? 70 : 0, teamBScore: final ? 65 : 0,
    gameResultStatusCode: final ? 'VALID' : '', isLive: !final && live });
  const load = fiba.createService({ competition: 'ELW', now: () => time, request: async url => {
    calls.push(url);
    if (offline && url.endsWith('/games')) throw new Error('offline');
    return new Response(reactHTML(url.endsWith('/games') ? { event: {}, games: [makeGame(1, '2026-10-10T16:00:00Z', true), makeGame(2, '2026-10-17T16:00:00Z', false)] } : {
      items: [{ standingHeaderName: 'Regular season', type: 'groups', roundIds: [11], data: { groups: [{ groupName: 'A', teamsStats: [
        { team: 1, rank: 1, gamesPlayed: 1, gamesWon: 1, gamesLost: 0 }
      ] }] } }]
    }));
  } });
  await load('1'); await load('2');
  assert.equal(calls.filter(url => url.endsWith('/games')).length, 1);
  assert.equal(calls.filter(url => url.endsWith('/standings')).length, 1);
  time = Date.parse('2026-10-17T16:01:00Z'); live = true;
  const current = await load('2');
  assert.equal(current.games[0].state, 'live');
  assert.deepEqual(current.games[0].score, [0, 0]); // Explicit official live state, never inferred.
  assert.equal(calls.filter(url => url.endsWith('/games')).length, 2);
  const at = current.games[0].checkedAt;
  time += 21000; offline = true;
  const fallback = await load('2');
  assert.equal(fallback.games[0].stale, true);
  assert.equal(fallback.games[0].checkedAt, at);
  assert.equal(fallback.standings.stale, false);
});


test('ACB shows real scores on a cold visit when the standings source is unavailable', async () => {
  const filters = { seasons: [{ id: 10, startYear: 2026 }], rounds: [{ id: 101, roundNumber: 1 }] };
  let matchRequests = 0;
  const load = acb.createService({ now: () => now, fetch: async url => {
    if (url.includes('clasificacion')) throw new Error('standings timeout');
    matchRequests++;
    return new Response(reactHTML({ selectedFilters: { season: 10, round: 101 }, availableFilters: filters,
      matches: [{ id: 1, matchStatus: 'FINALIZED', startDateTime: '2026-10-10T16:00:00Z', homeTeam: { shortName: 'Local' }, awayTeam: { shortName: 'Visitant' }, homeScore: 81, awayScore: 79 }] }));
  } });
  const data = await load(null);
  assert.deepEqual(data.games[0].score, [81, 79]);
  assert.equal(data.standings, null);
  assert.equal(matchRequests, 1);
  const html = require('../lib/euroleague-page').render(data);
  assert.match(html, /81 – 79/);
  assert.match(html, /La classificació oficial no està disponible/);
});

test('expired local cache adopts a newer shared snapshot instead of falling back to old scores', async () => {
  const { createSourceCache } = require('../lib/source-cache');
  const entries = new Map();
  const cache = { get: async key => entries.get(key), set: async (key, value) => entries.set(key, value) };
  let time = now;
  const first = createSourceCache(cache, () => time);
  await first('shared-score', 20, async () => [10, 8]);
  time += 21000;
  await createSourceCache(cache, () => time)('shared-score', 20, async () => [18, 14]);
  const result = await first('shared-score', 20, async () => { throw new Error('must use shared score'); });
  assert.deepEqual(result.value, [18, 14]);
  assert.equal(result.stale, false);
});

test('overnight source failure on a cold instance preserves real scores and their original age', async () => {
  const { createSourceCache } = require('../lib/source-cache');
  const entries = new Map();
  const cache = { get: async key => entries.get(key), set: async (key, value) => entries.set(key, value) };
  await createSourceCache(cache, () => now)('overnight', 20, async () => [71, 68], 2592000);
  const result = await createSourceCache(cache, () => now + 8 * 3600000)('overnight', 20, async () => { throw new Error('source timeout'); }, 2592000);
  assert.deepEqual(result.value, [71, 68]);
  assert.equal(result.stale, true);
  assert.equal(result.at, now);
});
