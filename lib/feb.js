const { toJSONAsync, fromJSON } = require('seroval');
const competitions = require('./competitions');
const { febData } = require('./official-html');
const { createSourceCache, getText, unwrapSnapshot } = require('./source-cache');
const { roundCacheSeconds } = require('./feb-cache-policy');
const { archivedRound, WEEK } = require('./feb-archive');
const savedArchives = { TERCERA_EA: require('../data/tercera-feb.json'), LF: require('../data/lf-endesa.json') };
const BASE = 'https://beta.competiciones.feb.es';
const validScore = value => /^(0|[1-9]\d{0,2})$/.test(String(value)) ? Number(value) : null;

function madridDate(date, time) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error('Invalid FEB date/time');
  const [day, month, year] = date.split('/').map(Number), [hour, minute] = time.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const zone = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Madrid', timeZoneName: 'shortOffset' });
  let utc = wall;
  for (let i = 0; i < 2; i++) {
    const offset = zone.formatToParts(utc).find(x => x.type === 'timeZoneName').value.match(/GMT([+-])(\d+)(?::(\d+))?/);
    if (!offset) throw new Error('Unknown Madrid offset');
    utc = wall - (offset[1] === '+' ? 1 : -1) * (Number(offset[2]) * 60 + Number(offset[3] || 0)) * 60000;
  }
  return new Date(utc).toISOString();
}

function normalizeGame(base, live, now = Date.now()) {
  if (!base.teamA?.name || !base.teamB?.name) throw new Error('Invalid FEB teams');
  const date = madridDate(base.fecha, base.hora || '00:00');
  if (live && live.idPartido !== base.idPartido) throw new Error('Wrong FEB live match');
  // A pre-game overview entry must not overwrite an authoritative final result.
  if (base.state === 'final' && live?.state === 'upcoming') live = null;
  const source = live || base;
  const homeScore = validScore(live ? live.scoreA : base.teamA.score), awayScore = validScore(live ? live.scoreB : base.teamB.score);
  const valid = homeScore !== null && awayScore !== null;
  const state = source.state === 'final' && valid ? 'final' : source.state === 'live' && valid ? 'live' : Date.parse(date) > now && source.state === 'upcoming' ? 'scheduled' : 'unavailable';
  const clock = live && /^\d{1,2}:\d{2}$/.test(live.clock) ? live.clock : '';
  return { code: base.idPartido, date, home: { name: base.teamA.name }, away: { name: base.teamB.name }, state, score: ['live', 'final'].includes(state) ? [homeScore, awayScore] : null, stale: false, label: state === 'final' ? 'Final' : state === 'live' ? 'En joc' + (live?.quarter ? ' · ' + live.quarter + 'Q' : '') + (clock ? ' · ' + clock : '') : state === 'scheduled' ? 'Pendent' : 'Marcador no disponible' };
}

function rangeDate(date, offset) {
  const [day, month, year] = date.split('/').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + offset));
  return String(d.getUTCDate()).padStart(2, '0') + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + d.getUTCFullYear();
}

function functionId(source, name) {
  const variable = source.match(new RegExp(name + ':\\(\\)=>([\\w$]+)'))?.[1];
  if (!variable) throw new Error('FEB function not found: ' + name);
  const id = source.match(new RegExp('\\b' + variable + '=\\w+\\(\\{method:`GET`\\}\\)\\.handler\\(\\w+\\(`([a-f0-9]{64})`\\)\\)'))?.[1];
  if (!id) throw new Error('FEB function identifier missing');
  return id;
}


function selectGroup(edition, phase, groupName) {
  if (!groupName) {
    if (phase.grupos.length !== 1) throw new Error('FEB group must be selected explicitly');
    return phase.grupos[0];
  }
  const definition = edition.feb.grupos?.find(g => g.nombreGrupoFront.replace(/^Grupo\s+/i, '').trim() === groupName);
  const group = definition && phase.grupos.find(g => g.idGrupo === definition.idGrupo);
  if (!group) throw new Error('Requested FEB group not found: ' + groupName);
  return group;
}

function filterCalendar(days, groupId) {
  return days.flatMap(d => d.matches).filter(g => g.idGrupo === groupId && /^J\d+$/.test(g.matchday));
}

function calendarWindows(window) {
  const parse = value => { const [d, m, y] = value.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const format = timestamp => {
    const d = new Date(timestamp);
    return String(d.getUTCDate()).padStart(2, '0') + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + d.getUTCFullYear();
  };
  const end = parse(window.fechaFin), ranges = [];
  for (let start = parse(window.fechaInicio); start <= end;) {
    const date = new Date(start);
    const next = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 2, 1);
    ranges.push({ fechaInicio: format(start), fechaFin: format(Math.min(end, next - 86400000)) });
    start = next;
  }
  return ranges;
}

