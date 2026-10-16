const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { refreshPolicy } = require('../lib/refresh-policy');
const now = Date.parse('2026-10-16T18:00:00Z');
const scheduled = minutes => ({ state: 'scheduled', date: new Date(now + minutes * 60000).toISOString() });
const policy = (games, extra = {}) => refreshPolicy({ games, generatedAt: now, ...extra });

test('refresh adapts to live, imminent, distant and completed fixtures', () => {
  assert.equal(policy([{ state: 'live' }]).delay, 30000);
  assert.equal(policy([scheduled(10)]).delay, 60000);
  assert.equal(policy([scheduled(-120)]).delay, 60000);
  assert.equal(policy([scheduled(120)]).delay, 900000);
  assert.equal(policy([scheduled(20)]).delay, 300000);
  assert.equal(policy([{ state: 'final' }]).delay, 0);
  assert.equal(policy([scheduled(-400)]).delay, 900000);
});
test('stale final results retry; unknown times do not trigger frequent polling', () => {
  assert.equal(policy([{ state: 'final', stale: true }]).delay, 60000);
  assert.equal(policy([{ ...scheduled(0), timeUnknown: true }]).delay, 900000);
  assert.equal(policy([]).delay, 900000);
  assert.equal(policy([{ state: 'final' }], { scheduleStale: true }).delay, 60000);
});

function browser({ auto = '1', delay = 30000, hidden = false } = {}) {
  let clock = now, reloads = 0, id = 0;
  const timers = new Map(), listeners = {};
  const status = { getAttribute: name => name === 'data-auto' ? auto : String(delay) };
  const doc = { hidden, getElementById: name => name === 'live-refresh-status' ? status : null, addEventListener: (name, fn) => { listeners[name] = fn; } };
  const win = { location: { reload: () => { reloads++; } }, setTimeout: (fn, ms) => { timers.set(++id, { fn, at: clock + ms }); return id; }, clearTimeout: key => timers.delete(key), addEventListener: (name, fn) => { listeners[name] = fn; } };
  class Clock extends Date { constructor() { super(clock); } }
  vm.runInNewContext(fs.readFileSync('public/live-refresh.js', 'utf8'), { document: doc, window: win, Date: Clock });
  return { timers, doc, listeners, reloads: () => reloads, advance: ms => { clock += ms; for (const [key, t] of [...timers]) if (t.at <= clock) { timers.delete(key); t.fn(); } } };
}
test('hidden tabs cancel timers and refresh once on return after the deadline', () => {
  const b = browser();
  assert.equal(b.timers.size, 1);
  b.doc.hidden = true; b.listeners.visibilitychange();
  assert.equal(b.timers.size, 0);
  b.advance(60000);
  assert.equal(b.reloads(), 0);
  b.doc.hidden = false; b.listeners.visibilitychange();
  assert.equal(b.reloads(), 1);
});
test('returning before deadline keeps remaining time and does not duplicate timers', () => {
  const b = browser();
  b.advance(10000); b.doc.hidden = true; b.listeners.visibilitychange();
  b.advance(10000); b.doc.hidden = false; b.listeners.visibilitychange();
  b.listeners.pageshow();
  assert.equal(b.timers.size, 1);
  b.advance(9999); assert.equal(b.reloads(), 0);
  b.advance(1); assert.equal(b.reloads(), 1);
});
test('paused, completed and initially hidden pages never start a reload timer', () => {
  for (const options of [{ auto: '0' }, { delay: 0 }, { hidden: true }]) {
    const b = browser(options);
    assert.equal(b.timers.size, 0);
    b.advance(900000); assert.equal(b.reloads(), 0);
  }
});
