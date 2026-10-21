const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const fiba = require('../lib/fiba');
const euroleague = require('../lib/euroleague');
const { render } = require('../lib/euroleague-page');
const now = Date.parse('2026-10-21T12:00:00Z');
const teams = Array.from({ length: 8 }, (_, i) => ({ teamId: i + 1, code: 'T' + i, officialName: 'Equip ' + i }));
const html = value => '<script>self.__next_f.push(' + JSON.stringify([1, 'a:' + JSON.stringify(value) + '\n']) + ')</script>';
function fixture(c) {
  const games = [], items = [];
  let id = 1;
  const phases = c === 'ELW' ? [['First Round', ['A', 'B']], ['Second Round', ['E', 'F']], ['Semi-Final Play-In', []]]
    : c === 'BCL' ? [['Regular Season', ['A', 'B']], ['Round of 16', ['I', 'J']], ['Quarter-Finals', []]]
      : [['Regular Season', ['A', 'B']], ['Play-Off Round 1', []]];
  phases.forEach(([name, groups], p) => {
    const round = { roundId: 100 + p, roundNumber: p + 1, roundOrder: p + 1, roundName: name };
    items.push({ standingHeaderName: name, roundIds: [round.roundId], type: groups.length ? 'groups' : 'bracket', data: { groups: groups.map((groupName, n) => ({ groupName, teamsStats: teams.slice(n * 4, n * 4 + 4).map((t, i) => ({ team: t.teamId, rank: i + 1, gamesPlayed: p === 0 ? 1 : 0, gamesWon: p === 0 ? 1 : 0, gamesLost: 0 })) })) } });
    for (let d = 0; d < 2; d++) for (const [n, group] of (groups.length ? groups : ['1']).entries()) {
      const date = p === 0 ? '2026-10-' + (d === 0 ? '14' : '21') : '2027-0' + (p + 1) + '-' + (d === 0 ? '06' : '13');
      for (let pair = 0; pair < (groups.length ? 2 : 1); pair++) games.push({ gameId: id++, round, groupPairingCode: group, gameNumber: groups.length ? String(d * 2 + pair + 1) : d ? 'B' : 'A',
        gameDateTimeUTC: date + 'T18:00:00', hasTimeGameDateTime: true, teamA: teams[n * 4 + pair * 2], teamB: teams[n * 4 + pair * 2 + 1], isLive: false,
        liveGameStatus: p === 0 && d === 0 ? 999 : 1, teamAScore: 70, teamBScore: 65,
        competition: { competitionCode: c, start: '2026-09-23', season: 2027, gender: 'Women', competitionType: 'Clubs' } });
    }
  });
  return { games, items };
}

test('all three FIBA competitions expose independent phase, round and group dropdowns', () => {
  for (const c of ['ELW', 'ECW', 'BCL']) {
    const { games, items } = fixture(c);
    const d = fiba.normalize(games, items, c, null, now, { phaseControls: true });
    assert.equal(d.phases.length, c === 'ECW' ? 2 : 3);
    assert.equal(d.rounds.length, 2);
    assert.deepEqual(d.availableGroups.map(g => g.code), ['A', 'B']);
    assert.equal(d.selectedGroup, null);
    const output = render({ ...d, generatedAt: now }, false);
    for (const id of ['phase-form', 'round-form', 'group-form']) assert.ok(output.includes('id="' + id + '"'));
    assert.match(output, /<option value="" selected>Tots<\/option>/);
    assert.doesNotMatch(output, /<optgroup|Grups: <a/);
    const filtered = fiba.normalize(games, items, c, d.round, now, { phaseControls: true, groupParam: 'B', phaseParam: d.phase });
    assert.equal(filtered.games.length, 2);
    assert.ok(filtered.games.every(g => g.group === 'B'));
    assert.equal(filtered.standings.value.length, 1);
    assert.equal(filtered.standings.value[0].name, 'Grup B');
    assert.match(render({ ...filtered, generatedAt: now }, false), /<option value="B" selected>Grup B<\/option>/);
    assert.equal(fiba.normalize(games, items, c, d.round, now, { phaseControls: true, groupParam: 'Z' }).games.length, 4);
  }
});

test('changing FIBA phase resets unavailable groups and cannot mix the standings from a different phase', () => {
  for (const c of ['ELW', 'BCL']) {
    const { games, items } = fixture(c);
    const d = fiba.normalize(games, items, c, null, now, { phaseControls: true });
    const next = fiba.normalize(games, items, c, null, now, { phaseControls: true, phaseParam: d.phases[1], groupParam: 'A' });
    assert.equal(next.selectedGroup, null);
    assert.equal(next.standings, null);
    assert.ok(next.currentStandingsRound);
    assert.equal(next.availableGroups[0].code, c === 'ELW' ? 'E' : 'I');
    const knockout = fiba.normalize(games, items, c, null, now, { phaseControls: true, phaseParam: d.phases[2] });
    assert.deepEqual(knockout.availableGroups, []);
    assert.equal(knockout.standings, null);
    assert.ok(knockout.games.every(g => !g.group));
    assert.match(render({ ...knockout, generatedAt: now }), /name="grup" disabled/);
    assert.throws(() => fiba.normalize(games, items, c, d.round, now, { phaseControls: true, phaseParam: d.phases[1] }), { status: 400 });
  }
});

