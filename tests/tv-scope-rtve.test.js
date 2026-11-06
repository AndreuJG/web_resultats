const test = require('node:test');
const assert = require('node:assert/strict');
const tv = require('../lib/tv');
const now = Date.parse('2026-11-06T10:00:00Z');
const source = 'https://www.rtve.es/deportes/20261030/seleccion-eurobasket/17293389.shtml';
const announcement = 'Espa&ntilde;a - Rep&uacute;blica Checa, en directo el 10 de noviembre a las 20:30h en Teledeporte y RTVE Play';
const article = (line = announcement, url = source) => `<article class="cell"><h2><a href="${url}">Convocatoria</a></h2><ul><li>${line}</li></ul></article>`;
const tags = sex => `<meta name="RTVE.tags_libres" content="_Eurobasket_,_Baloncesto_,_Selecci&oacute;n espa&ntilde;ola ${sex} de baloncesto_"/>`;

test('TV scope removes Liga U, unknown cups and foreign national fixtures including cached misclassifications', () => {
  const event = { date: '2026-11-10T19:30:00Z', title: 'España - República Checa', competition: 'ESW', channels: [] };
  const events = [event, { ...event, title: 'Bulgaria - Croacia' }, { ...event, competition: 'LIGA_U' },
    { ...event, competition: 'U', source: 'https://www.movistarplus.es/deportes/baloncesto/liga-u-26-27/ficha' },
    { ...event, competition: 'OTHER' }, { ...event, competition: 'NBA' }];
  assert.deepEqual(tv.mergeEvents(events, now), [event]);
  assert.equal(tv.mergeEvents([{ ...event, competition: 'ESM' }], now)[0].competition, 'ESM');
});

test('RTVE announcements require Spain, explicit live date and channels, and a current article year', () => {
  const result = tv.parseRtveAnnouncements(article(), now);
  assert.equal(result.length, 1);
  assert.equal(result[0].date, '2026-11-10T19:30:00.000Z');
  assert.equal(result[0].title, 'España - República Checa');
  assert.deepEqual(result[0].channels.map(c => c.name), ['Teledeporte', 'RTVE Play']);
  assert.equal(result[0].channels[0].dial, null);
  for (const line of [announcement.replace('Espa&ntilde;a', 'Bulgaria'), announcement.replace('en directo', 'en diferido'), announcement.replace('10 de noviembre', '31 de noviembre'), announcement.replace('20:30', '25:30'), announcement.replace('Teledeporte y RTVE Play', 'un canal pendiente'), announcement.replace('Espa&ntilde;a', 'Espa&ntilde;a sub-20')]) {
    assert.deepEqual(tv.parseRtveAnnouncements(article(line), now), []);
  }
  assert.deepEqual(tv.parseRtveAnnouncements(article(announcement, source.replace('20261030', '20251030')), now), []);
  assert.deepEqual(tv.parseRtveAnnouncements(article(announcement, source.replace('www.rtve.es', 'fake.example')), now), []);
  assert.equal(tv.parseRtveAnnouncements(article('España - Francia, en directo el 2 de enero a las 18:00h en Teledeporte', source.replace('20261030', '20261230')), Date.parse('2026-12-31T10:00:00Z'))[0].date, '2027-01-02T17:00:00.000Z');
  assert.equal(tv.rtveSelection(tags('femenina')), 'ESW');
  assert.equal(tv.rtveSelection(tags('masculina')), 'ESM');
  assert.equal(tv.rtveSelection(tags('femenina').replace('_Eurobasket_', '_Selección española masculina de baloncesto_')), null);
  assert.equal(tv.rtveSelection(tags('femenina').replace('baloncesto', 'fútbol')), null);
  assert.equal(tv.rtveSelection('<title>España en el Eurobasket</title>'), null);
});

test('Movistar guide identifies national competition from URL when title contains only teams', () => {
  const html = '<span class="fecha-bar">martes 10 de noviembre de 2026</span><span class="box-medium">Baloncesto</span><a href="https://www.movistarplus.es/deportes/baloncesto/eurobasket-femenino-2027/ficha">España - República Checa</a><ul><li class="time-bar">Teledeporte (Dial 80)<span>20.30h</span></li></ul>';
  assert.equal(tv.parseGuide(html).events[0].competition, 'ESW');
});

test('agenda integrates verified RTVE announcements once, skips Liga U details and preserves the hourly cache', async () => {
  const calls = [];
  const load = tv.createService({ now: () => now, request: async url => {
    calls.push(url);
    if (url === source) return new Response(tags('femenina'));
    if (url.startsWith('https://www.rtve.es/temas/')) return new Response(article());
    if (url.includes('deportesendirectobar')) return new Response('<span class="fecha-bar">viernes 6 de noviembre de 2026</span><li class="time-bar">Teledeporte (Dial 80) <span>20.30h</span></li>');
    if (url.includes('acb.com')) return new Response('<script>self.__next_f.push(' + JSON.stringify([1, 'a:' + JSON.stringify({ matches: [], availableFilters: { rounds: [] }, selectedFilters: {} }) + '\n']) + ')</script>');
    if (url.includes('liga-u')) throw new Error('Must not request excluded fixture details');
    return new Response('<div class="mplus-collection__content"><a class="mplus-collection__title-seo" href="https://www.movistarplus.es/deportes/baloncesto/liga-u-26-27/a-b/ficha">A - B</a><p class="mplus-collection__date">Hoy - 12:00h</p></div>');
  } });
  const first = await load();
  assert.equal(first.events.length, 1);
  assert.equal(first.events[0].competition, 'ESW');
  assert.equal(first.events[0].channels[0].dial, '80');
  assert.equal(calls.filter(u => u === source).length, 1);
  assert.equal(calls.some(u => u.includes('liga-u')), false);
  const count = calls.length;
  assert.deepEqual((await load()).events, first.events);
  assert.equal(calls.length, count);
  assert.match(require('../lib/tv-page').render(first), /RTVE Play/);
});
