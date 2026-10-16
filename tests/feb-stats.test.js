const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, createService } = require('../lib/feb-stats');
const { render } = require('../lib/feb-stats-page');
const { refreshPolicy } = require('../lib/refresh-policy');
const now = Date.parse('2026-10-16T18:00:00Z');
function body(status = 'FINISHED') {
  const teams = [{ id: '1', clubCode: '460031', name: 'CB TABERNES BLANQUES', pts: '72' }, { id: '2', clubCode: '2', name: 'Club B', pts: '83' }];
  return { HEADER: { competition: 'TERCERA FEB', round: '"E-A" ', statusText: status, status: status === 'FINISHED' ? '3' : '2', time: status === 'FINISHED' ? 'FINAL' : '04:32', quarter: 3, starttime: '16-10-2026 - 19:00', TEAM: teams, QUARTERS: { QUARTER: [{ n: '1', scoreA: '14', scoreB: '23' }] } }, BOXSCORE: { TEAM: teams.map(t => ({ ...t, PLAYER: [{ name: 'Jugador <A>', no: '4', minFormatted: '12:05', pts: '8', rt: '3', assist: '2', val: '-1', p2m: '4', p2a: '5' }], TOTAL: { name: t.name, pts: t.pts, minFormatted: '200:00' } })) } };
}
test('FEB boxscore validates category, group, club and team identities', () => {
  const wrongGroup = body(); wrongGroup.HEADER.round = 'E-B';
  assert.throws(() => normalize(wrongGroup, 1), { status: 400 });
  const wrongClub = body(); wrongClub.HEADER.TEAM[0].clubCode = '999';
  assert.throws(() => normalize(wrongClub, 1), { status: 400 });
  const wrongTeam = body(); wrongTeam.BOXSCORE.TEAM[0].name = 'Another club';
  assert.throws(() => normalize(wrongTeam, 1), /mismatch/);
});
test('live statistics preserve the official clock and refresh policy; completed statistics stop polling', () => {
  const live = normalize(body('IN_PROGRESS'), 123);
  live.generatedAt = now;
  assert.equal(live.games[0].state, 'live');
  assert.equal(live.games[0].label, 'En joc · 3Q · 04:32');
  assert.equal(refreshPolicy(live).delay, 30000);
  const ended = normalize(body(), 123); ended.generatedAt = now;
  assert.equal(refreshPolicy(ended).delay, 0);
  const pending = body('SCHEDULED'); pending.HEADER.status = '1'; pending.HEADER.time = ''; pending.BOXSCORE = null;
  const pre = normalize(pending, 123);
  assert.equal(pre.games[0].score, null);
  assert.equal(pre.teams[0].players.length, 0);
});
test('lightweight tables escape player names, keep missing stats blank and preserve return navigation', () => {
  const data = normalize(body(), 123); data.generatedAt = now;
  const html = render(data, { round: '2', auto: false, detail: true });
  assert.match(html, /Jugador &lt;A&gt;/);
  assert.match(html, /4\/5/);
  assert.match(html, /jornada=2&amp;auto=0/);
  assert.match(html, /Fitxa oficial FEB/);
  assert.doesNotMatch(html, /Authorization|Bearer|contentToken|intrafeb|<iframe/);
  assert.equal(data.teams[0].players[0].shots[1], null);
});
test('stats service refreshes changing live scores and retains the original timestamp on source failure', async () => {
  let clock = now, calls = 0, fail = false;
  const load = createService({ now: () => clock, request: async url => {
    if (url.includes('baloncestoenvivo')) return new Response('<div id="contentToken"><input value="public-test-session"></div>');
    calls++;
    if (fail) throw new Error('Source offline');
    const b = body('IN_PROGRESS'); b.HEADER.TEAM[0].pts = String(20 + calls);
    return Response.json(b);
  } });
  const first = await load('123');
  assert.equal(first.games[0].score[0], 21);
  clock += 31000;
  const second = await load('123');
  assert.equal(second.games[0].score[0], 22);
  clock += 31000; fail = true;
  const old = await load('123');
  assert.equal(old.games[0].score[0], 22);
  assert.equal(old.games[0].checkedAt, second.games[0].checkedAt);
  assert.equal(old.games[0].stale, true);
  assert.doesNotMatch(render(old), /class="live-dot"/);
});
test('TV emits separate tables for Madrid calendar days, keeping late UTC fixtures on their local day', () => {
  const event = { competition: 'E', title: 'A - B', source: 'https://www.movistarplus.es', channels: [{ name: 'Canal', dial: '66', source: 'https://www.movistarplus.es' }] };
  const html = require('../lib/tv-page').render({ generatedAt: now, sourcesAt: now, errors: [], events: [{ ...event, date: '2026-10-16T23:00:00Z' }, { ...event, date: '2026-10-17T18:00:00Z' }, { ...event, date: '2026-10-18T18:00:00Z' }] });
  assert.equal((html.match(/<table /g) || []).length, 2);
  assert.match(html, /dissabte 17\/10/);
  assert.match(html, /diumenge 18\/10/);
  assert.match(html, /01:00/);
});