test('FIBA group or phase changes reuse the complete schedule and retain old round links', async () => {
  const { games, items } = fixture('ECW'); let calls = 0;
  const load = fiba.createService({ competition: 'ECW', now: () => now, request: async url => {
    calls++;
    return new Response(html(url.endsWith('/games') ? { event: {}, games } : { items }));
  } });
  const initial = await load(null);
  const selected = await load(initial.round, 'A', initial.phase);
  assert.equal(selected.games.length, 2);
  const legacy = await load(initial.round);
  assert.equal(legacy.phase, initial.phase);
  assert.equal(legacy.games.length, 4);
  await load(null, null, initial.phases[1]);
  assert.equal(calls, 2);
});

test('EuroCup men use official phase types and filter both fixtures and the latest standings', async () => {
  const games = [], urls = [];
  for (let r = 1; r <= 3; r++) for (const group of r === 3 ? ['1'] : ['A', 'B']) games.push({ gameCode: games.length + 1, round: r, group: { rawName: group },
    phaseType: { code: r === 3 ? 'PO' : 'RS', name: r === 3 ? 'Playoffs' : 'Regular Season', isGroupPhase: r !== 3 },
    utcDate: r === 1 ? '2026-10-14T18:00:00Z' : r === 2 ? '2026-10-21T18:00:00Z' : '2027-02-10T18:00:00Z', played: r === 1,
    local: { club: { code: group + '1', name: 'Club ' + group + '1' }, score: 70 }, road: { club: { code: group + '2', name: 'Club ' + group + '2' }, score: 65 } });
  const load = euroleague.createService({ competition: 'U', now: () => now, fetch: async url => {
    urls.push(url);
    if (url.includes('/games')) return Response.json({ data: games, total: games.length });
    if (url.includes('/clubs')) return Response.json({ data: [{ code: 'A1', country: { code: 'ESP' } }], total: 1 });
    return Response.json(['A', 'B'].map(group => ({ group: { rawName: group }, standings: [{ club: { name: 'Club ' + group, code: group + '1' }, data: { position: 1, gamesPlayed: 1, gamesWon: 1, gamesLost: 0 } }] })));
  } });
  const d = await load(null);
  assert.deepEqual(d.phaseLabels, { 1: 'Fase regular', 3: 'Playoffs' });
  assert.deepEqual(d.rounds, [1, 2]);
  const group = await load(2, 'B', 1);
  assert.equal(group.games.length, 1);
  assert.equal(group.standings.value.length, 1);
  assert.equal(group.standings.value[0].name, 'Grup B');
  assert.equal((await load(1)).phase, 1);
  const knockout = await load(null, 'A', 3);
  assert.equal(knockout.standings, null);
  assert.equal(knockout.currentStandingsRound, 1);
  assert.deepEqual(knockout.availableGroups, []);
  assert.equal((await load(2, 'Z', 1)).games.length, 2);
  assert.equal(urls.filter(url => url.includes('/games')).length, 1);
  assert.equal(urls.filter(url => url.includes('/standings')).length, 1);
  await assert.rejects(load(2, null, 3), { status: 400 });
});

test('round and group forms preserve filters and pause; phase form resets them', () => {
  const { games, items } = fixture('ECW');
  const d = fiba.normalize(games, items, 'ECW', 2, now, { phaseControls: true, phaseParam: 100, groupParam: 'B' });
  const output = render({ ...d, generatedAt: now }, false);
  assert.match(output, /fase=100&amp;jornada=1&amp;grup=B&amp;auto=0">← Anterior/);
  const forms = Object.fromEntries(['phase', 'round', 'group'].map(name => [name, output.match(new RegExp('<form id="' + name + '-form"[\\s\\S]*?<\\/form>'))[0]]));
  assert.doesNotMatch(forms.phase, /name="grup"|name="jornada"/);
  assert.match(forms.round, /name="grup" value="B"/);
  assert.match(forms.group, /name="fase" value="100"/);
  assert.match(forms.group, /name="jornada" value="2"/);
  for (const form of Object.values(forms)) assert.match(form, /name="auto" value="0"/);
});

test('the group dropdown submits without a button even when reloads are paused, using ES5', () => {
  let change, submits = 0;
  const button = { style: {} }, form = { submit: () => submits++, querySelector: () => button };
  const select = { addEventListener: (name, fn) => { change = fn; } };
  const source = fs.readFileSync('public/live-refresh.js', 'utf8');
  vm.runInNewContext(source, { document: { getElementById: id => ({ 'group-form': form, grup: select })[id] } });
  change(); assert.equal(submits, 1); assert.equal(button.style.display, 'none');
  require('acorn').parse(source, { ecmaVersion: 5 });
});
