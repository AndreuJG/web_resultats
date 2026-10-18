const test = require('node:test');
const assert = require('node:assert/strict');
const { createSourceCache, unwrapSnapshot } = require('../lib/source-cache');
const { roundCacheSeconds } = require('../lib/feb-cache-policy');

test('finished FEB rounds last a day; future rounds expire before tip-off', () => {
  const now = Date.parse('2026-10-17T10:00:00Z');
  const game = { state: 'final', date: '2026-10-10T16:00:00Z' };
  assert.equal(roundCacheSeconds({ games: [game] }, now, now), 86400);
  const future = { games: [{ state: 'scheduled', date: '2026-10-19T16:00:00Z' }] };
  assert.equal(roundCacheSeconds(future, now, now), 43200);
  const near = Date.parse('2026-10-19T15:00:00Z');
  assert.equal(roundCacheSeconds(future, now, near), 20);
  assert.equal(roundCacheSeconds({ games: [{ ...game, state: 'live' }] }, now, now), 20);
});

test('default FEB page expires when the next round approaches, even after an idle week', () => {
  const at = Date.parse('2026-10-10T20:00:00Z');
  const data = { games: [{ state: 'final' }], currentRound: true, nextMatchAt: Date.parse('2026-10-17T16:00:00Z') };
  assert.equal(roundCacheSeconds(data, at, at), 21600);
  assert.equal(roundCacheSeconds(data, at, Date.parse('2026-10-17T15:00:00Z')), 20);
  assert.equal(roundCacheSeconds(data, at, Date.parse('2026-10-17T17:00:00Z')), 20);
});

test('saved FEB pages return immediately while one slow background refresh runs', async () => {
  let time = 1000000, calls = 0, release;
  const tasks = [], cached = createSourceCache(null, () => time);
  const value = score => ({ games: [{ state: 'live', label: 'En joc', score, stale: false }] });
  await cached('background', 20, async () => value([12, 10]));
  time += 21000;
  const loader = () => { calls++; return new Promise(resolve => { release = () => resolve(value([20, 18])); }); };
  const options = { defer: task => tasks.push(task) };
  const saved = await cached('background', 20, loader, 86400, options);
  assert.equal(saved.stale, true);
  assert.equal(unwrapSnapshot(saved).games[0].stale, true);
  assert.equal(saved.at, 1000000);
  await cached('background', 20, loader, 86400, options);
  assert.equal(calls, 1);
  release(); await Promise.all(tasks);
  const fresh = await cached('background', 20, loader, 86400, options);
  assert.equal(fresh.stale, false);
  assert.deepEqual(fresh.value.games[0].score, [20, 18]);
  assert.equal(calls, 1);
});

test('background failures preserve original data and entries beyond retention wait for the source', async () => {
  let time = 1000000;
  const tasks = [], cached = createSourceCache(null, () => time);
  const options = { defer: task => tasks.push(task) };
  await cached('retention', 20, async () => 'saved', 100);
  time += 21000;
  const saved = await cached('retention', 20, async () => { throw new Error('offline'); }, 100, options);
  await Promise.all(tasks);
  assert.equal(saved.value, 'saved');
  assert.equal(saved.at, 1000000);
  time += 100000;
  await assert.rejects(cached('retention', 20, async () => { throw new Error('offline'); }, 100, options), /offline/);
});

test('adaptive source lifetime expires an old future schedule as a match approaches', async () => {
  let time = Date.parse('2026-10-17T10:00:00Z'), calls = 0;
  const cached = createSourceCache(null, () => time);
  const load = async () => { calls++; return { games: [{ state: 'scheduled', date: '2026-10-17T18:00:00Z' }] }; };
  await cached('adaptive', roundCacheSeconds, load);
  time += 3600000;
  await cached('adaptive', roundCacheSeconds, load);
  assert.equal(calls, 1);
  time += 5 * 3600000;
  await cached('adaptive', roundCacheSeconds, load);
  assert.equal(calls, 2);
});

test('saved rounds are shared across fresh service instances without querying FEB again', async () => {
  const stored = new Map();
  const cache = { get: async key => stored.get(key), set: async (key, value) => stored.set(key, value) };
  const at = Date.parse('2026-10-17T10:00:00Z');
  await createSourceCache(cache, () => at)('round:2', roundCacheSeconds, async () => ({ games: [{ state: 'final' }] }), 1209600);
  const second = createSourceCache(cache, () => at + 23 * 3600000);
  const result = await second('round:2', roundCacheSeconds, async () => { throw new Error('Should not query FEB'); }, 1209600);
  assert.equal(result.stale, false);
  assert.equal(result.at, at);
});


test('background refresh does not claim a source failure, but a failed renewal remains visible', async () => {
  let time = Date.parse('2026-10-18T10:00:00Z'), reject;
  const tasks = [], cached = createSourceCache(null, () => time);
  const value = { competition: 'LF', season: 'F2026', round: 4, rounds: [4], games: [{ home: { name: 'Local' }, away: { name: 'Visitant' }, state: 'live', label: 'En joc', score: [25, 20] }], standings: { value: [] } };
  await cached('notice', 20, async () => value);
  time += 21000;
  const snapshot = await cached('notice', 20, () => new Promise((resolve, fail) => { reject = fail; }), 86400, { defer: task => tasks.push(task) });
  const render = require('../lib/euroleague-page').render;
  assert.equal(snapshot.refreshing, true);
  assert.doesNotMatch(render(unwrapSnapshot(snapshot, time)), /Algunes dades no s’han pogut renovar/);
  assert.equal(unwrapSnapshot(snapshot, time).games[0].stale, true);
  reject(new Error('timeout')); await Promise.all(tasks);
  const failed = await cached('notice', 20, async () => { throw new Error('timeout'); }, 86400);
  assert.match(render(unwrapSnapshot(failed, time)), /Algunes dades no s’han pogut renovar/);
  assert.equal(failed.at, time - 21000);
});


test('a quick background renewal returns the new live score in the same page request', async () => {
  let time = 1000000;
  const tasks = [], cached = createSourceCache(null, () => time);
  await cached('fast-live', 20, async () => [12, 10]);
  time += 21000;
  const result = await cached('fast-live', 20, async () => [20, 18], 86400, { defer: task => tasks.push(task) });
  await Promise.all(tasks);
  assert.deepEqual(result.value, [20, 18]);
  assert.equal(result.at, time);
  assert.equal(result.stale, false);
});
