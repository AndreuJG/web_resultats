const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', agrave: 'à', egrave: 'è', ograve: 'ò', uuml: 'ü', ntilde: 'ñ', ccedil: 'ç', Ntilde: 'Ñ', Ccedil: 'Ç' };
function decode(value) {
  return String(value).replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (all, key) => {
    if (key[0] !== '#') return entities[key] ?? all;
    const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  });
}
const text = html => decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
function attrs(html) { return Object.fromEntries([...html.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m => [m[1].toLowerCase(), decode(m[2] ?? m[3])])); }
function options(html, suffix) {
  const select = [...html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)].find(m => (attrs(m[1]).id || '').endsWith(suffix));
  if (!select) throw new Error('FEB classic selector missing: ' + suffix);
  return [...select[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)].map(m => ({ value: Number(attrs(m[1]).value), label: text(m[2]), selected: /\bselected\b/i.test(m[1]) }));
}
function context(html, competition, year) {
  const expected = competition === 'LF' ? 'LF ENDESA' : 'TERCERA FEB';
  const title = text(html.match(/<span\b[^>]*class="liga"[^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
  const season = options(html, 'temporadasDropDownList').find(o => o.selected);
  const group = options(html, 'gruposDropDownList').find(o => o.selected);
  if (title !== expected || season?.value !== year || !group || !/^Liga Regular/i.test(group.label) || competition === 'TERCERA_EA' && !/\bE-A\b/.test(group.label)) throw new Error('Wrong FEB classic competition, season or group');
  const rounds = /jornadasDropDownList/.test(html) ? options(html, 'jornadasDropDownList').map(o => ({ id: o.value, round: Number(o.label.match(/^Jornada\s+(\d+)/)?.[1]), selected: o.selected })) : [];
  if (rounds.some(r => !r.id || !r.round)) throw new Error('Invalid FEB classic round list');
  const compId = [...html.matchAll(/<input\b([^>]*)>/gi)].map(m => attrs(m[1])).find(a => a.id === 'CodCategoriaHiddenField')?.value;
  return { year, group: group.value, rounds, compId };
}
function team(cell) {
  const m = [...cell.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].find(m => /Equipo\.aspx\?i=\d+/i.test(attrs(m[1]).href || ''));
  if (!m) throw new Error('FEB classic team missing');
  return { name: text(m[2]), classicId: Number(attrs(m[1]).href.match(/[?&]i=(\d+)/i)[1]) };
}
function matchId(cell) {
  const link = [...cell.matchAll(/<a\b([^>]*)>/gi)].map(m => attrs(m[1]).href).find(h => /Partido\.aspx\?p=\d+/i.test(h || ''));
  const id = link && Number(link.match(/[?&]p=(\d+)/i)[1]);
  if (!id) throw new Error('FEB classic match identity missing');
  return id;
}
function cells(table) { return [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => [...m[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1])).filter(c => c.length); }
function table(html, suffix) { return [...html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)].find(m => (attrs(m[1]).id || '').endsWith(suffix))?.[2]; }
function score(cell) {
  const m = text(cell).match(/^(\d{1,3})\s*-\s*(\d{1,3})$/);
  // A tied 0-0 placeholder is never an official final basketball result.
  return m && Number(m[1]) !== Number(m[2]) ? [m[1], m[2]] : null;
}
function roundData(html, competition, year, requested) {
  const meta = context(html, competition, year), chosen = meta.rounds.find(r => r.selected);
  if (!chosen || requested != null && chosen.round !== Number(requested)) throw new Error('FEB classic ignored round selection');
  const rows = table(html, '_jornadaDataGrid');
  if (!rows) throw new Error('FEB classic result table missing');
  const games = cells(rows).map(c => {
    if (c.length !== 4) throw new Error('Invalid FEB classic match row');
    const teams = [...c[0].matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)].map(m => team(m[0]));
    if (teams.length !== 2) throw new Error('Invalid FEB classic team pair');
    const result = score(c[1]), fecha = text(c[2]), hora = text(c[3]);
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(fecha) || hora && !/^\d{2}:\d{2}$/.test(hora)) throw new Error('Invalid FEB classic date');
    return { idPartido: matchId(c[1]), idGrupo: meta.group, matchday: 'J' + chosen.round, fecha, hora, state: result ? 'final' : 'upcoming', teamA: { ...teams[0], score: result?.[0] ?? '' }, teamB: { ...teams[1], score: result?.[1] ?? '' } };
  });
  if (!games.length || new Set(games.map(g => g.idPartido)).size !== games.length) throw new Error('Incomplete FEB classic round');
  const standingsTable = table(html, '_clasificacionDataGrid');
  const standings = standingsTable ? cells(standingsTable).map(c => {
    const [position, played, won, lost] = [c[0], c[2], c[3], c[4]].map(c => /^\d+$/.test(text(c || '')) ? Number(text(c)) : NaN);
    if (![position, played, won, lost].every(Number.isInteger) || position < 1 || won + lost !== played) throw new Error('Invalid FEB classic standing');
    return { name: team(c[1]).name, position, played, won, lost };
  }) : [];
  return { meta, round: chosen.round, games, standings };
}
function calendarData(html, competition, year, previous = []) {
  const meta = context(html, competition, year), saved = new Map(previous.map(g => [g.idPartido, g]));
  const games = [];
  for (const m of html.matchAll(/<h1\b[^>]*>\s*Jornada\s+(\d+)\s+(\d{2}\/\d{2}\/\d{4})\s*<\/h1>\s*<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    for (const c of cells(m[3])) {
      if (c.length !== 3) throw new Error('Invalid FEB classic calendar row');
      const id = matchId(c[1]), old = saved.get(id), result = score(c[1]);
      const date = text(c[1]).match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})/);
      games.push({ idPartido: id, idGrupo: meta.group, matchday: 'J' + Number(m[1]), fecha: date?.[1] || old?.fecha || m[2], hora: date?.[2] || old?.hora || '', state: result ? 'final' : 'upcoming', teamA: { ...team(c[0]), score: result?.[0] ?? '' }, teamB: { ...team(c[2]), score: result?.[1] ?? '' } });
    }
  }
  if (!games.length || new Set(games.map(g => g.idPartido)).size !== games.length) throw new Error('FEB classic calendar missing or duplicated');
  return games;
}
function postFields(html, roundId) {
  const form = new URLSearchParams();
  for (const m of html.matchAll(/<input\b([^>]*)>/gi)) {
    const a = attrs(m[1]);
    if (a.type === 'hidden' && a.name && !/token/i.test(a.name)) form.set(a.name, a.value || '');
  }
  for (const m of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const a = attrs(m[1]), selected = [...m[2].matchAll(/<option\b([^>]*)>/gi)].find(o => /\bselected\b/i.test(o[1]));
    if (a.name && selected) form.set(a.name, attrs(selected[1]).value);
    if ((a.id || '').endsWith('jornadasDropDownList')) form.set(a.name, String(roundId));
  }
  return form;
}
module.exports = { decode, attrs, context, roundData, calendarData, postFields };
