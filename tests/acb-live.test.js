const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHeader } = require('../lib/acb-live');
const { createService } = require('../lib/acb');
const { render } = require('../lib/euroleague-page');
const start = Date.parse('2026-10-31T21:55:00Z');
const base = { id: 105422, startDateTime: '2026-10-31T20:00:00Z', matchStatus: 'STARTED', currentQuarter: 4, homeScore: 86, awayScore: 85, homeTeam: { id: 4480, shortName: 'Leyma Coruña' }, awayTeam: { id: 4478, shortName: 'La Laguna TFE' } };
const header = () => ({ matchId: 105422, competitionId: 1, start: base.startDateTime, status: 'STARTED', currentQuarter: 4, currentHomeScore: 89, currentAwayScore: 85, timeLeft: '00:46', teams: { home: { id: 4480, competitionId: 1, editionId: 91 }, away: { id: 4478, competitionId: 1, editionId: 91 } } });
const html = data => '<script>self.__next_f.push(' + JSON.stringify([1, 'a:' + JSON.stringify(data) + '\n']) + ')</script>';
test('official match header validates game, both teams, edition, competition, start and scores', () => {
  assert.deepEqual(parseHeader(header(), base, 91).score, [89, 85]);
  for (const override of [{ matchId: 1 }, { competitionId: 2 }, { start: '2020-01-01' }, { currentHomeScore: '89' }, { status: 'UNKNOWN' }]) assert.throws(() => parseHeader({ ...header(), ...override }, base, 91));
  assert.throws(() => parseHeader(header(), base, 90));
  const h = header(); h.teams.away.id = 10;
  assert.throws(() => parseHeader(h, base, 91));
  assert.equal(parseHeader({ ...header(), timeLeft: 'garbage' }, base, 91).label, 'En joc · 4Q');
});
test('changing live match header overrides a frozen calendar and retains the original age on outage', async () => {
  let time = start, points = 89, status = 'STARTED', fail = false;
  const calls = [];
  const load = createService({ now: () => time, fetch: async url => {
    calls.push(url);
    if (url.startsWith('https://live.acb.com/')) {
      if (fail) throw new Error('detail offline');
      return new Response(html({ ...header(), currentHomeScore: points, status }));
    }
    if (url.includes('clasificacion')) throw new Error('table unused');
    return new Response(html({ selectedFilters: { season: 91, round: 6020 }, availableFilters: { seasons: [{ id: 91, startYear: 2026 }], rounds: [{ id: 6020, roundNumber: 6 }] }, matches: [base] }));
  } });
  let d = await load(6);
  assert.deepEqual(d.games[0].score, [89, 85]);
  assert.match(d.games[0].label, /00:46/);
  assert.match(render(d), /class="live-dot"/);
  points = 91; time += 31000;
  d = await load(6);
  assert.deepEqual(d.games[0].score, [91, 85]);
  const at = d.games[0].checkedAt;
  fail = true; time += 31000;
  d = await load(6);
  assert.equal(d.games[0].checkedAt, at);
  assert.equal(d.games[0].stale, true);
  assert.doesNotMatch(render(d), /class="live-dot"/);
  fail = false; status = 'FINALIZED'; time += 31000;
  d = await load(6);
  assert.equal(d.games[0].state, 'final');
  assert.equal(d.games[0].stale, false);
  const requests = calls.filter(u => u.startsWith('https://live.acb.com/')).length;
  time += 31000; await load(6);
  assert.equal(calls.filter(u => u.startsWith('https://live.acb.com/')).length, requests);
  assert.ok(calls.every(u => !u.includes('api2.acb.com')));
});
test('a flat explicit round is contrasted even without a decrease', async () => {
  let time = start, general = 86;
  const load = createService({ now: () => time, fetch: async url => {
    if (url.includes('clasificacion')) throw new Error('unused');
    return new Response(html({ selectedFilters: { season: 91, round: 6020 }, availableFilters: { seasons: [{ id: 91, startYear: 2026 }], rounds: [{ id: 6020, roundNumber: 6 }] }, matches: [{ ...base, homeTeam: { shortName: 'Home' }, awayTeam: { shortName: 'Away' }, homeScore: url.includes('jornada=') ? 86 : general }] }));
  } });
  await load(6); general = 89; time += 21000;
  assert.deepEqual((await load(6)).games[0].score, [89, 85]);
});
test('a cold or cached detail cannot move the visible calendar score backwards', async () => {
  const load = createService({ now: () => start, fetch: async url => {
    if (url.startsWith('https://live.acb.com/')) return new Response(html({ ...header(), currentHomeScore: 86 }));
    if (url.includes('clasificacion')) throw new Error('unused');
    return new Response(html({ selectedFilters: { season: 91, round: 6020 }, availableFilters: { seasons: [{ id: 91, startYear: 2026 }], rounds: [{ id: 6020, roundNumber: 6 }] }, matches: [{ ...base, homeScore: 89 }] }));
  } });
  for (let n = 0; n < 2; n++) {
    const d = await load(6);
    assert.deepEqual(d.games[0].score, [89, 85]);
    assert.equal(d.games[0].stale, true);
    assert.doesNotMatch(render(d), /class="live-dot"/);
  }
});
