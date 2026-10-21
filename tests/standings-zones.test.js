const test = require('node:test');
const assert = require('node:assert/strict');
const { zonesFor } = require('../lib/standings-zones');
const { render } = require('../lib/euroleague-page');
const { normalize: fiba } = require('../lib/fiba');
const { normalize: acb } = require('../lib/acb');

function table(competition, count, phase, name = 'Grup A') {
  const season = ({ E: 'E2026', U: 'U2026', ACB: 'A2026' })[competition] || 'F2026';
  const group = { name, teams: Array.from({ length: count }, (_, i) => ({ position: i + 1, name: 'Equip ' + (i + 1), played: 2, won: 1, lost: 1 })) };
  return { competition, season, round: 1, rounds: [1, 2], games: [], standings: { value: [group], phase, round: 2, at: Date.now() } };
}
const rule = data => zonesFor(data, data.standings.value[0]);
const code = (data, position) => rule(data)?.zones.find(z => position >= z.from && position <= z.to)?.code;

test('EuroLeague direct playoff and play-in boundaries do not mark eliminated ranks as relegation', () => {
  const data = table('E', 20, undefined, 'Regular Season');
  assert.deepEqual([1, 6, 7, 10, 11, 20].map(p => code(data, p)), ['PL', 'PL', 'PI', 'PI', undefined, undefined]);
  data.standings.round = 39;
  assert.equal(rule(data), null);
});

test('EuroCup uses the new 2026-27 four-of-eight format in each group', () => {
  for (const name of ['Grup A', 'Grup B', 'Grup C', 'Grup D']) {
    const data = table('U', 8, undefined, name);
    assert.equal(code(data, 4), 'OF');
    assert.equal(code(data, 5), undefined);
  }
  assert.equal(rule(table('U', 10, undefined)), null);
  const data = table('U', 8, undefined);
  data.standings.round = 15;
  assert.equal(rule(data), null);
});

test('ACB has eight playoff places and two direct relegations only in a verified regular table', () => {
  const data = table('ACB', 18, 'regular-season');
  assert.deepEqual([8, 9, 16, 17, 18].map(p => code(data, p)), ['PL', undefined, undefined, 'D', 'D']);
  data.standings.phase = 'Playoff';
  assert.equal(rule(data), null);
});

test('EuroLeague Women distinguishes second round, EuroCup transfer and both types of play-in', () => {
  const first = table('ELW', 4, 'Regular Season - First Round');
  assert.equal(code(first, 3), '2F');
  assert.equal(code(first, 4), 'EC');
  const second = table('ELW', 6, 'Regular Season - Second Round');
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(p => code(second, p)), ['SF', 'SF', 'QF', 'QF', undefined, undefined]);
  assert.equal(rule(table('ELW', 4, 'Qualifiers')), null);
});

test('BCL regular season and Round of 16 have different qualification boundaries', () => {
  const data = table('BCL', 4, 'Regular Season');
  assert.deepEqual([1, 2, 3, 4].map(p => code(data, p)), ['16', 'PI', 'PI', undefined]);
  data.standings.phase = 'Round of 16';
  assert.deepEqual([1, 2, 3, 4].map(p => code(data, p)), ['QF', 'QF', undefined, undefined]);
  data.standings.phase = 'Quarter-Finals';
  assert.equal(rule(data), null);
});

test('unknown seasons, phases, incomplete tables and unverified competitions stay unmarked', () => {
  for (const competition of ['LF', 'TERCERA_EA', 'ESM', 'ESW']) assert.equal(rule(table(competition, 4, 'First Round')), null);
  for (const season of ['F2025', 'F2027', undefined]) {
    const data = table('ELW', 4, 'First Round'); data.season = season;
    assert.equal(rule(data), null);
  }
  assert.equal(rule(table('BCL', 4, undefined)), null);
  const incomplete = table('BCL', 4, 'Regular Season');
  incomplete.standings.value[0].teams[3].position = 3;
  assert.equal(rule(incomplete), null);
});

