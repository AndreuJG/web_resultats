const test = require('node:test');
const assert = require('node:assert/strict');
const { createService, gameView, parseHeader, parseGames, parseStandings, seasonAt } = require('../lib/euroleague');
const { render, renderError } = require('../lib/euroleague-page');

const now = Date.parse('2026-10-16T19:00:00Z');
const game = { code: 58, round: 6, date: '2026-10-16T18:30:00Z', played: false, status: 'Confirmed', home: { code: 'BAR', name: 'Barcelona', score: 0 }, away: { code: 'OLY', name: 'Olympiacos', score: 0 } };
const header = { Live: true, CodeTeamA: 'BAR', CodeTeamB: 'OLY', ScoreA: '57', ScoreB: '62', Quarter: '3', RemainingPartialTime: '04:54', GameTime: '25:00' };

test('live score overrides the 0-0 in the schedule and preserves the official clock', () => {
  const view = gameView(game, { value: parseHeader(header, game), at: now, stale: false }, now);
  assert.deepEqual(view.score, [57, 62]);
  assert.equal(view.state, 'live');
  assert.match(view.label, /3Q.*04:54/);
});

test('a missing live feed never turns a started fixture into a 0-0 or an invented live game', () => {
  const view = gameView(game, null, now);
  assert.equal(view.score, null);
  assert.equal(view.state, 'unavailable');
  assert.equal(gameView({ ...game, date: '2026-10-17T18:30:00Z' }, null, now).state, 'scheduled');
});

test('old live values are explicitly marked as old', () => {
  const view = gameView(game, { value: parseHeader(header, game), at: now - 180000, stale: true }, now);
  assert.match(view.label, /Dades antigues/);
  assert.doesNotMatch(view.label, /En joc/);
});

test('a finished game is final even while the schedule still has not updated', () => {
  const final = parseHeader({ ...header, Live: false, GameTime: '40:00', RemainingPartialTime: '00:00', Quarter: '' }, game);
  assert.equal(gameView(game, { value: final, at: now, stale: false }, now).state, 'final');
});

test('invalid scores, incorrect team identities and partial schedules are rejected', () => {
  assert.throws(() => parseHeader({ ...header, ScoreA: '' }, game));
  assert.throws(() => parseHeader({ ...header, CodeTeamB: 'OTHER' }, game));
  assert.throws(() => parseGames({ data: [{}], total: 380 }));
});

test('source failure preserves the last valid score and marks it stale', async () => {
  let time = now, fail = false;
  const sourceGame = { ...game, gameCode: game.code, utcDate: game.date, gameStatus: 'Confirmed', local: { club: { code: 'BAR', name: 'Barcelona' }, score: 0 }, road: { club: { code: 'OLY', name: 'Olympiacos' }, score: 0 } };
  const load = createService({ now: () => time, fetch: async url => {
    if (url.includes('/api/Header')) {
      if (fail) throw new Error('Feed unavailable');
      return Response.json(header);
    }
    if (new URL(url).pathname.endsWith('/games')) return Response.json({ data: [sourceGame], total: 1 });
    return Response.json([{ group: { rawName: 'Regular Season' }, standings: [{ club: { name: 'Barcelona' }, data: { position: 1, gamesPlayed: 1, gamesWon: 1, gamesLost: 0 } }] }]);
  } });
  const first = await load(null);
  assert.deepEqual(first.games[0].score, [57, 62]);
  time += 20000; fail = true;
  const second = await load(null);
  assert.deepEqual(second.games[0].score, [57, 62]);
  assert.equal(second.games[0].stale, true);
  assert.equal(second.games[0].checkedAt, now);
});

test('rendering escapes feed names and does not require client-side fetching', () => {
  const html = render({ season: 'E2026', round: 6, rounds: [6], games: [{ ...gameView(game, null, now), home: { name: '<script>bad()</script>' } }], standings: null, generatedAt: now });
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>bad/);
  assert.match(html, /Marcador no disponible/);
  assert.match(html, /<form[^>]*method="get"/);
  assert.match(html, /<button type="submit">Mostra<\/button>/);
});

test('season rolls over in July, not January', () => {
  assert.equal(seasonAt(Date.parse('2027-01-01T00:00:00Z')), 'E2026');
  assert.equal(seasonAt(Date.parse('2027-07-01T00:00:00Z')), 'E2027');
});

test('EuroCup requests use U seasons and cannot reuse EuroLeague entries in the shared cache', async () => {
  const storage = new Map(), urls = [];
  const cache = { get: async key => storage.get(key), set: async (key, value) => storage.set(key, value) };
  const fetchSource = async url => {
    urls.push(url);
    if (url.includes('/api/Header')) return Response.json(header);
    if (new URL(url).pathname.endsWith('/games')) return Response.json({ total: 1, data: [{ gameCode: 58, round: 6, utcDate: game.date, played: false, group: { rawName: 'A' }, local: { club: { code: 'BAR', name: 'Local' }, score: 0 }, road: { club: { code: 'OLY', name: 'Visitant' }, score: 0 } }] });
    return Response.json([{ group: { rawName: 'A', order: 1 }, standings: [{ club: { name: 'Local' }, data: { position: 1, gamesPlayed: 1, gamesWon: 1, gamesLost: 0 } }] }]);
  };
  await createService({ competition: 'E', now: () => now, cache, fetch: fetchSource })(null);
  const cup = await createService({ competition: 'U', now: () => now, cache, fetch: fetchSource })(null);
  assert.equal(cup.season, 'U2026');
  assert.ok(urls.some(url => url.includes('/competitions/U/seasons/U2026/games')));
  assert.ok(urls.some(url => url.includes('/competitions/U/seasons/U2026/rounds/6/standings')));
  assert.ok(urls.some(url => url.includes('seasoncode=U2026')));
  assert.deepEqual(cup.games[0].score, [57, 62]);
  const html = render(cup);
  assert.match(html, /<title>EuroCup masculina/);
  assert.match(html, /action="\/eurocup.html"/);
  assert.match(html, /class="live-dot"/);
  assert.doesNotMatch(html, /href="\/eurolliga.html/);
  assert.match(renderError('Error', 'U'), /href="\/eurocup.html"/);
});

test('EuroCup standings keep separate groups in their official order', () => {
  const row = name => ({ club: { name }, data: { position: 1, gamesPlayed: 3, gamesWon: 2, gamesLost: 1 } });
  const groups = parseStandings([{ group: { rawName: 'B', order: 2 }, standings: [row('Club B')] }, { group: { rawName: 'A', order: 1 }, standings: [row('Club A')] }]);
  assert.deepEqual(groups.map(g => g.name), ['Grup A', 'Grup B']);
  const html = render({ competition: 'U', season: 'U2026', round: 3, rounds: [3], games: [], standings: { value: groups, at: now }, generatedAt: now });
  assert.ok(html.indexOf('Grup A') < html.indexOf('Grup B'));
  assert.equal((html.match(/<table>/g) || []).length, 3);
});
