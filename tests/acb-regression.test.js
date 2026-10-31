const test = require('node:test');
const assert = require('node:assert/strict');
const { createService } = require('../lib/acb');
const { render } = require('../lib/euroleague-page');
const start = Date.parse('2026-10-31T20:40:00Z');
const html = data => '<script>self.__next_f.push(' + JSON.stringify([1, 'a:' + JSON.stringify(data) + '\n']) + ')</script>';
function fixture() {
  let time = start, queryScore = 33, contextScore = 18, status = 'STARTED', quarter = 2;
  const storage = new Map(), calls = [];
  const cache = { get: async key => structuredClone(storage.get(key)), set: async (key, value) => storage.set(key, structuredClone(value)) };
  const source = async url => {
    calls.push(url);
    if (url.includes('clasificacion')) throw new Error('not needed');
    return new Response(html({ selectedFilters: { season: 91, round: 6020 }, availableFilters: { seasons: [{ id: 91, startYear: 2026 }], rounds: [{ id: 6020, roundNumber: 5 }] }, matches: [{ id: 105422, homeTeam: { shortName: 'Leyma Coruña' }, awayTeam: { shortName: 'La Laguna TFE' }, startDateTime: '2026-10-31T20:00:00Z', homeScore: url.includes('jornada=') ? queryScore : contextScore, awayScore: 33, matchStatus: status, currentQuarter: quarter }] }));
  };
  const service = () => createService({ cache, now: () => time, fetch: source });
  return { service, calls, storage, advance: () => { time += 21000; }, set: (q, c, s = 'STARTED', period = 2) => { queryScore = q; contextScore = c; status = s; quarter = period; } };
}
test('active scores never reuse the five-minute context, including a cold instance', async () => {
  const f = fixture();
  const first = await f.service()(5);
  assert.deepEqual(first.games[0].score, [33, 33]);
  f.advance(); f.set(40, 18);
  const second = await f.service()(5);
  assert.deepEqual(second.games[0].score, [40, 33]);
  assert.equal(f.calls.filter(u => u.includes('jornada=')).length, 2);
});
test('two lagging official routes cannot overwrite a later live score or reset its age', async () => {
  const f = fixture(), load = f.service();
  const first = await load(5);
  f.advance(); f.set(18, 18);
  const old = await f.service()(5);
  assert.deepEqual(old.games[0].score, [33, 33]);
  assert.equal(old.games[0].checkedAt, first.games[0].checkedAt);
  assert.equal(old.games[0].stale, true);
  assert.doesNotMatch(render(old), /class="live-dot"/);
  assert.match(render(old), /Dades antigues/);
  f.advance(); f.set(42, 42);
  assert.deepEqual((await load(5)).games[0].score, [42, 33]);
});
test('an advancing independent route can replace a regressing query', async () => {
  const f = fixture(), load = f.service();
  await load(5); f.advance(); f.set(18, 40);
  const next = await load(5);
  assert.deepEqual(next.games[0].score, [40, 33]);
  assert.equal(next.games[0].stale, false);
});
test('a cold instance also contrasts the explicit round with the observed context', async () => {
  const f = fixture(); f.set(18, 40);
  assert.deepEqual((await f.service()(5)).games[0].score, [40, 33]);
});
test('confirmed final corrections remain possible without reverting to an earlier period', async () => {
  const f = fixture(), load = f.service();
  await load(5); f.advance(); f.set(32, 32, 'FINALIZED', 2);
  const corrected = await load(5);
  assert.deepEqual(corrected.games[0].score, [32, 33]);
  assert.equal(corrected.games[0].state, 'final');
  assert.equal(corrected.games[0].stale, false);
});
test('a live 0-0 cannot become not-started even when scores and quarter are unchanged', async () => {
  const f = fixture(), load = f.service();
  f.set(0, 0); await load(5);
  f.advance(); f.set(0, 0, 'NOT_STARTED');
  const old = await load(5);
  assert.equal(old.games[0].state, 'live');
  assert.equal(old.games[0].stale, true);
  assert.doesNotMatch(render(old), /class="live-dot"/);
});
test('an explicit official suspension is not confused with a not-started regression', async () => {
  const f = fixture(), load = f.service();
  await load(5); f.advance(); f.set(0, 0, 'SUSPENDED');
  const suspended = await load(5);
  assert.equal(suspended.games[0].state, 'unavailable');
  assert.equal(suspended.games[0].stale, false);
  assert.equal(suspended.games[0].score, null);
});
test('a retained cold context survives context expiry and a fresh service instance', async () => {
  const f = fixture(); f.set(18, 40);
  let contextCalls = 0;
  const request = async url => {
    if (url.includes('clasificacion')) throw new Error('not needed');
    const isContext = !url.includes('jornada=');
    if (isContext) contextCalls++;
    const score = isContext && contextCalls === 1 ? 40 : 18;
    return new Response(html({ selectedFilters: { season: 91, round: 6020 }, availableFilters: { seasons: [{ id: 91, startYear: 2026 }], rounds: [{ id: 6020, roundNumber: 5 }] }, matches: [{ id: 1, homeTeam: { shortName: 'Home' }, awayTeam: { shortName: 'Away' }, startDateTime: '2026-10-31T20:00:00Z', homeScore: score, awayScore: 33, matchStatus: 'STARTED', currentQuarter: 2 }] }));
  };
  let time = start;
  const cache = { get: async k => structuredClone(f.storage.get(k)), set: async (k, v) => f.storage.set(k, structuredClone(v)) };
  const make = () => createService({ cache, now: () => time, fetch: request });
  const first = await make()(5);
  assert.deepEqual(first.games[0].score, [40, 33]);
  time += 301000;
  const second = await make()(5);
  assert.deepEqual(second.games[0].score, [40, 33]);
  assert.equal(second.games[0].checkedAt, first.games[0].checkedAt);
  assert.equal(second.games[0].stale, true);
});
test('a final published while an async witness is being checked is reconciled again', async () => {
  const { createSourceCache } = require('../lib/source-cache');
  const storage = new Map(); let time = start, release, started;
  const ready = new Promise(resolve => { started = resolve; });
  const cache = { get: async k => structuredClone(storage.get(k)), set: async (k, v) => storage.set(k, structuredClone(v)) };
  const first = createSourceCache(cache, () => time), other = createSourceCache(cache, () => time);
  await first('witness-race', 20, async () => ({ final: false, score: 80 }));
  time += 21000;
  let checks = 0;
  const pending = first('witness-race', 20, async () => ({ final: false, score: 70 }), 1000, { reconcile: async (next, previous) => {
    checks++;
    if (checks === 1) { started(); await new Promise(resolve => { release = resolve; }); }
    return previous?.value.final ? { ...previous, stale: true } : next;
  } });
  await ready;
  time += 1000;
  await other('witness-race', 20, async () => ({ final: true, score: 100 }));
  release();
  const result = await pending;
  assert.equal(result.value.final, true);
  assert.equal(result.at, time);
  assert.equal([...storage.values()][0].value.score, 100);
  assert.equal(checks, 2);
});
test('a late concurrent response cannot undo a final already saved by another instance', async () => {
  const { createSourceCache } = require('../lib/source-cache');
  const storage = new Map(); let time = start, finish;
  const cache = { get: async k => structuredClone(storage.get(k)), set: async (k, v) => storage.set(k, structuredClone(v)) };
  const slow = createSourceCache(cache, () => time), fast = createSourceCache(cache, () => time);
  const pending = slow('race', 20, () => new Promise(resolve => { finish = resolve; }), 1000, { reconcile: (next, previous) => previous?.value.final ? { ...previous, stale: true } : next });
  await new Promise(resolve => setImmediate(resolve));
  time += 1000; await fast('race', 20, async () => ({ final: true, score: 100 }));
  finish({ final: false, score: 80 });
  assert.equal((await pending).value.final, true);
  assert.equal([...storage.values()][0].value.score, 100);
});

