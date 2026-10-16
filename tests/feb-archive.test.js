const test = require('node:test');
const assert = require('node:assert/strict');
const { archivedRound, isClosed, WEEK } = require('../lib/feb-archive');
const { createService } = require('../lib/feb');
const { updateArchive } = require('../scripts/archive-feb');
const now = Date.parse('2026-10-17T10:00:00Z');
function fixture(round, state, date) {
  return { competition: 'TERCERA_EA', season: 'F2026', round, rounds: [1, 2], standings: { value: [] }, scheduleStale: false,
    games: [{ code: round, state, date, score: state === 'final' ? [70, 65] : null, home: { name: 'Local' }, away: { name: 'Visitant' }, label: state === 'final' ? 'Final' : 'Pendent', stale: false }] };
}
function archive() {
  return { version: 1, seasons: { F2026: { updatedAt: now, rounds: {
    1: { savedAt: now, closed: true, data: fixture(1, 'final', '2026-10-10T16:00:00Z') },
    2: { savedAt: now, closed: false, data: fixture(2, 'scheduled', '2027-03-10T16:00:00Z') }
  } } } };
}

test('October final results remain available in March without any FEB request, including a cold service', async () => {
  const time = Date.parse('2027-03-15T10:00:00Z');
  const load = createService({ competition: 'TERCERA_EA', archive: archive(), now: () => time, fetch: async () => { throw new Error('FEB must not be contacted'); } });
  const data = await load('1');
  assert.equal(data.round, 1);
  assert.deepEqual(data.games[0].score, [70, 65]);
  assert.equal(data.scheduleStale, false);
  assert.equal(data.games[0].checkedAt, now);
});

test('March fixtures use permanent schedule in October and defer to live two hours before tip-off', () => {
  assert.equal(archivedRound(archive(), '2', now).round, 2);
  assert.equal(archivedRound(archive(), '2', now + WEEK), null);
  const a = archive(), start = Date.parse('2027-03-10T16:00:00Z');
  a.seasons.F2026.rounds[2].savedAt = start - 86400000;
  assert.equal(archivedRound(a, '2', start - 3 * 3600000).round, 2);
  assert.equal(archivedRound(a, '2', start - 2 * 3600000), null);
  assert.equal(archivedRound(a, '2', start + 3600000), null);
});

test('default page selects next or today round using Madrid dates and never mutates the archive', () => {
  const a = archive(), before = JSON.stringify(a);
  assert.equal(archivedRound(a, null, now).round, 2);
  assert.equal(JSON.stringify(a), before);
  assert.equal(archivedRound(a, '99', now), null);
  assert.equal(archivedRound(a, '1', Date.parse('2027-10-17T10:00:00Z')), null);
});

test('a round is closed only with all final scores and a valid classification', () => {
  const final = fixture(1, 'final', '2026-10-10T16:00:00Z');
  assert.ok(isClosed(final));
  assert.ok(!isClosed({ ...final, standings: null }));
  assert.ok(!isClosed({ ...final, scheduleStale: true }));
  assert.ok(!isClosed({ ...final, games: [{ ...final.games[0], score: null }] }));
  assert.ok(!isClosed(fixture(2, 'scheduled', '2027-03-10T16:00:00Z')));
});

test('weekly update never fetches or overwrites closed rounds and preserves previous seasons', async () => {
  const a = archive(), saved = JSON.stringify(a.seasons.F2026.rounds[1]);
  a.seasons.F2025 = { rounds: {} };
  const calls = [], load = async round => { calls.push(round); return fixture(2, 'final', '2026-10-16T16:00:00Z'); };
  load.calendar = async () => ({ season: 'F2026', calendar: [{ matchday: 'J1' }, { matchday: 'J2' }] });
  const updated = await updateArchive(a, load, () => now, () => {});
  assert.deepEqual(calls, ['2']);
  assert.equal(JSON.stringify(updated.seasons.F2026.rounds[1]), saved);
  assert.equal(updated.seasons.F2026.rounds[2].closed, true);
  assert.deepEqual(updated.seasons.F2025, a.seasons.F2025);
  assert.equal(a.seasons.F2026.rounds[2].closed, false);
});

test('weekly source failures cannot overwrite the last valid archive', async () => {
  const a = archive(), before = JSON.stringify(a);
  const load = async () => { throw new Error('FEB offline'); };
  load.calendar = async () => ({ season: 'F2026', calendar: [{ matchday: 'J2' }] });
  await assert.rejects(updateArchive(a, load), /FEB offline/);
  assert.equal(JSON.stringify(a), before);
});

test('LF archive is permanent, isolated from Tercera FEB, and pending fixtures still defer to live', async () => {
  const a = archive();
  for (const entry of Object.values(a.seasons.F2026.rounds)) entry.data.competition = 'LF';
  const load = createService({ competition: 'LF', archive: a, now: () => now + WEEK, fetch: async () => { throw new Error('offline'); } });
  assert.deepEqual((await load('1')).games[0].score, [70, 65]);
  assert.equal(archivedRound(a, '1', now), null);
  assert.equal(archivedRound(a, '2', now, 'LF').round, 2);
  const start = Date.parse('2027-03-10T16:00:00Z');
  a.seasons.F2026.rounds[2].savedAt = start - 86400000;
  assert.equal(archivedRound(a, '2', start - 3600000, 'LF'), null);
});
