const test = require('node:test');
const assert = require('node:assert/strict');
const parser = require('../lib/feb-classic-source');
const { createService } = require('../lib/feb');
const { liveGame } = require('../lib/feb-live');
const { roundCacheSeconds } = require('../lib/feb-cache-policy');
const now = Date.parse('2026-10-18T09:00:00Z');
const name = '_ctl0:MainContentPlaceHolderMaster:';
function html(round = 1, final = false, group = 'Liga Regular Único') {
  const select = (suffix, rows) => `<select name="${name + suffix}" id="_${suffix}">${rows.map(([id,label,selected]) => `<option value="${id}"${selected ? ' selected="selected"' : ''}>${label}</option>`).join('')}</select>`;
  return `<form><span class="liga">LF ENDESA</span><div id="contentToken"><input type="hidden" value="test-public-session"></div><input type="hidden" name="__VIEWSTATE" value="public-form-state"><input type="hidden" id="CodCategoriaHiddenField" value="210">
    ${select('temporadasDropDownList', [[2026,'2026/2027',true]])}${select('gruposDropDownList', [[89975,group,true]])}${select('jornadasDropDownList', [[1001,'Jornada 1(11/10/2026)',round === 1],[1002,'Jornada 2(18/10/2026)',round === 2]])}
    <table id="_jornadaDataGrid"><tr><td><a href="https://baloncestoenvivo.feb.es/Equipo.aspx?i=101">Local &amp; Equip</a> - <a href="https://baloncestoenvivo.feb.es/Equipo.aspx?i=102">Visitant</a></td><td><a href="https://baloncestoenvivo.feb.es/Partido.aspx?p=${9000 + round}">${final ? '70-65' : '*-*'}</a></td><td>${round === 1 ? '11' : '18'}/10/2026</td><td>12:00</td></tr></table>
    <table id="_clasificacionDataGrid"><tr><td>1</td><td><a href="https://baloncestoenvivo.feb.es/Equipo.aspx?i=101">Local &amp; Equip</a></td><td>1</td><td>1</td><td>0</td></tr><tr><td>2</td><td><a href="https://baloncestoenvivo.feb.es/Equipo.aspx?i=102">Visitant</a></td><td>1</td><td>0</td><td>1</td></tr></table></form>`;
}
const overviewGame = { ID: 9002, CompID: '210', sourceCompetition: '210', Competition: 'LF ENDESA', TeamAID: 101, TeamBID: 102, ScoreA: 23, ScoreB: 20, Status: 2, Quarter: 2, Time: '04:11' };
function mock({ failClassic = false, failLive = false, final = false } = {}) {
  const calls = [];
  const request = async (url, options = {}) => {
    calls.push(String(url));
    assert.ok(!String(url).includes('beta.competiciones'), 'beta must never be queried');
    if (String(url).includes('/api/v1/overview')) {
      if (failLive) throw new Error('LiveStats offline');
      return new Response(JSON.stringify({ OVERVIEW: { COMPETITIONS: [{ id: '210', GAMES: [overviewGame] }] } }));
    }
    if (String(url) === 'https://baloncestoenvivo.feb.es/') return new Response(html());
    if (failClassic) throw new Error('classic offline');
    const round = options.method === 'POST' ? Number(options.body.get(name + 'jornadasDropDownList')) - 1000 : 1;
    return new Response(html(round, final));
  };
  return { request, calls };
}
function saved() {
  const raw = parser.roundData(html(2), 'LF', 2026, 2).games[0];
  return { version: 1, seasons: { F2026: { updatedAt: now, calendar: [raw], rounds: { 2: { savedAt: now - 86400000, closed: false, data: {
    competition: 'LF', season: 'F2026', round: 2, rounds: [1,2], games: [{ code: 9002, date: '2026-10-18T10:00:00Z', state: 'scheduled', label: 'Pendent', score: null, home: { name: 'Local & Equip' }, away: { name: 'Visitant' } }], standings: { value: [] }
  } } } } } };
}

test('classic source validates season, group and exact requested round', () => {
  const data = parser.roundData(html(2), 'LF', 2026, 2);
  assert.equal(data.games[0].idPartido, 9002);
  assert.equal(data.games[0].teamA.name, 'Local & Equip');
  assert.throws(() => parser.roundData(html(1), 'LF', 2026, 2), /ignored round/);
  assert.throws(() => parser.roundData(html(2), 'LF', 2025, 2), /Wrong FEB/);
  assert.throws(() => parser.roundData(html(2).replace('LF ENDESA', 'TERCERA FEB'), 'TERCERA_EA', 2026, 2), /Wrong FEB/);
  assert.throws(() => parser.roundData(html(2).replace('<td>1</td><td>1</td><td>0</td>', '<td>2</td><td>1</td><td>0</td>'), 'LF', 2026, 2), /standing/);
  const form = parser.postFields(html(2), 1001);
  assert.equal(form.get(name + 'jornadasDropDownList'), '1001');
  assert.ok(!String(form).includes('test-public-session'));
});

