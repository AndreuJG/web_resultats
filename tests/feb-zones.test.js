const test = require('node:test');
const assert = require('node:assert/strict');
const { zonesFor } = require('../lib/standings-zones');
const { render } = require('../lib/euroleague-page');
const { createService } = require('../lib/feb');
const archives = { LF: require('../data/lf-endesa.json'), TERCERA_EA: require('../data/tercera-feb.json') };
const now = Date.parse('2026-10-21T12:00:00Z');

function data(competition) {
  const count = competition === 'LF' ? 16 : 14;
  const total = competition === 'LF' ? 30 : 26;
  return { competition, season: 'F2026', round: total, rounds: Array.from({ length: total }, (_, i) => i + 1), games: [], generatedAt: now,
    standings: { at: now, value: [{ name: competition === 'LF' ? 'Lliga Femenina Endesa' : 'Tercera FEB · Grup E-A', teams: Array.from({ length: count }, (_, i) => ({ name: 'Equip ' + (i + 1), position: i + 1, played: 2, won: 1, lost: 1 })) }] } };
}
const rule = d => zonesFor(d, d.standings.value[0]);
const code = (d, rank) => rule(d)?.zones.find(z => rank >= z.from && rank <= z.to)?.code;

test('LF Endesa bases give eight playoff places and two direct relegations to LF Challenge', () => {
  const d = data('LF');
  assert.deepEqual([1, 8, 9, 14, 15, 16].map(r => code(d, r)), ['PL', 'PL', undefined, undefined, 'D', 'D']);
  assert.match(rule(d).source, /6536.*2026-27/);
  assert.match(render(d), /15–16: Descens a LF Challenge/);
  assert.equal(rule(d).zones.filter(z => z.style === 'playin').length, 0);
});

test('Tercera E-A distinguishes group-winners tie, access playoffs and 12-14 relegation', () => {
  const d = data('TERCERA_EA');
  assert.deepEqual([1, 2, 4, 5, 11, 12, 14].map(r => code(d, r)), ['EP', 'PA', 'PA', undefined, undefined, 'D', 'D']);
  const html = render(d);
  assert.match(html, /1: Eliminatòria entre primers de grup/);
  assert.match(html, /2–4: Eliminatòries d’accés a la fase d’ascens/);
  assert.match(html, /12–14: Descens a Primera Divisió masculina/);
  assert.doesNotMatch(html, /Ascens directe|Descens a Primera FEB|Descens a Segona FEB/);
  assert.match(rule(d).source, /6547.*2026-27/);
});

test('FEB zones require the verified season, regular calendar, full ranks and exact group', () => {
  for (const competition of ['LF', 'TERCERA_EA']) {
    for (const alter of [
      d => { d.season = 'F2025'; },
      d => { d.season = 'F2027'; },
      d => { d.rounds = [1, 2]; },
      d => { d.rounds[d.rounds.length - 1] = 1; },
      d => { delete d.rounds; },
      d => { d.standings.phase = 'Playoff'; },
      d => { d.standings.value[0].teams.pop(); },
      d => { d.standings.value[0].teams[1].position = 1; },
      d => { d.standings.value[0].name = 'Tercera FEB · Grup E-B'; }
    ]) {
      const d = data(competition); alter(d);
      assert.equal(rule(d), null);
    }
    const d = data(competition); d.standings.phase = 'regular-season';
    assert.ok(rule(d));
  }
});

test('old and future fixture selections share the same real standings zones and keep team highlights', () => {
  const d = data('LF');
  d.standings.value[0].teams[0].name = 'VALENCIA BASKET';
  d.round = 1;
  const first = rule(d);
  d.round = 30;
  assert.deepEqual(rule(d), first);
  assert.match(render(d), /<span class="valencia-basket">VALENCIA BASKET<\/span>/);
  const third = data('TERCERA_EA');
  third.standings.value[0].teams[0].name = 'CB TABERNES BLANQUES';
  assert.match(render(third), /<strong>CB TABERNES BLANQUES<\/strong>/);
});

test('existing permanent FEB archives gain zones on read without rewrites or requests for closed rounds', async () => {
  for (const competition of ['LF', 'TERCERA_EA']) {
    const archive = structuredClone(archives[competition]);
    const before = JSON.stringify(archive);
    const round = Object.values(archive.seasons.F2026.rounds).find(r => r.closed).data.round;
    let requests = 0;
    const load = createService({ competition, archive, now: () => now, fetch: async () => { requests++; throw new Error('offline'); } });
    const result = await load(round);
    assert.ok(rule(result), competition);
    assert.equal(JSON.stringify(archive), before);
    assert.equal(requests, 0);
    assert.match(render(result), /class="zones-legend"/);
  }
});

test('national zones require verified tournament metadata', () => {
  for (const competition of ['ESM', 'ESW']) {
    const d = data('LF'); d.competition = competition;
    assert.equal(rule(d), null);
    assert.doesNotMatch(render(d), /class="zones-legend"|class="zone zone-/);
  }
});
