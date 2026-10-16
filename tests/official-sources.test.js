const test = require('node:test');
const assert = require('node:assert/strict');
const { acbData, febData } = require('../lib/official-html');
const { acbGame } = require('../lib/acb');
const { normalizeGame, madridDate, selectGroup, filterCalendar, calendarWindows } = require('../lib/feb');
const { createSourceCache, unwrapSnapshot } = require('../lib/source-cache');

test('ACB JSON stream resolves team references without executing scripts', () => {
  const model = ['$', '$L1', null, { data: { selectedFilters: { round: 12 }, teams: [{ shortName: 'Local' }], matches: [{ homeTeam: '$a:props:data:teams:0' }] } }];
  const chunk = 'a:' + JSON.stringify(model) + '\n';
  const html = '<script>throw new Error("never execute")</script><script>self.__next_f.push(' + JSON.stringify([1, chunk]) + ')</script>';
  assert.equal(acbData(html, 'matches').matches[0].homeTeam.shortName, 'Local');
  assert.throws(() => acbData('<html>Source unavailable</html>', 'matches'));
});

test('FEB SSR reader accepts only the data graph and rejects executable code', () => {
  const wrap = body => '<script>$_TSR.router=($R=>' + body + ')($R["tsr"])</script>';
  const value = febData(wrap('$R[0]={days:$R[1]=[{name:"Equip",live:!1}],again:$R[1]}'));
  assert.equal(value.days[0].name, 'Equip');
  assert.equal(value.days[0].live, false);
  assert.equal(value.days, value.again);
  assert.throws(() => febData(wrap('fetch("https://example.com")')));
  assert.throws(() => febData(wrap('globalThis.secret')));
});

test('ACB scheduled matches do not show 0-0 and live matches keep the official state', () => {
  const now = Date.parse('2026-10-16T20:00:00Z');
  const game = { id: 1, homeTeam: { shortName: 'Local' }, awayTeam: { shortName: 'Visitant' }, homeScore: 0, awayScore: 0, startDateTime: '2026-10-17T18:00:00Z', matchStatus: 'NOT_STARTED' };
  assert.equal(acbGame(game, now).score, null);
  assert.equal(acbGame(game, now).state, 'scheduled');
  const live = acbGame({ ...game, matchStatus: 'IN_PROGRESS', homeScore: 35, awayScore: 30, currentQuarter: 2 }, now);
  assert.deepEqual(live.score, [35, 30]);
  assert.match(live.label, /En joc.*2Q/);
  assert.equal(acbGame({ ...game, matchStatus: 'UNKNOWN' }, now).state, 'unavailable');
});

test('FEB dates use Madrid summer and winter offsets', () => {
  assert.equal(madridDate('17/10/2026', '18:30'), '2026-10-17T16:30:00.000Z');
  assert.equal(madridDate('31/10/2026', '18:30'), '2026-10-31T17:30:00.000Z');
  assert.throws(() => madridDate('bad', '18:30'));
});

test('FEB uses final results from updated source, never blank calendar scores', () => {
  const base = { idPartido: 2522793, fecha: '11/10/2026', hora: '18:30', state: 'upcoming', teamA: { name: 'Girona', score: '' }, teamB: { name: 'Jairis', score: '' } };
  const now = Date.parse('2026-10-16T20:00:00Z');
  assert.equal(normalizeGame(base, null, now).state, 'unavailable');
  assert.equal(normalizeGame(base, null, now).score, null);
  const final = { ...base, state: 'final', teamA: { ...base.teamA, score: '48' }, teamB: { ...base.teamB, score: '64' } };
  const view = normalizeGame(final, { idPartido: base.idPartido, state: 'upcoming', scoreA: 0, scoreB: 0 }, now);
  assert.equal(view.state, 'final');
  assert.deepEqual(view.score, [48, 64]);
});

test('FEB live results are tied to the correct match and include the official clock', () => {
  const base = { idPartido: 1, fecha: '17/10/2026', hora: '18:30', state: 'upcoming', teamA: { name: 'Local', score: '' }, teamB: { name: 'Visitant', score: '' } };
  const live = { idPartido: 1, state: 'live', scoreA: 35, scoreB: 30, quarter: 2, clock: '04:33' };
  const result = normalizeGame(base, live);
  assert.deepEqual(result.score, [35, 30]);
  assert.match(result.label, /En joc.*2Q.*04:33/);
  assert.throws(() => normalizeGame(base, { ...live, idPartido: 2 }));
});

test('source fallback retains its original timestamp and disables the live indicator', async () => {
  let time = 1000000, fail = false;
  const cached = createSourceCache(null, () => time);
  const load = async () => { if (fail) throw new Error('Source unavailable'); return { games: [{ state: 'live', label: 'En joc', stale: false }], standings: null }; };
  await cached('test', 20, load);
  time += 21000; fail = true;
  const result = unwrapSnapshot(await cached('test', 20, load), time);
  assert.equal(result.games[0].checkedAt, 1000000);
  assert.equal(result.games[0].stale, true);
  assert.match(result.games[0].label, /Dades antigues/);
});

test('Tercera FEB selects E-A explicitly and fails if it is missing', () => {
  const edition = { feb: { grupos: [{ idGrupo: 90059, nombreGrupoFront: 'Grupo A-A' }, { idGrupo: 90067, nombreGrupoFront: 'Grupo E-A' }, { idGrupo: 90068, nombreGrupoFront: 'Grupo E-B' }] } };
  const phase = { grupos: [{ idGrupo: 90059 }, { idGrupo: 90068 }, { idGrupo: 90067 }] };
  assert.equal(selectGroup(edition, phase, 'E-A').idGrupo, 90067);
  assert.throws(() => selectGroup(edition, { grupos: phase.grupos.slice(0, 2) }, 'E-A'));
  assert.throws(() => selectGroup(edition, phase));
});

test('Tercera FEB calendar excludes other groups and non-regular phases', () => {
  const days = [{ matches: [{ idPartido: 1, idGrupo: 90059, matchday: 'J3' }, { idPartido: 2, idGrupo: 90067, matchday: 'J3' }, { idPartido: 3, idGrupo: 90068, matchday: 'J3' }, { idPartido: 4, idGrupo: 90067, matchday: 'Final' }] }];
  assert.deepEqual(filterCalendar(days, 90067).map(g => g.idPartido), [2]);
});

test('large FEB calendars are split into short windows across the entire season', () => {
  assert.deepEqual(calendarWindows({ fechaInicio: '01-09-2026', fechaFin: '30-06-2027' }), [
    { fechaInicio: '01-09-2026', fechaFin: '31-10-2026' },
    { fechaInicio: '01-11-2026', fechaFin: '31-12-2026' },
    { fechaInicio: '01-01-2027', fechaFin: '28-02-2027' },
    { fechaInicio: '01-03-2027', fechaFin: '30-04-2027' },
    { fechaInicio: '01-05-2027', fechaFin: '30-06-2027' }
  ]);
});
