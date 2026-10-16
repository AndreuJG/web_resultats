const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const tv = require('../lib/tv');
const { render } = require('../lib/euroleague-page');
const now = Date.parse('2026-10-16T12:00:00Z');
test('round selectors submit immediately even when automatic refresh is paused', () => {
  let change, submissions = 0;
  const button = { style: {} };
  const form = { submit: () => submissions++, querySelector: () => button };
  const select = { addEventListener: (name, fn) => { assert.equal(name, 'change'); change = fn; } };
  const status = { getAttribute: () => '0' };
  vm.runInNewContext(fs.readFileSync('public/live-refresh.js', 'utf8'), { document: { getElementById: id => ({ 'round-form': form, jornada: select, 'live-refresh-status': status })[id] } });
  change(); assert.equal(submissions, 1); assert.equal(button.style.display, 'none');
});
test('previous and next links preserve pause and omit unavailable rounds; Tabernes score links to official match', () => {
  const data = { competition: 'TERCERA_EA', season: 'F2026', round: 1, rounds: [1, 2, 3], generatedAt: now, games: [{ home: { name: 'CB TABERNES BLANQUES' }, away: { name: 'UXO' }, date: '2026-10-05T18:45:00Z', state: 'final', label: 'Final', score: [72, 83], statsUrl: 'https://beta.competiciones.feb.es/tercera-feb/partido/2537572' }] };
  let html = render(data, false);
  assert.doesNotMatch(html, /← Anterior/);
  assert.match(html, /jornada=2&amp;auto=0">Següent/);
  assert.match(html, /href="https:\/\/beta.competiciones.feb.es\/tercera-feb\/partido\/2537572"[^>]*>72 – 83<\/a>/);
  assert.match(html, /Estadístiques FEB ↗/);
  html = render({ ...data, round: 3 });
  assert.match(html, /jornada=2">← Anterior/);
  assert.doesNotMatch(html, /Següent →/);
});
test('TV dates handle Madrid and month rollover; catalogue ignores unscheduled reruns', () => {
  assert.equal(tv.cardDate('Mañana - 18:00h', Date.parse('2026-10-31T12:00:00Z')), '2026-11-01T17:00:00.000Z');
  assert.equal(tv.cardDate('dom 1 - 18:00h', Date.parse('2026-10-31T12:00:00Z')), '2026-11-01T17:00:00.000Z');
  const url = 'https://www.movistarplus.es/deportes/baloncesto/euroliga-femenina-26-27/valencia/ficha?id=1';
  const html = `<a class="mplus-collection__title-seo" href="${url}">Jornada 2: Valencia - Basket</a><p class = "mplus-collection__date">Mañana - 18:00h</p><a class="mplus-collection__title-seo" href="${url}">Redifusión: Valencia - Basket</a><p class = "mplus-collection__date">Mañana - 20:00h</p>`;
  const cards = tv.parseCards(html, now).events;
  assert.equal(cards.length, 1); assert.equal(cards[0].competition, 'ELW');
});
test('guide keeps public TV and official dials, excludes BAR feeds and other sports', () => {
  const event = (name, channel) => `<a href="https://www.movistarplus.es/deportes/baloncesto/test">${name}</a><ul><li class="time-bar">${channel} <span>18.00h</span></li></ul>`;
  const html = `<span class="fecha-bar">sábado 17 de octubre de 2026</span><span class="box-medium">Baloncesto</span>${event('LF Endesa (T26/27): Club A - Club B', 'Teledeporte (Dial 80)')}${event('EuroCup (T26/27): Club C - Club D', 'M+ Vamos BAR (Dial 307)')}<span class="box-medium">Fútbol</span>${event('Liga Endesa: Fake - Fake', 'M+ Baloncesto (Dial 66)')}`;
  const guide = tv.parseGuide(html);
  assert.equal(guide.events.length, 1); assert.equal(guide.events[0].channels[0].dial, '80');
  assert.equal(guide.events[0].date, '2026-10-17T16:00:00.000Z');
  assert.equal(guide.events[0].competition, 'LF');
  assert.throws(() => tv.parseGuide('<html>unavailable</html>'));
});
test('agenda merges simulcasts and pre-game broadcasts but separates different competitions and dates', () => {
  const event = { date: '2026-10-17T16:00:00Z', title: 'Kids&Us Manresa - Unicaja', competition: 'ACB', channels: [{ name: 'App DAZN' }] };
  const other = { ...event, date: '2026-10-17T15:51:00Z', title: 'Manresa - Unicaja', channels: [{ name: 'Movistar Plus' }] };
  const events = tv.mergeEvents([event, other, { ...other, competition: 'U' }, { ...event, date: '2026-10-25T16:00:00Z' }, { ...event, date: '2026-10-15T16:00:00Z' }], now);
  assert.equal(events.length, 2); assert.equal(events[0].channels.length, 2);
  assert.equal(events[0].date, other.date);
});
test('ACB broadcast platform is not mislabelled as a specific linear channel or dial', () => {
  const events = tv.acbEvents({ matches: [{ startDateTime: '2026-10-17T16:00:00Z', homeTeam: { shortName: 'A' }, awayTeam: { shortName: 'B' }, broadcastChannels: { primary: [{ name: 'DAZN' }, { name: 'Movistar Plus +' }, { name: 'Orange' }], secondary: [{ name: 'TV3/3Cat' }] } }] });
  assert.deepEqual(events[0].channels.map(c => c.name), ['App DAZN', 'Movistar · canal pendent', 'TV3/3Cat']);
  assert.ok(events[0].channels.every(c => c.dial === null));
});
test('unknown channel dial stays pending and TV output escapes source text', () => {
  const channels = tv.parseChannels('<div class="box-medium pase-container"><img alt="M+ Vamos 2"></div>', {}, 'https://www.movistarplus.es/ficha');
  assert.equal(channels[0].dial, null);
  const html = require('../lib/tv-page').render({ events: [{ date: '2026-10-17T16:00:00Z', title: '<script>x</script> - B', competition: 'ELW', source: 'https://www.movistarplus.es/ficha', channels }], generatedAt: now, sourcesAt: now, errors: [], missing: 0 });
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/); assert.match(html, /Dial no publicat/);
});
