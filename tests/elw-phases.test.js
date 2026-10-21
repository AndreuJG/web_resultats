const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize } = require('../lib/fiba');
const { render } = require('../lib/euroleague-page');
const now = Date.parse('2026-10-21T19:00:00Z');
const teams = Array.from({ length: 6 }, (_, n) => ({ teamId: n + 1, code: 'T' + (n + 1), officialName: 'Equip ' + (n + 1) }));
function game(id, name, date, extra = {}) {
  return { gameId: id, competition: { competitionCode: 'ELW', start: '2026-09-23' },
    round: { roundId: id, roundName: name, ...extra }, gameDateTimeUTC: date, hasTimeGameDateTime: true,
    teamA: teams[0], teamB: teams[1], groupPairingCode: name.includes('Round') ? 'A' : '1', isLive: false, liveGameStatus: 1, gameResultStatusCode: 'EMPTY' };
}
function table(id, name, count = 4, played = 1) {
  return { standingHeaderName: name, roundIds: [id], type: 'groups', data: { groups: [{ groupName: 'A', teamsStats: teams.slice(0, count).map((t, i) => ({ team: t.teamId, rank: i + 1, gamesPlayed: played, gamesWon: played, gamesLost: 0 })) }] } };
}
function page(data, auto = true) {
  data.generatedAt = now;
  if (data.standings) data.standings.at = now;
  return render(data, auto);
}
const games = [
  game(1, 'Semi-Final Path 1', '2026-09-23T16:00:00', { roundKind: 'Qualifiers' }),
  game(2, 'Semi-Finals Path 4', '2026-09-23T17:00:00', { roundKind: 'Qualifiers' }),
  game(3, 'Final Path 1', '2026-09-30T16:00:00', { roundKind: 'Qualifiers' }),
  game(4, 'Regular Season - First Round', '2026-10-21T17:00:00'),
  game(5, 'Regular Season - Second Round', '2026-12-16T17:00:00'),
  game(6, 'Semi-Final Play-In', '2027-02-24T17:00:00'),
  game(7, 'Quarter-Final Play-In', '2027-02-24T17:00:00'),
  game(8, 'Quarter-Finals', '2027-04-14T17:00:00'),
  game(9, 'Semi-Finals', '2027-04-16T17:00:00'),
  game(10, 'Final', '2027-04-18T17:00:00')
];
// Include the teams referenced by the whole standings, just as the official calendar does.
games.push({ ...games[3], gameId: 11, teamA: teams[2], teamB: teams[3] });
games.push({ ...games[4], gameId: 12, teamA: teams[4], teamB: teams[5] });
const items = [
  { type: 'flat', standingHeaderName: 'Qualifiers Path 1', roundIds: [1, 3], data: {} },
  { type: 'flat', standingHeaderName: 'Qualifiers Path 4', roundIds: [2], data: {} },
  table(4, 'First Round'), table(5, 'Second Round', 6, 0),
  { type: 'flat', standingHeaderName: 'Play-Ins', roundIds: [6, 7], data: {} },
  { type: 'bracket', standingHeaderName: 'Final Six', roundIds: [8, 9, 10], data: {} }
];

test('ELW selector separates five stages without changing existing selection numbers or fixtures', () => {
  const data = normalize(games, items, 'ELW', 4, now);
  assert.deepEqual(data.roundSections.map(s => s.label), ['Fase prèvia', 'Primera fase · Grups A–D', 'Segona fase · Grups E–F', 'Play-in', 'Final Six']);
  assert.deepEqual(data.rounds, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(data.roundSections.flatMap(s => s.rounds).length, data.rounds.length);
  assert.equal(data.games.length, 2);
  const html = page(data);
  assert.equal((html.match(/<optgroup /g) || []).length, 5);
  assert.match(html, /<option value="4" selected>Primera fase/);
  assert.doesNotMatch(html, /Semi-Finals? Path|Final Path/);
  assert.match(html, /Fase prèvia · Final · Camí 1/);
  assert.match(html, /Final Six · Final/);
  assert.match(html, /Play-in de semifinals/);
  assert.match(html, /· Grup A/);
});

test('selecting the preliminary knockout stage never shows the regular-season table', () => {
  const data = normalize(games, items, 'ELW', 3, now);
  assert.equal(data.standings, null);
  assert.equal(data.standingsTitle, 'Classificació · Fase prèvia');
  assert.match(data.standingsMessage, /eliminatòria/);
  assert.equal(data.currentStandingsRound, 4);
  const html = page(data, false);
  assert.match(html, /jornada=4&amp;auto=0#classificacio/);
  assert.match(html, /Consulta la classificació actual/);
  assert.doesNotMatch(html, /class="zones-legend"/);
  assert.doesNotMatch(html, /· Grup 1/);
});

test('an unstarted second phase does not borrow first-round standings or mark zero-game seed ranks', () => {
  const data = normalize(games, items, 'ELW', 5, now);
  assert.equal(data.standings, null);
  assert.equal(data.standingsTitle, 'Classificació · Segona fase · Grups E–F');
  assert.match(data.standingsMessage, /encara no està publicada/);
  assert.equal(data.currentStandingsRound, 4);
});

test('manual first-phase selection retains its own standings even when the second phase is active', () => {
  const published = items.map(i => i.roundIds.includes(5) ? table(5, 'Second Round', 6, 2) : i);
  const first = normalize(games, published, 'ELW', 4, Date.parse('2026-12-17T12:00:00Z'));
  assert.equal(first.standings.phase, 'First Round');
  assert.equal(first.standings.value[0].teams.length, 4);
  assert.equal(first.standingsTitle, 'Classificació · Primera fase');
  const second = normalize(games, published, 'ELW', 5, Date.parse('2026-12-17T12:00:00Z'));
  assert.equal(second.standings.phase, 'Second Round');
  assert.equal(second.standings.value[0].teams.length, 6);
});

test('play-in and Final Six views show knockout context and a separate link to the latest published league table', () => {
  for (const selection of [6, 7, 8, 9, 10]) {
    const data = normalize(games, items, 'ELW', selection, now);
    assert.equal(data.standings, null);
    assert.match(data.standingsMessage, /eliminatòria/);
    assert.equal(data.currentStandingsRound, 4);
    assert.match(page(data), /Consulta la classificació actual/);
  }
});

test('a failed standings source never substitutes another phase and other FIBA competitions keep their existing behavior', () => {
  const data = normalize(games, undefined, 'ELW', 5, now);
  assert.equal(data.standings, null);
  assert.equal(data.currentStandingsRound, undefined);
  const bclGames = games.filter(g => g.round.roundId >= 4).map(g => ({ ...g, competition: { competitionCode: 'BCL', start: '2026-10-06' } }));
  const bcl = normalize(bclGames, items, 'BCL', 5, now);
  assert.equal(bcl.standings.phase, 'First Round');
  assert.equal(bcl.roundSections, undefined);
});
