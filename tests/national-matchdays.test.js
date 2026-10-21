const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { matchdays } = require('../lib/national-matchdays');
const { build, events, createService } = require('../lib/national');
const { normalize } = require('../lib/fiba');
const { render } = require('../lib/euroleague-page');
const now = Date.parse('2026-10-21T12:00:00Z');

function source(competition = 'ESM') {
  const definition = events[competition][0], games = [], items = [];
  let id = 1;
  const phases = competition === 'ESM' ? [
    ['1st Round', { A: ['ESP', 'DEN', 'GEO', 'UKR'], B: ['FRA', 'GER', 'ITA', 'GRE'] }, ['2026-07-01', '2026-07-04', '2026-07-07', '2026-07-10', '2026-07-13', '2026-07-16']],
    ['2nd Round', { I: ['ESP', 'DEN', 'GEO', 'UKR', 'FRA', 'GER'], J: ['ITA', 'GRE', 'BEL', 'FIN', 'LTU', 'SWE'] }, ['2026-08-27', '2026-08-30', '2026-11-26', '2026-11-29', '2027-02-25', '2027-02-28']]
  ] : [
    ['First Round', { A: ['IRL', 'ISR', 'BIH', 'LUX'], G: ['POR', 'ISL', 'SRB'] }, ['2025-11-12', '2025-11-15', '2025-11-18', '2026-03-11', '2026-03-14', '2026-03-17']],
    ['Hosts', { H: ['BEL', 'FIN', 'LTU', 'SWE'] }, ['2025-11-13', '2025-11-16', '2026-11-12', '2026-11-15', '2027-02-11', '2027-02-14']],
    ['Second Round', { I: ['GER', 'ITA', 'FRA', 'TUR'], J: ['ESP', 'CZE', 'HUN', 'POR'] }, ['2026-11-11', '2026-11-14', '2026-11-17', '2027-02-10', '2027-02-13', '2027-02-16']]
  ];
  const teams = new Map();
  function team(code) {
    if (!teams.has(code)) teams.set(code, { teamId: teams.size + 1, code, officialName: code });
    return teams.get(code);
  }
  phases.forEach(([name, groups, dates], p) => {
    const round = { roundId: p + 1, roundName: name, roundNumber: p + 1 };
    items.push({ standingHeaderName: name, roundIds: [round.roundId], type: 'groups', data: { groups: Object.entries(groups).map(([groupName, members]) => ({ groupName, teamsStats: members.map((code, i) => ({ team: team(code).teamId, rank: i + 1, gamesPlayed: 2, gamesWon: i ? 0 : 2, gamesLost: i ? 2 : 0 })) })) } });
    for (const [groupPairingCode, members] of Object.entries(groups)) {
      let number = 1;
      for (let d = 0; d < 6; d++) {
        const patterns = members.length === 3 ? [[[0, 1]], [[1, 2]], [[2, 0]]]
          : members.length === 4 ? [[[0, 1], [2, 3]], [[0, 2], [3, 1]], [[0, 3], [1, 2]]]
            : [0, 1, 2].map(shift => [0, 1, 2].map(n => [n, 3 + (n + shift) % 3]));
        for (const pair of patterns[d % 3]) {
          const [a, b] = d < 3 ? pair : [...pair].reverse(), date = dates[d] + 'T18:00:00';
          const final = Date.parse(date + 'Z') < now;
          games.push({ gameId: id++, gameNumber: String(number++), round, groupPairingCode, gameDateTimeUTC: date, hasTimeGameDateTime: true,
            teamA: team(members[a]), teamB: team(members[b]), teamAScore: final ? 80 : 0, teamBScore: final ? 70 : 0, isLive: false, liveGameStatus: final ? 999 : 1,
            competition: { competitionCode: definition.code, gender: definition.gender, competitionType: 'National Teams', season: 2027, start: '2025-11-09' } });
        }
      }
    }
  });
  return { definition, value: { games, items }, at: now, stale: false };
}

test('both qualifiers split each phase into six matchdays without losing or duplicating any fixtures', () => {
  for (const c of ['ESM', 'ESW']) {
    const s = source(c);
    for (let phase = 1; phase <= (c === 'ESM' ? 2 : 3); phase++) {
      const ids = [];
      for (let day = 1; day <= 6; day++) {
        const d = build([s], c, phase, now, null, day);
        assert.equal(d.phase, phase);
        assert.equal(d.round, day);
        assert.deepEqual(d.rounds, [1, 2, 3, 4, 5, 6]);
        assert.match(d.roundLabel, new RegExp('Jornada ' + day + ' · '));
        ids.push(...d.games.map(g => g.code));
        assert.ok(d.standings?.value.length);
      }
      const expected = s.value.games.filter(g => g.round.roundId === phase).map(g => g.gameId);
      assert.deepEqual(ids.sort((a, b) => a - b), expected.sort((a, b) => a - b));
      assert.equal(new Set(ids).size, expected.length);
    }
  }
});

test('the three-team group has one fixture per matchday, and six-team groups have three', () => {
  const female = build([source('ESW')], 'ESW', 1, now, 'G', 2);
  assert.equal(female.games.length, 1);
  assert.equal(female.games[0].home.code, 'ISL');
  const male = build([source()], 'ESM', 2, now, 'I', 3);
  assert.equal(male.games.length, 3);
  assert.equal(new Set(male.games.flatMap(g => [g.home.code, g.away.code])).size, 6);
});

