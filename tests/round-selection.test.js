const test = require('node:test');
const assert = require('node:assert/strict');
const { defaultRound } = require('../lib/round-selection');
const { refreshPolicy } = require('../lib/refresh-policy');
const time = Date.parse('2026-10-19T12:00:00Z');
test('default round retains results the following day, then shows the next fixtures without inventing a live state', () => {
  const rounds = [
    { round: 1, games: [{ state: 'final', date: '2026-10-18T10:00:00Z' }] },
    { round: 2, games: [{ state: 'scheduled', date: '2026-10-21T18:00:00Z' }, { state: 'scheduled', date: '2026-10-22T18:00:00Z' }] }
  ];
  assert.equal(defaultRound(rounds, time).round, 1);
  assert.equal(defaultRound(rounds, Date.parse('2026-10-20T12:00:00Z')).round, 2);
  assert.equal(defaultRound(rounds, Date.parse('2026-10-21T18:01:00Z')).round, 2);
  assert.equal(rounds[1].games[0].state, 'scheduled');
  const postponed = { round: 3, games: [{ state: 'unavailable', date: '2026-10-19T10:00:00Z', label: 'Ajornat' }] };
  assert.equal(defaultRound([...rounds, postponed], time).round, 1);
});
test('completed default view checks for the next round, while explicitly chosen historical rounds stop polling', () => {
  const data = { generatedAt: time, games: [{ state: 'final' }], currentRound: true, nextMatchAt: time + 60000 };
  assert.equal(refreshPolicy(data).delay, 60000);
  assert.equal(refreshPolicy({ ...data, nextMatchAt: time + 86400000 }).delay, 900000);
  assert.equal(refreshPolicy({ ...data, currentRound: false }).delay, 0);
});


test('EuroLeague double rounds switch to Thursday fixtures before tip-off, without an extra day on Wednesday results', () => {
  const rounds = [
    { round: 1, games: [{ state: 'final', date: '2026-10-20T18:00:00Z' }, { state: 'final', date: '2026-10-21T20:00:00Z' }] },
    { round: 2, games: [{ state: 'scheduled', date: '2026-10-22T18:00:00Z' }, { state: 'scheduled', date: '2026-10-23T20:00:00Z' }] }
  ];
  const thursday = Date.parse('2026-10-22T08:00:00Z');
  assert.equal(defaultRound(rounds, thursday, 'E').round, 2);
  assert.equal(defaultRound(rounds, thursday, 'U').round, 1);
});
test('the following-day rule uses Madrid calendar days, including matches after UTC midnight boundaries', () => {
  const rounds = [{ round: 1, games: [{ state: 'final', date: '2026-10-18T22:30:00Z' }] }, { round: 2, games: [{ state: 'scheduled', date: '2026-10-24T18:00:00Z' }] }];
  assert.equal(defaultRound(rounds, Date.parse('2026-10-20T20:00:00Z')).round, 1);
  assert.equal(defaultRound(rounds, Date.parse('2026-10-20T22:00:00Z')).round, 2);
});


test('a postponed fixture beyond the next round does not pin the default view for weeks', () => {
  const rounds = [
    { round: 3, games: [{ state: 'final', date: '2026-10-18T18:00:00Z' }, { state: 'scheduled', date: '2026-11-27T20:00:00Z' }] },
    { round: 4, games: [{ state: 'scheduled', date: '2026-10-24T18:00:00Z' }] }
  ];
  assert.equal(defaultRound(rounds, Date.parse('2026-10-19T12:00:00Z')).round, 3);
  assert.equal(defaultRound(rounds, Date.parse('2026-10-20T12:00:00Z')).round, 4);
  assert.equal(rounds[0].games.length, 2);
});
