const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, utcDate, sourceUrls } = require('../lib/fiba');
const { render } = require('../lib/euroleague-page');
const now = Date.parse('2026-10-16T12:00:00Z');
function game(overrides = {}) {
  return { gameId: 1, competition: { competitionCode: 'BCL', start: '2026-10-06' }, round: { roundId: 31110, roundName: 'Regular Season', roundNumber: 1 }, gameDateTimeUTC: '2026-10-14T17:00:00', hasTimeGameDateTime: true, teamA: { teamId: 1, officialName: 'Club A', code: 'A' }, teamB: { teamId: 2, officialName: 'Club B', code: 'B' }, teamAScore: 0, teamBScore: 0, isLive: false, liveGameStatus: 1, gameResultStatusCode: 'EMPTY', groupPairingCode: 'A', ...overrides };
}
function page(data) {
  data.generatedAt = now;
  if (data.standings) data.standings.at = now;
  return render(data);
}
test('FIBA UTC values without timezone retain Madrid summer/winter times and unknown dates stay unknown', () => {
  assert.equal(utcDate('2026-10-14T17:00:00'), '2026-10-14T17:00:00.000Z');
  assert.equal(utcDate('0001-01-01T00:00:00'), null);
  let data = normalize([game()], [], 'BCL', null, now);
  assert.match(page(data), /dimecres, 14\/10 · 19:00/);
  data = normalize([game({ gameDateTimeUTC: '2027-01-13T17:00:00' })], [], 'BCL', null, now);
  assert.match(page(data), /dimecres, 13\/01 · 18:00/);
});
test('FIBA marks live only on explicit source state and preserves score and clock', () => {
  const data = normalize([game(), game({ gameId: 2, isLive: true, teamAScore: 25, teamBScore: 21, currentPeriod: 'Q2', chrono: '04:32' }), game({ gameId: 3, liveGameStatus: 999, teamAScore: 76, teamBScore: 75 })], [], 'BCL', null, now);
  assert.equal(data.games[0].score, null);
  assert.equal(data.games[0].state, 'scheduled');
  assert.deepEqual(data.games[1].score, [25, 21]);
  assert.equal(data.games[1].label, 'En joc · Q2 · 04:32');
  assert.equal(data.games[2].state, 'final');
  const html = page(data);
  assert.equal((html.match(/class="live-dot"/g) || []).length, 1);
  assert.doesNotMatch(html, />0 – 0</);
});
test('FIBA selection uses weeks and isolates standings by phase while preserving official ranks', () => {
  const first = { type: 'groups', standingHeaderName: 'Regular Season', roundIds: [31110], data: { groups: [{ groupName: 'A', teamsStats: [{ rank: 2, team: 1, gamesPlayed: 1, gamesWon: 0, gamesLost: 1 }, { rank: 1, team: 2, gamesPlayed: 1, gamesWon: 1, gamesLost: 0 }] }] } };
  const other = { ...first, roundIds: [31112], data: { groups: [{ groupName: 'WRONG', teamsStats: first.data.groups[0].teamsStats }] } };
  const data = normalize([game(), game({ gameId: 2, round: { roundId: 31112, roundName: 'Round of 16' }, gameDateTimeUTC: '2027-02-03T17:00:00' })], [other, first], 'BCL', null, now);
  assert.equal(data.roundLabel, 'Fase regular · Setmana del 12/10');
  assert.equal(data.standings.value[0].name, 'Grup A');
  assert.equal(data.standings.value[0].teams[0].name, 'Club B');
  assert.throws(() => normalize([game()], [], 'BCL', 999, now), { status: 400 });
  assert.throws(() => normalize([game()], [], 'ELW', null, now), /Unexpected FIBA competition/);
});
test('future knockouts have no epoch dates, fake scores or league standings', () => {
  const data = normalize([game({ gameDateTimeUTC: '0001-01-01T00:00:00', hasTimeGameDateTime: false, teamA: null, teamB: null })], [{ type: 'bracket', roundIds: [31110], data: {} }], 'BCL', null, now);
  const html = page(data);
  assert.match(html, /Data per confirmar/);
  assert.match(html, /Pendent de classificació/);
  assert.match(html, /fase és eliminatòria/);
  assert.doesNotMatch(html, /1970|0001|0 – 0|Jornada 1/);
});
test('official BCL club codes retain editorial labels without inferring country from venue', () => {
  const data = normalize([game({ hostCountryCode: 'ISR', teamB: { teamId: 2, code: 'HERZ', officialName: 'Bnei Penlink Herzliya' } })], [], 'BCL', null, now);
  assert.equal(data.games[0].home.country, undefined);
  assert.equal(data.games[0].away.country, 'ISR');
  assert.match(page(data), /Los genocidas de Bnei Penlink Herzliya/);
  assert.equal(sourceUrls('ELW', now).gamesUrl, 'https://www.fiba.basketball/en/events/euroleague-women-26-27/games');
});