test('different dates and a postponed fixture stay in their numbered matchday', () => {
  const s = source('ESW');
  const spain = s.value.games.find(g => g.round.roundId === 3 && g.gameNumber === '1' && g.groupPairingCode === 'J');
  spain.gameDateTimeUTC = '2026-11-10T18:00:00';
  const moved = s.value.games.find(g => g.round.roundId === 3 && g.gameNumber === '2' && g.groupPairingCode === 'J');
  moved.gameDateTimeUTC = '2026-12-15T18:00:00'; moved.isPostponed = true;
  const d = build([s], 'ESW', 3, now, 'J', 1);
  assert.equal(d.games.length, 2);
  assert.ok(d.games.some(g => g.code === moved.gameId && g.state === 'unavailable'));
  assert.match(d.roundLabels[1], /10\/11\/2026/);
  assert.ok(!build([s], 'ESW', 3, now, 'J', 2).games.some(g => g.code === moved.gameId));
});

test('automatic matchday selection retains yesterday then advances, while live play wins', () => {
  const s = source(), time = Date.parse('2026-08-31T12:00:00Z');
  assert.equal(build([s], 'ESM', 2, time).round, 2);
  assert.equal(build([s], 'ESM', 2, time + 86400000).round, 3);
  assert.equal(build([s], 'ESM', null, now).round, 3);
  assert.equal(build([source('ESW')], 'ESW', null, now).phase, 3);
  const live = s.value.games.find(g => g.round.roundId === 2 && g.gameNumber === '4');
  live.isLive = true; live.liveGameStatus = 3;
  assert.equal(build([s], 'ESM', 2, now).round, 2);
});

test('phase, group, pause and matchday navigation stay consistent and standings never become historical', () => {
  const s = source(), d = build([s], 'ESM', 2, now, 'I', 3);
  const output = render({ ...d, generatedAt: now }, false);
  assert.match(output, /fase=2&amp;jornada=2&amp;grup=I&amp;auto=0">← Anterior/);
  assert.match(output, /fase=2&amp;jornada=4&amp;grup=I&amp;auto=0">Següent/);
  assert.match(output, /fase=2&amp;jornada=3&amp;grup=J&amp;auto=0/);
  assert.match(output, /fase=2&amp;jornada=3&amp;grup=I&amp;auto=0">Actualitza ara/);
  assert.match(output, /fase=2&amp;jornada=3&amp;grup=I">Reprén/);
  const phaseForm = output.match(/<form id="phase-form"[\s\S]*?<\/form>/)[0];
  assert.doesNotMatch(phaseForm, /name="grup"|name="jornada"/);
  const roundForm = output.match(/<form id="round-form"[\s\S]*?<\/form>/)[0];
  assert.match(roundForm, /name="fase" value="2"/);
  assert.match(roundForm, /name="grup" value="I"/);
  assert.deepEqual(d.standings, build([s], 'ESM', 2, now, 'I', 1).standings);
  const automatic = render({ ...build([s], 'ESM', null, now), generatedAt: now });
  assert.match(automatic, /href="\/seleccio-masculina.html">Actualitza ara/);
  assert.throws(() => build([s], 'ESM', 2, now, null, 7), { status: 400 });
});

test('missing or inconsistent official numbering uses date labels, without fabricated matchdays', () => {
  for (const damage of [g => { delete g.gameNumber; }, g => { g.gameNumber = '19'; }, g => { g.gameNumber = '2'; }]) {
    const s = source(), raw = s.value.games.filter(g => g.round.roundId === 2);
    damage(raw[0]);
    const d = normalize(raw, undefined, 'ESM', null, now, { sourceCode: 'WCQ-EUR', national: true, phaseOnly: true });
    const days = matchdays(raw, d.games);
    assert.ok(days.every(day => day.label.startsWith('Partits del ')));
    assert.equal(days.flatMap(day => day.games).length, raw.length);
  }
});

test('switching matchdays and groups adds no official requests while their shared source is current', async () => {
  const s = source(); let calls = 0;
  const html = value => '<script>self.__next_f.push(' + JSON.stringify([1, 'a:' + JSON.stringify(value) + '\n']) + ')</script>';
  const load = createService({ competition: 'ESM', now: () => now, request: async url => {
    calls++;
    return new Response(html(url.endsWith('/games') ? { event: {}, games: s.value.games } : { items: s.value.items }));
  } });
  await load(2, 'I', 1); await load(2, 'J', 3); await load(1, 'A', 6);
  assert.equal(calls, 2);
});

test('both selectors submit independently in paused mode using ES5', () => {
  const handlers = {}, submissions = [];
  const elements = {};
  for (const [formId, selectId] of [['phase-form', 'fase'], ['round-form', 'jornada']]) {
    elements[formId] = { submit: () => submissions.push(formId), querySelector: () => ({ style: {} }) };
    elements[selectId] = { addEventListener: (name, fn) => { handlers[selectId] = fn; } };
  }
  vm.runInNewContext(fs.readFileSync('public/live-refresh.js', 'utf8'), { document: { getElementById: id => elements[id] } });
  handlers.fase(); handlers.jornada();
  assert.deepEqual(submissions, ['phase-form', 'round-form']);
  require('acorn').parse(fs.readFileSync('public/live-refresh.js', 'utf8'), { ecmaVersion: 5 });
});
