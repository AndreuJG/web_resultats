const { acbData } = require('./official-html');
const { madridDate } = require('./feb');
const { getText, createSourceCache } = require('./source-cache');
const MOVISTAR = 'https://www.movistarplus.es';
const GUIDE = MOVISTAR + '/deportesendirectobar';
const BASKET = MOVISTAR + '/deportes/baloncesto';
const ACB = 'https://www.acb.com/es/liga/partidos';
const RTVE = ['https://www.rtve.es/temas/eurobasket/33090/', 'https://www.rtve.es/temas/seleccion-de-baloncesto/10194/'];
const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', agrave: 'à', egrave: 'è', ograve: 'ò', ccedil: 'ç' };
const text = value => String(value).replace(/<[^>]*>/g, ' ').replace(/&([a-z]+);|&#(x[\da-f]+|\d+);/gi, (x, name, num) => num ? String.fromCodePoint(num[0].toLowerCase() === 'x' ? parseInt(num.slice(1), 16) : Number(num)) : entities[name.toLowerCase()] || x).replace(/\s+/g, ' ').trim();
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
// Apply the same scope before detail requests and after reading an old agenda.
function inScope(event) {
  const detected = competition((event.source || '') + ' ' + event.title);
  if (['NBA', 'WNBA', 'LIGA_U'].includes(detected)) return false;
  if (!['ACB', 'LF', 'E', 'ELW', 'U', 'ECW', 'BCL', 'TERCERA_EA', 'ESM', 'ESW', 'NATIONAL'].includes(event.competition)) return false;
  return !['ESM', 'ESW', 'NATIONAL'].includes(event.competition) || /\b(?:espana|espanya|spain|esp)\b/.test(key(event.title));
}
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
        events.push({ date: iso, title: fixture(title), competition: competition(text(m[1]) + ' ' + title), channels: [channels.at(-1)], source: text(m[1]) });
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
    return channels.length ? [{ date: g.startDateTime, title: (g.homeTeam.fullName || g.homeTeam.shortName) + ' - ' + (g.awayTeam.fullName || g.awayTeam.shortName), competition: 'ACB', channels, source: ACB }] : [];
  });
}
function parseRtveAnnouncements(html, now) {
  const events = [], months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  for (const block of html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g)) {
    const source = block[1].match(/href="(https:\/\/www\.rtve\.es\/deportes\/(\d{4})(\d{2})(\d{2})\/[^"<>]+\.shtml)"/);
    if (!source) continue;
    for (const li of block[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)) {
      const line = text(li[1]);
      const m = line.match(/^(.+?\s+[-–]\s+.+?),\s+en directo el (\d{1,2}) de (\w+)(?: de (\d{4}))? a las (\d{1,2}):(\d{2})h? en (.+)$/i);
      if (!m || !/\b(?:espana|espanya|spain)\b/.test(key(m[1]))) continue;
      const month = months.indexOf(m[3].toLowerCase()) + 1;
      if (!month || +m[2] < 1 || +m[2] > 31 || +m[5] > 23 || +m[6] > 59) continue;
      const year = m[4] ? +m[4] : +source[2] + (month < +source[3] ? 1 : 0);
      if (new Date(Date.UTC(year, month - 1, +m[2])).getUTCMonth() + 1 !== month) continue;
      const date = madridDate(m[2].padStart(2, '0') + '/' + String(month).padStart(2, '0') + '/' + year, m[5].padStart(2, '0') + ':' + m[6]);
      // Old articles cannot announce a new event merely because the month matches.
      const stamp = Date.parse(date), published = Date.parse(source[2] + '-' + source[3] + '-' + source[4]);
      if (stamp < published || stamp - published > 62 * 86400000 || stamp < Date.parse(dateAt(dayAt(now), '00:00')) || stamp >= now + 7 * 86400000) continue;
      const channels = [];
      if (/\bTeledeporte\b/i.test(m[7])) channels.push({ name: 'Teledeporte', source: source[1], dial: null });
      if (/\bRTVE Play\b/i.test(m[7])) channels.push({ name: 'RTVE Play', source: source[1], dial: null, app: true });
      if (channels.length && !/\b(?:sub\s*\d+|u\s*\d+|3x3)\b/.test(key(m[1]))) events.push({ date, title: m[1], source: source[1], channels });
    }
  }
  return [...new Map(events.map(e => [e.source + e.date + key(e.title), e])).values()];
}
function rtveSelection(html) {
  // Validate the sport and the explicit selection, never infer sex from a rival.
  const tags = html.match(/<meta[^>]*name="rtve\.tags_libres"[^>]*content="([^"]*)"/i)?.[1];
  const value = key(tags || '');
  const women = /seleccion espanola femenina de baloncesto/.test(value);
  const men = /seleccion espanola masculina de baloncesto/.test(value);
  return women === men ? null : women ? 'ESW' : 'ESM';
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
  for (const event of classified.filter(e => inScope(e) && Date.parse(e.date) >= start && Date.parse(e.date) < end).sort((a, b) => Date.parse(a.date) - Date.parse(b.date))) {
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
    const snapshot = await cached('tv:v7:agenda', 3600, async () => {
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
      const unique = [...new Map(cards.filter(e => inScope(e) && Date.parse(e.date) >= start && Date.parse(e.date) < now() + 7 * 86400000).map(e => [e.source, e])).values()];
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
      const announcements = (await Promise.all(RTVE.map(async url => {
        try { return parseRtveAnnouncements(await getText(url, request), now()); }
        catch { errors.push('Anuncis de RTVE'); return []; }
      }))).flat();
      const articles = new Map();
      for (const event of announcements) {
        try {
          if (!articles.has(event.source)) articles.set(event.source, await cached('tv:rtve:' + event.source, 3600, async () => rtveSelection(await getText(event.source, request))));
          const detail = articles.get(event.source);
          if (detail.stale) { errors.push('Anuncis de RTVE'); continue; }
          if (detail.value) all.push({ ...event, competition: detail.value, channels: event.channels.map(c => ({ ...c, dial: c.name === 'Teledeporte' ? guide.dials[key(c.name)] || null : null })) });
        } catch { errors.push('Anuncis de RTVE'); }
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
      return { events: mergeEvents(all, now()), errors: [...new Set(errors)], missing, sourcesAt: now() };
    });
    return { ...snapshot.value, events: mergeEvents(snapshot.value.events, now()), stale: snapshot.stale, generatedAt: now() };
  };
}
module.exports = { createService, parseGuide, parseCards, parseChannels, acbEvents, mergeEvents, cardDate, competition, text, key, parseRtveAnnouncements, rtveSelection };