test('HTML has text markers, accessible legends and keeps Valencia orange/bold with no new client script', () => {
  const data = table('ELW', 4, 'First Round');
  data.standings.value[0].teams[0] = { ...data.standings.value[0].teams[0], name: 'Valencia Basket Club', country: 'ESP' };
  const html = render(data);
  assert.match(html, /aria-describedby="zones-0"/);
  assert.match(html, /aria-label="Zona de Segona fase">2F/);
  assert.match(html, /1–3: Segona fase/);
  assert.match(html, /4: EuroCup femenina/);
  assert.match(html, /no indiquen classificació assegurada/);
  assert.match(html, /<span class="valencia-basket"><strong>Valencia Basket Club<\/strong><\/span>/);
  assert.equal((html.match(/<script /g) || []).length, 1);
  assert.doesNotMatch(render(table('LF', 16)), /class="zones-legend"|class="zone zone-/);
});

test('ELW automatic view labels the real standings phase, while a manual future phase does not borrow that table', () => {
  const team = n => ({ teamId: n, officialName: 'Equip ' + n, code: 'T' + n });
  const game = (id, a, b, phase, name, date) => ({ gameId: id, competition: { competitionCode: 'ELW', start: '2026-10-14' }, round: { roundId: phase, roundName: name }, gameDateTimeUTC: date, hasTimeGameDateTime: true, teamA: team(a), teamB: team(b), isLive: false });
  const games = [game(1, 1, 2, 10, 'First Round', '2026-10-14T17:00:00'), game(2, 3, 4, 10, 'First Round', '2026-10-14T17:00:00'), game(3, 1, 2, 20, 'Second Round', '2026-12-16T17:00:00')];
  const items = [{ type: 'groups', standingHeaderName: 'Regular Season - First Round', roundIds: [10], data: { groups: [{ groupName: 'A', teamsStats: [1, 2, 3, 4].map(n => ({ team: n, rank: n, gamesPlayed: 1, gamesWon: n % 2, gamesLost: 1 - n % 2 })) }] } }];
  const data = fiba(games, items, 'ELW', 2, Date.parse('2026-10-21T12:00:00Z'));
  assert.match(data.roundLabel, /Segona fase/);
  assert.equal(data.standings, null);
  assert.equal(data.currentStandingsRound, 1);
  const automatic = fiba(games, items, 'ELW', null, Date.parse('2026-10-21T12:00:00Z'));
  assert.match(automatic.roundLabel, /Segona fase/);
  assert.equal(automatic.standings.phase, 'Regular Season - First Round');
  assert.equal(automatic.standingsTitle, 'Classificació · Primera fase');
  assert.equal(code(automatic, 4), 'EC');
});

test('ACB normalizer derives phase from the actual official table and rejects non-regular metadata', () => {
  const filters = { seasons: [{ id: 91, startYear: 2026 }], rounds: [{ id: 6018, roundNumber: 4, subphaseId: null }, { id: 6019, roundNumber: 5, subphaseId: null }] };
  const matches = { availableFilters: filters, selectedFilters: { season: 91, round: 6019 }, matches: [{ id: 1, homeTeam: { shortName: 'A' }, awayTeam: { shortName: 'B' }, matchStatus: 'NOT_STARTED', startDateTime: '2026-10-25T17:00:00Z' }] };
  const source = { totalRounds: 34, availableFilters: filters, selectedFilters: { season: 91, round: 6018 }, standings: Array.from({ length: 18 }, (_, i) => ({ team: { shortName: 'Equip ' + i }, position: i + 1, matchesPlayed: 4, wins: 2, losses: 2 })) };
  const data = acb(matches, source);
  assert.equal(data.round, 5);
  assert.equal(code(data, 17), 'D');
  assert.equal(rule(acb(matches, { ...source, totalRounds: 5 })), null);
});