test('live overview requires official state, match, competition and both team identities', () => {
  const base = parser.roundData(html(2), 'LF', 2026, 2).games[0];
  assert.equal(liveGame(overviewGame, base, 'LF').state, 'live');
  assert.equal(liveGame({ ...overviewGame, Status: 3 }, base, 'LF').state, 'final');
  for (const wrong of [{ ID: 99 }, { TeamAID: 99 }, { TeamBID: 99 }, { Competition: 'TERCERA FEB' }, { CompID: '111' }, { ScoreA: -1 }, { Status: 99 }]) assert.equal(liveGame({ ...overviewGame, ...wrong }, base, 'LF'), null);
});

test('classic and LiveStats deliver a changing live score without beta or persistent credentials', async () => {
  let time = now;
  const source = mock(), stored = new Map();
  const cache = { get: async k => stored.get(k), set: async (k,v) => stored.set(k,v) };
  const load = createService({ competition: 'LF', archive: false, cache, now: () => time, fetch: source.request });
  const first = await load('2');
  assert.equal(first.games[0].state, 'live');
  assert.deepEqual(first.games[0].score, [23,20]);
  assert.match(first.games[0].label, /2Q.*04:11/);
  assert.ok(first.standings);
  time += 21000; overviewGame.ScoreA = 25;
  const second = await load('2');
  assert.deepEqual(second.games[0].score, [25,20]);
  overviewGame.ScoreA = 23;
  assert.ok([...stored.values()].every(v => !JSON.stringify(v).includes('test-public-session')));
});

test('cold source failures keep the real archive visible and retry rather than freezing the fallback', async () => {
  const source = mock({ failClassic: true, failLive: true });
  const load = createService({ competition: 'LF', archive: saved(), now: () => now, fetch: source.request });
  const data = await load('2');
  assert.equal(data.scheduleStale, true);
  assert.equal(data.standings.stale, true);
  assert.equal(data.games[0].checkedAt, now - 86400000);
  assert.equal(data.games[0].score, null);
  assert.match(data.games[0].label, /Dades antigues/);
  assert.equal(roundCacheSeconds(data, now, now), 20);
});

test('a working live API remains usable when the classic result page fails', async () => {
  const source = mock({ failClassic: true });
  const data = await createService({ competition: 'LF', archive: saved(), now: () => now, fetch: source.request })('2');
  assert.equal(data.games[0].state, 'live');
  assert.deepEqual(data.games[0].score, [23,20]);
  assert.equal(data.games[0].stale, false);
  assert.equal(data.standings.stale, true);
});

test('archive jobs fail visibly rather than persisting the old fallback as a new snapshot', async () => {
  const source = mock({ failClassic: true, failLive: true });
  await assert.rejects(createService({ competition: 'LF', archive: false, calendarSeed: saved(), now: () => now, fetch: source.request })('2'), /classic offline/);
});

test('live API failures keep the last score marked old, and cannot overwrite a fresh final result', async () => {
  let time = now, offline = false, finished = false;
  const source = mock();
  const request = async (url, options) => {
    if (offline && String(url).includes('/api/v1/overview')) throw new Error('offline');
    if (finished && options?.method === 'POST') return new Response(html(2, true));
    return source.request(url, options);
  };
  const load = createService({ competition: 'LF', archive: false, now: () => time, fetch: request });
  const first = await load('2');
  const originalAt = first.games[0].checkedAt;
  offline = true; time += 21000;
  const old = await load('2');
  assert.deepEqual(old.games[0].score, [23,20]);
  assert.equal(old.games[0].stale, true);
  assert.equal(old.games[0].checkedAt, originalAt);
  assert.match(old.games[0].label, /Dades antigues/);
  finished = true; time += 21000;
  const final = await load('2');
  assert.equal(final.games[0].state, 'final');
  assert.deepEqual(final.games[0].score, [70,65]);
  assert.equal(final.games[0].stale, false);
});


test('FEB historical results use the latest live-round table while archived files remain unchanged', async () => {
  const a = saved(), source = mock(), time = Date.parse('2026-10-18T10:05:00Z');
  a.seasons.F2026.rounds[1] = { savedAt: now - 86400000, closed: true, data: {
    competition: 'LF', season: 'F2026', round: 1, rounds: [1, 2], games: [{ code: 9001, date: '2026-10-11T10:00:00Z', state: 'final', label: 'Final', score: [70, 65], home: { name: 'Local & Equip' }, away: { name: 'Visitant' } }],
    standings: { value: [{ name: 'LF', teams: parser.roundData(html(1), 'LF', 2026, 1).standings }] }
  } };
  a.seasons.F2026.rounds[2].data.standings = null;
  const before = JSON.stringify(a);
  const load = createService({ competition: 'LF', archive: a, now: () => time, fetch: async (url, options) => {
    const response = await source.request(url, options);
    if (!String(url).includes('resultados')) return response;
    const body = await response.text();
    return new Response(body.replace('<td>1</td><td>1</td><td>0</td>', '<td>2</td><td>2</td><td>0</td>').replace('<td>1</td><td>0</td><td>1</td>', '<td>2</td><td>0</td><td>2</td>'));
  } });
  const data = await load('1');
  assert.equal(data.round, 1);
  assert.deepEqual(data.games[0].score, [70, 65]);
  assert.equal(data.standings.value[0].teams[0].played, 2);
  assert.match(data.standingsNote, /Jornada 2/);
  assert.equal(JSON.stringify(a), before);
});