function createBetaService({ competition = 'LF', cache, fetch: request = fetch, now = Date.now, defer, archive = savedArchives[competition], calendarSeed = archive } = {}) {
  const config = competitions[competition];
  if (!config?.febEdition) throw new Error('Unknown FEB competition');
  const optimized = ['TERCERA_EA', 'LF'].includes(competition);
  const prefix = 'feb:' + competition + ':v3';
  const cached = createSourceCache(cache, now);
  async function rpc(id, data) {
    const payload = data === undefined ? '' : '?payload=' + encodeURIComponent(JSON.stringify(await toJSONAsync({ data })));
    const response = await request(BASE + '/_serverFn/' + id + payload, { signal: AbortSignal.timeout(12000), headers: { 'x-tsr-serverFn': 'true', Accept: 'application/json' } });
    if (!response.ok) throw new Error('FEB service HTTP ' + response.status);
    const node = await response.json();
    const decoded = fromJSON(typeof node.t === 'object' ? node : { t: node, f: 127, m: [] });
    if (!decoded || decoded.error || decoded.result === undefined) throw new Error('FEB service data missing');
    return decoded.result;
  }
  async function metadata() {
    const html = await getText(BASE + '/' + config.febEdition + '/clasificacion', request);
    const root = febData(html);
    const edition = root.matches.find(m => m.b?.edition)?.b.edition;
    if (edition?.competitionId !== config.febEdition || !Number.isInteger(edition.feb?.idCategoria)) throw new Error('Invalid FEB edition');
    const queries = Object.values(root.dehydratedData).flatMap(x => x.queries || []);
    const context = queries.find(q => q.queryKey[1] === 'clasificacion-contexto')?.state.data;
    const phase = context?.fases.find(f => /liga regular/i.test(f.nombreFase));
    if (!phase?.grupos?.length) throw new Error('FEB regular phase missing');
    const funcsPath = html.match(/(?:src|href)="(\/assets\/feb\.functions-[\w.-]+\.js)"/)?.[1];
    const mainPath = html.match(/src="(\/assets\/index-[\w.-]+\.js)"/)?.[1];
    if (!funcsPath || !mainPath) throw new Error('FEB public resources missing');
    const [functions, main] = await Promise.all([getText(BASE + funcsPath, request), getText(BASE + mainPath, request)]);
    const pageIndex = main.indexOf('queryKey:[`feb`,`partidos-page`');
    const variable = main.slice(pageIndex, pageIndex + 800).match(/queryFn:\(\)=>(\w+)\(/)?.[1];
    const ranges = variable && main.match(new RegExp('\\b' + variable + '=\\w+\\(\\{method:`GET`\\}\\)\\.handler\\(\\w+\\(`([a-f0-9]{64})`\\)\\)'))?.[1];
    if (!ranges) throw new Error('FEB updated calendar service missing');
    return { category: edition.feb.idCategoria, year: edition.feb.idTemporada, window: edition.matchWindow, group: selectGroup(edition, phase, config.febGroup), ids: { games: functionId(functions, 'getPartidos'), standings: functionId(functions, 'getClasificacionFinal'), live: functionId(functions, 'getLiveOverview'), ranges } };
  }
  async function seasonCalendar(meta) {
    const saved = archive && archive.seasons['F' + meta.year];
    if (optimized && saved?.calendar?.length && now() - saved.updatedAt < WEEK) return saved.calendar;
    return (await cached(prefix + ':calendar:' + meta.year + ':' + meta.group.idGrupo, optimized ? 43200 : 300, async () => {
        // Category-wide calendars are truncated for large competitions. Fetch
        // short date windows, filter the group, then merge by official match ID.
        const seed = optimized && calendarSeed?.seasons?.['F' + meta.year];
        const closedIds = new Set(seed ? Object.values(seed.rounds).filter(entry => entry.closed).flatMap(entry => entry.data.games.map(g => g.code)) : []);
        const preserved = seed?.calendar?.filter(g => closedIds.has(g.idPartido)) || [];
        const pending = seed?.calendar?.filter(g => !closedIds.has(g.idPartido)) || [];
        if (seed?.calendar?.length && !pending.length) return preserved;
        const firstPending = pending.map(g => madridDate(g.fecha, '12:00')).sort()[0];
        const window = firstPending ? { ...meta.window, fechaInicio: rangeDate(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid' }).format(new Date(firstPending)), 0) } : meta.window;
        const windows = config.febGroup ? calendarWindows(window) : [window];
        const matches = [...preserved];
        for (let i = 0; i < windows.length; i += 2) {
          const pages = await Promise.all(windows.slice(i, i + 2).map(range => config.febGroup
            ? rpc(meta.ids.ranges, { idCategoria: meta.category, ranges: [{ fechaInicio: range.fechaInicio, fechaFin: rangeDate(range.fechaFin.replaceAll('-', '/'), 1) }] })
            : rpc(meta.ids.games, { idCategoria: meta.category, ...range })));
          for (const data of pages) {
            const days = config.febGroup && Array.isArray(data) ? [{ matches: data }] : data.days;
            if (!Array.isArray(days)) throw new Error('FEB calendar missing');
            matches.push(...filterCalendar(days, meta.group.idGrupo).filter(g => !closedIds.has(g.idPartido)));
          }
        }
        return [...new Map(matches.map(g => [g.idPartido, g])).values()];
      }, optimized ? 1209600 : 21600)).value;
  }
  const load = async roundParam => {
    if (optimized && archive) {
      const saved = archivedRound(archive, roundParam, now(), competition);
      if (saved) return saved;
    }
    const snapshot = await cached(prefix + ':round:' + (roundParam || 'current'), optimized ? roundCacheSeconds : 20, async () => {
      const meta = (await cached(prefix + ':metadata', 600, metadata)).value;
      const calendar = await seasonCalendar(meta);
      if (!calendar.length) throw new Error('No matches in selected FEB group');
      const rounds = [...new Set(calendar.map(g => Number(g.matchday.slice(1))))].sort((a, b) => a - b);
      const today = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid' }).format(now());
      const todayGames = calendar.filter(g => g.fecha === today);
      const future = calendar.filter(g => Date.parse(madridDate(g.fecha, g.hora || '00:00')) > now()).sort((a, b) => Date.parse(madridDate(a.fecha, a.hora || '00:00')) - Date.parse(madridDate(b.fecha, b.hora || '00:00')));
      const round = roundParam === null ? Number((todayGames[0] || future[0])?.matchday.slice(1) || rounds.at(-1)) : Number(roundParam);
      if (!rounds.includes(round)) { const e = new Error('Unknown FEB round'); e.status = 400; throw e; }
      const selected = calendar.filter(g => Number(g.matchday.slice(1)) === round);
      const dates = selected.map(g => g.fecha).sort((a, b) => Date.parse(madridDate(a, '12:00')) - Date.parse(madridDate(b, '12:00')));
      const tableRound = meta.group.jornadas.find(j => j.numJornada === round) || meta.group.jornadas.reduce((a, b) => a.numJornada > b.numJornada ? a : b);
      const nearMatch = !optimized || selected.some(g => g.state !== 'final' && Date.parse(madridDate(g.fecha, g.hora || '00:00')) <= now() + 7200000 && Date.parse(madridDate(g.fecha, g.hora || '00:00')) >= now() - 21600000);
      const [updated, live, table] = await Promise.all([
        rpc(meta.ids.ranges, { idCategoria: meta.category, ranges: [{ fechaInicio: rangeDate(dates[0], -1), fechaFin: rangeDate(dates.at(-1), 1) }] }),
        nearMatch ? rpc(meta.ids.live).catch(() => []) : Promise.resolve([]),
        rpc(meta.ids.standings, { idJornada: tableRound.idJornada, idCategoria: meta.category }).catch(() => null)
      ]);
      if (!Array.isArray(updated) || !Array.isArray(live)) throw new Error('FEB updated matches missing');
      const map = new Map(updated.filter(g => g.idGrupo === meta.group.idGrupo).map(g => [g.idPartido, g]));
      const liveMap = new Map(live.filter(g => g.idCategoria === meta.category).map(g => [g.idPartido, g]));
      const games = selected.map(g => normalizeGame(map.get(g.idPartido) || g, liveMap.get(g.idPartido), now())).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      for (const game of games) {
        if (competition === 'TERCERA_EA' && ['live', 'final'].includes(game.state) && /CB\s*TABERNES\s+BLANQUES/i.test(game.home.name + ' ' + game.away.name) && Number.isInteger(game.code)) {
          game.statsUrl = '/estadistiques-feb.html?partit=' + game.code + '&jornada=' + round;
        }
      }
      let standings = null;
      if (table?.rows?.length) {
        const teams = table.rows.map(t => {
          if (!t.nombreEquipo || ![t.posicion, t.pj, t.pg, t.pp].every(Number.isInteger) || t.pg + t.pp !== t.pj) throw new Error('Invalid FEB standing');
          return { name: t.nombreEquipo, position: t.posicion, played: t.pj, won: t.pg, lost: t.pp };
        });
        standings = { value: [{ name: config.title, teams }] };
      }
      return { competition, season: 'F' + meta.year, round, rounds, games, standings, standingsNote: 'Classificació oficial · Jornada ' + tableRound.numJornada,
        ...(optimized ? { currentRound: roundParam === null, nextMatchAt: roundParam === null && future.length ? Date.parse(madridDate(future[0].fecha, future[0].hora || '00:00')) : null } : {}) };
    }, optimized ? 1209600 : 21600, optimized ? { defer } : {});
    const result = unwrapSnapshot(snapshot, now());
    if (optimized) result.cacheSeconds = snapshot.stale ? 10 : Math.max(1, Math.min(3600, Math.floor(roundCacheSeconds(snapshot.value, snapshot.at, now()) - (now() - snapshot.at) / 1000)));
    return result;
  };
  load.calendar = async () => {
    const meta = (await cached(prefix + ':metadata', 600, metadata)).value;
    return { season: 'F' + meta.year, calendar: await seasonCalendar(meta) };
  };
  return load;
}

// Lazy import keeps shared date/game helpers available to the classic adapter.
function createService(options) { return require('./feb-classic').createService(options); }
module.exports = { createService, createBetaService, normalizeGame, madridDate, functionId, selectGroup, filterCalendar, calendarWindows };
