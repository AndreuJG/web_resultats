const { acbData } = require('./official-html');
const { madridDate } = require('./feb');
const { getText, createSourceCache } = require('./source-cache');
const MOVISTAR = 'https://www.movistarplus.es';
const GUIDE = MOVISTAR + '/deportesendirectobar';
const BASKET = MOVISTAR + '/deportes/baloncesto';
const ACB = 'https://www.acb.com/es/liga/partidos';
const text = value => String(value).replace(/<[^>]*>/g, ' ').replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:x[\da-f]+|\d+);/gi, x => ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' }[x] || String.fromCodePoint(x.startsWith('&#x') ? parseInt(x.slice(3), 16) : parseInt(x.slice(2), 10)))).replace(/\s+/g, ' ').trim();
const key = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\bbarca\b/g, 'barcelona').trim();
function competition(title) {
  if (/wnba/i.test(title)) return 'WNBA';
  if (/\bnba\b/i.test(title)) return 'NBA';
  const national = key(title);
  if (/(?:mundial|mundobasket|copa (?:del )?mundo|world cup|eurobasket|seleccion|seleccio|amistos|olimpic)/.test(national) && !/club/.test(national)) {
    if (/women|femen|feminin/.test(national)) return 'ESW';
    if (/mascul|mens|mundial.*2027|copa.*mundo.*2027|world cup.*2027|eurobasket.*2025/.test(national)) return 'ESM';
    if (/\b(?:espana|espanya|spain|esp)\b/.test(national)) return 'NATIONAL';
  }
  if (/liga[- ]u\b/i.test(title)) return 'LIGA_U';
  if (/euroliga.*femenina|euroleague women/i.test(title)) return 'ELW';
  if (/euroliga|euroleague/i.test(title)) return 'E';
  if (/eurocup.*(?:femen|women|feminin)/i.test(title) || /(?:femen|women|feminin).*eurocup/i.test(title)) return 'ECW';
  if (/eurocup/i.test(title)) return 'U';
  if (/lf[- ]endesa|liga[- ]femenina/i.test(title)) return 'LF';
  if (/liga[- ]endesa|liga[- ]acb/i.test(title)) return 'ACB';
  if (/champions[- ]league/i.test(title)) return 'BCL';
  if (/tercera[- ]feb/i.test(title)) return 'TERCERA_EA';
  return 'OTHER';
}
function fixture(title) { return text(title).replace(/^.*?:\s*/, '').replace(/\s*\(VO\)\s*$/, ''); }
function dayAt(now, offset = 0) {
  const [d, m, y] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid' }).format(now).split('/').map(Number);
  return new Date(Date.UTC(y, m - 1, d + offset));
}
function dateAt(d, time) { return madridDate(String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear(), time); }
function cardDate(label, now) {
  const value = key(label), time = label.match(/(\d{1,2}):(\d{2})h?/);
  if (!time) return null;
  let d;
  if (value.startsWith('hoy ')) d = dayAt(now);
  else if (value.startsWith('manana ')) d = dayAt(now, 1);
  else {
    const day = value.match(/(?:^|\s)(\d{1,2})(?:\s|$)/)?.[1];
    if (!day) return null;
    d = Array.from({ length: 32 }, (_, i) => dayAt(now, i)).find(date => date.getUTCDate() === Number(day));
  }
  return d ? dateAt(d, time[1].padStart(2, '0') + ':' + time[2]) : null;
}
function parseCards(html, now) {
  const events = [];
  for (const m of html.matchAll(/<a class="mplus-collection__title-seo" href="([^"]+)">([\s\S]*?)<\/a>\s*<p class\s*=\s*"mplus-collection__date">([^<]+)<\/p>/g)) {
    const context = html.slice(html.lastIndexOf('<li', m.index), m.index);
    if (/redifusi[oó]n|rediffusion/i.test(context)) continue;
    const url = text(m[1]), title = text(m[2]);
    if (!url.startsWith(BASKET + '/') || /redifusi[oó]n|resumen|previa/i.test(title)) continue;
    const date = cardDate(text(m[3]), now);
    if (date) events.push({ date, title: fixture(title), competition: competition(url + ' ' + title), source: url, channels: [] });
  }
  // Only follow the site's own pagination link, bounded by the caller.
  const next = html.match(/href="([^"]+)"[^>]*mplus-pagination__button--next[^>]*>Siguiente/)?.[1];
  return { events, next: next && text(next).startsWith(BASKET + '?') ? text(next).split('#')[0] : null };
}
function parseGuide(html) {
  if (!html.includes('fecha-bar')) throw new Error('Movistar guide format changed');
  const events = [], dials = {};
  for (const m of html.matchAll(/class="time-bar">([^<]+)\s*<span>/g)) {
    const c = text(m[1]).match(/^(.+?)\s*\(Dial (\d+)\)$/);
    if (c && !/\bBAR\b/i.test(c[1])) dials[key(c[1])] = c[2];
  }
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  for (const part of html.split('<span class="fecha-bar">').slice(1)) {
    const heading = text(part.split('</span>')[0]);
    const date = heading.match(/(\d{1,2}) de ([a-z]+) de (\d{4})/);
    if (!date || !months.includes(date[2])) continue;
    const section = part.split('<span class="box-medium">Baloncesto</span>')[1]?.split('<span class="box-medium">')[0];
    if (!section) continue;
    for (const m of section.matchAll(/<a href="([^"]+)">([^<]+)<\/a>\s*<ul>([\s\S]*?)<\/ul>/g)) {
      const title = text(m[2]), channels = [];
      for (const line of m[3].matchAll(/class="time-bar">([^<]+)<span>(\d{1,2})\.(\d{2})h<\/span>/g)) {
        const c = text(line[1]).match(/^(.+?)\s*\(Dial (\d+)\)$/);
        if (!c || /\bBAR\b/i.test(c[1])) continue;
        const time = line[2].padStart(2, '0') + ':' + line[3];
        channels.push({ name: c[1], dial: c[2], source: GUIDE });
        const iso = madridDate(date[1].padStart(2, '0') + '/' + String(months.indexOf(date[2]) + 1).padStart(2, '0') + '/' + date[3], time);
        events.push({ date: iso, title: fixture(title), competition: competition(title), channels: [channels.at(-1)], source: text(m[1]) });
      }
    }
  }
  return { events, dials };
}
function parseChannels(html, dials, source) {
  const blocks = [...html.matchAll(/class="box-medium pase-container">([\s\S]*?)<\/div>/g)];
  return [...new Map(blocks.flatMap(b => [...b[1].matchAll(/<img[^>]*alt="([^"]+)"/g)].map(m => {
    const name = text(m[1]);
    return [key(name), { name, dial: dials[key(name)] || null, source }];
  }))).values()];
}
function acbEvents(data) {
  return data.matches.flatMap(g => {
    const channels = Object.values(g.broadcastChannels || {}).flat().filter(c => /dazn|movistar|teledeporte|tve|la 1|la 2|tv3|esport|3cat|aragon|eitb|etb|tvg|a punt|à punt/i.test(c.name)).map(c => ({ name: c.name === 'DAZN' ? 'App DAZN' : /movistar/i.test(c.name) ? 'Movistar · canal pendent' : c.name, dial: null, source: ACB, app: c.name === 'DAZN' }));
    return channels.length ? [{ date: g.startDateTime, title: g.homeTeam.shortName + ' - ' + g.awayTeam.shortName, competition: 'ACB', channels, source: ACB }] : [];
  });
}
function sameFixture(a, b) {
  if (Math.abs(Date.parse(a.date) - Date.parse(b.date)) > 30 * 60000) return false;
  const teams = title => title.split(/\s+-\s+/).map(key);
  const x = teams(a.title), y = teams(b.title);
  const match = (s, t) => s === t || s.split(' ').some(w => w.length >= 4 && t.split(' ').includes(w));
  return x.length === 2 && y.length === 2 && match(x[0], y[0]) && match(x[1], y[1]) && (a.competition === b.competition || [a.competition, b.competition].includes('OTHER'));
}
function mergeEvents(events, now) {
  const start = Date.parse(dateAt(dayAt(now), '00:00'));
  const end = now + 7 * 86400000, result = [];
  const classified = events.map(e => competition((e.source || '') + ' ' + e.title) === 'ECW' ? { ...e, competition: 'ECW' } : e);
  for (const event of classified.filter(e => (!['ESM', 'ESW', 'NATIONAL'].includes(e.competition) || /\b(?:espana|espanya|spain|esp)\b/.test(key(e.title))) && !['NBA', 'WNBA'].includes(e.competition) && !/\b(?:nba|wnba)\b/i.test(e.title + ' ' + (e.source || '')) && Date.parse(e.date) >= start && Date.parse(e.date) < end).sort((a, b) => Date.parse(a.date) - Date.parse(b.date))) {
    const existing = result.find(e => sameFixture(e, event));
    if (!existing) { result.push(structuredClone(event)); continue; }
    existing.channels = [...new Map(existing.channels.concat(event.channels).map(c => [key(c.name), c])).values()];
    if (existing.competition === 'OTHER') existing.competition = event.competition;
  }
  // A precise channel is better than the platform placeholder for the same match.
  for (const event of result) if (event.channels.some(c => /^(M\+|Movistar Plus|DAZN Baloncesto)/.test(c.name))) event.channels = event.channels.filter(c => !c.name.includes('canal pendent'));
  return result;
}
function createService({ cache, request = fetch, now = Date.now } = {}) {
  const cached = createSourceCache(cache, now);
  return async () => {
    const snapshot = await cached('tv:v5:agenda', 3600, async () => {
      const start = Date.parse(dateAt(dayAt(now()), '00:00'));
      const errors = [], all = [];
      const guide = await getText(GUIDE, request).then(parseGuide).catch(() => { errors.push('Guia de directes de Movistar'); return { events: [], dials: {} }; });
      all.push(...guide.events);
      const cards = [];
      for (const start of [BASKET, BASKET + '?conf=iptv']) {
        let url = start;
        try {
          for (let i = 0; url && i < 3; i++) {
            const html = await getText(url, request), page = parseCards(html, now());
            if (!html.includes('mplus-collection__content')) throw new Error('Missing catalogue');
            cards.push(...page.events);
            url = page.events.some(e => Date.parse(e.date) > now() + 7 * 86400000) || !page.events.length ? null : page.next;
          }
        } catch { errors.push('Catàleg Movistar' + (start.includes('iptv') ? ' miMovistar' : '')); }
      }
      const unique = [...new Map(cards.filter(e => (!['ESM', 'ESW', 'NATIONAL'].includes(e.competition) || /\b(?:espana|espanya|spain|esp)\b/.test(key(e.title))) && !['NBA', 'WNBA'].includes(e.competition) && Date.parse(e.date) >= start && Date.parse(e.date) < now() + 7 * 86400000).map(e => [e.source, e])).values()];
      let missing = 0;
      for (let i = 0; i < unique.length; i += 4) {
        const batch = await Promise.all(unique.slice(i, i + 4).map(async event => {
          const known = guide.events.find(g => sameFixture(g, event));
          if (known) return { ...event, channels: known.channels };
          try {
            const detail = await cached('tv:detail:' + event.source, 3600, async () => parseChannels(await getText(event.source, request), guide.dials, event.source));
            if (!detail.value.length) missing++;
            return { ...event, channels: detail.value.length ? detail.value : [{ name: 'Movistar · canal pendent', dial: null, source: event.source }] };
          } catch { missing++; return { ...event, channels: [{ name: 'Movistar · canal pendent', dial: null, source: event.source }] }; }
        }));
        all.push(...batch);
      }
      try {
        const first = acbData(await getText(ACB, request), 'matches');
        all.push(...acbEvents(first));
        const selected = first.availableFilters.rounds.find(r => r.id === first.selectedFilters.round);
        const next = first.availableFilters.rounds.find(r => r.roundNumber === selected?.roundNumber + 1);
        if (next) {
          try { all.push(...acbEvents(acbData(await getText(ACB + '?jornada=' + next.id, request), 'matches'))); } catch { errors.push('Pròxima jornada ACB'); }
        }
      } catch { errors.push('ACB · DAZN i televisions públiques'); }
      if (!all.length && errors.length) throw new Error('TV sources unavailable');
      return { events: mergeEvents(all, now()), errors, missing, sourcesAt: now() };
    });
    return { ...snapshot.value, events: mergeEvents(snapshot.value.events, now()), stale: snapshot.stale, generatedAt: now() };
  };
}
module.exports = { createService, parseGuide, parseCards, parseChannels, acbEvents, mergeEvents, cardDate, competition, text, key };
