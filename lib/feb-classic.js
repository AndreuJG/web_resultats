const competitions = require('./competitions');
const { createSourceCache, unwrapSnapshot } = require('./source-cache');
const { normalizeGame } = require('./feb');
const { archivedRound, seasonKey } = require('./feb-archive');
const { roundCacheSeconds } = require('./feb-cache-policy');
const parser = require('./feb-classic-source');
const { createClient, liveGame } = require('./feb-live');
const { defaultRound, lastStartedRound } = require('./round-selection');
const archives = { LF: require('../data/lf-endesa.json'), TERCERA_EA: require('../data/tercera-feb.json') };
function createService({ competition = 'LF', cache, fetch: request = fetch, now = Date.now, defer, archive = archives[competition], calendarSeed = archive } = {}) {
  const config = competitions[competition];
  if (!archives[competition]) throw new Error('Unsupported FEB competition');
  const cached = createSourceCache(cache, now), live = createClient({ request, cache, now });
  const key = 'feb:classic:v2:' + competition;
  const season = () => seasonKey(now());
  const year = () => Number(season().slice(1));
  const group = competition === 'LF' ? 4 : 8;
  const url = (kind, mirror = false) => mirror ? `https://competiciones.feb.es/estadisticas/${kind}/${group}/${year()}` : `https://baloncestoenvivo.feb.es/${kind}.aspx?g=${group}&t=${year()}&nm=${competition === 'LF' ? 'lfendesa' : 'tercerafeb'}`;
  // WebForms page state and public viewer credential are kept in memory only.
  let page;
  async function read(kind) {
    let error;
    for (const mirror of [false, true]) {
      try {
        const response = await request(url(kind, mirror), { signal: AbortSignal.timeout(4500) });
        if (!response.ok) throw new Error('FEB classic HTTP ' + response.status);
        const html = await response.text();
        const meta = parser.context(html, competition, year());
        live.session(html);
        const document = { html, meta, url: response.url || url(kind, mirror), at: now(), cookie: (response.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ') };
        if (kind === 'resultados') page = document;
        return document;
      } catch (failure) {
        error = new Error('FEB classic ' + new URL(url(kind, mirror)).hostname + ': ' + failure.message + (failure.cause?.code ? ' [' + failure.cause.code + ': ' + failure.cause.message + ']' : ''));
      }
    }
    throw error;
  }
  async function results(round) {
    // Each request retains its own WebForms state even when different rounds
    // are requested concurrently by visitors or the standings refresh.
    let document = page;
    if (!document || now() - document.at > 300000 || round == null || document.meta.rounds.find(r => r.selected)?.round === Number(round)) document = await read('resultados');
    const chosen = round == null ? document.meta.rounds.find(r => r.selected) : document.meta.rounds.find(r => r.round === Number(round));
    if (!chosen) throw Object.assign(new Error('Unknown FEB round'), { status: 400 });
    if (!chosen.selected) {
      const response = await request(document.url, { method: 'POST', body: parser.postFields(document.html, chosen.id), headers: { Cookie: document.cookie }, signal: AbortSignal.timeout(4500) });
      if (!response.ok) throw new Error('FEB classic round HTTP ' + response.status);
      const html = await response.text(), meta = parser.context(html, competition, year());
      document = { ...document, html, meta, at: now() };
      page = document;
      live.session(html);
    }
    return parser.roundData(document.html, competition, year(), round);
  }

  function fallback(round) {
    const saved = (archive || calendarSeed)?.seasons?.[season()];
    if (!saved) return null;
    const entries = Object.values(saved.rounds);
    if (round != null) return saved.rounds[Number(round)];
    const current = defaultRound(entries.map(entry => entry.data), now());
    return entries.find(entry => entry.data.round === current?.round);
  }
  const loadRound = async round => {
    if (archive) { const data = archivedRound(archive, round, now(), competition); if (data) return data; }
    const previous = fallback(round);
    const snapshot = await cached(key + ':' + season() + ':' + (round || 'current:' + (previous?.data.round || 'official')), roundCacheSeconds, async () => {
      const due = !previous || previous.data.games.some(g => g.state !== 'final' && Date.parse(g.date) <= now() + 7200000 && Date.parse(g.date) >= now() - 172800000);
      const [classicResult, overviewResult] = await Promise.allSettled([results(round ?? previous?.data.round ?? null), due ? live.load() : Promise.resolve(null)]);
      const classic = classicResult.status === 'fulfilled' ? classicResult.value : null;
      const overview = overviewResult.status === 'fulfilled' ? overviewResult.value : null;
      if (!classic) {
        console.warn('FEB result source failed:', competition, classicResult.reason?.message);
        if (classicResult.reason?.status === 400) throw classicResult.reason;
        if (!previous || !archive) throw classicResult.reason;
        // Preserve real data with its original timestamp, even on a cold start.
        const data = unwrapSnapshot({ value: previous.data, at: previous.savedAt, stale: true }, now());
        for (const game of data.games) {
          const raw = (archive || calendarSeed)?.seasons?.[season()]?.calendar?.find(g => g.idPartido === game.code);
          const entry = overview?.value.find(g => Number(g.ID) === game.code);
          const update = raw && entry && liveGame(entry, raw, competition);
          if (update && ['final', 'live'].includes(update.state)) {
            Object.assign(game, normalizeGame(raw, update, now()), { checkedAt: overview.at, stale: overview.stale });
            if (overview.stale) game.label = 'Dades antigues · ' + game.label.replace('En joc', 'Últim marcador');
          }
        }
        return data;
      }
      const chosen = classic.round;
      const games = classic.games.map(base => {
        const raw = overview?.value.find(g => Number(g.ID) === base.idPartido);
        const candidate = raw && liveGame(raw, base, competition);
        const update = base.state === 'final' && overview?.stale ? null : candidate;
        const game = normalizeGame(base, update, now());
        if (update) game.checkedAt = overview.at;
        game.timeUnknown = !base.hora;
        if (update && overview.stale && game.state === 'live') { game.stale = true; game.checkedAt = overview.at; game.label = 'Dades antigues · Últim marcador'; }
        if (competition === 'TERCERA_EA' && ['live', 'final'].includes(game.state) && /TABERNES\s+BLANQUES/i.test(game.home.name + ' ' + game.away.name)) game.statsUrl = '/estadistiques-feb.html?partit=' + game.code + '&jornada=' + chosen;
        return game;
      }).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      return { competition, season: season(), round: chosen, rounds: classic.meta.rounds.map(r => r.round), games,
        standings: classic.standings.length ? { value: [{ name: config.title, teams: classic.standings }] } : null,
        standingsNote: 'Classificació oficial · Jornada ' + chosen, currentRound: round == null };
    }, 1209600, { defer });
    const data = unwrapSnapshot(snapshot, now());
    // Each source retains its own age. An archive fallback is not a fresh read.
    for (let i = 0; i < data.games.length; i++) {
      if (snapshot.value.games[i].checkedAt) data.games[i].checkedAt = snapshot.value.games[i].checkedAt;
    }
    if (snapshot.value.scheduleStale) {
      data.scheduleStale = true;
      data.scheduleRefreshing = false;
      for (let i = 0; i < data.games.length; i++) {
        if (snapshot.value.games[i].stale) data.games[i].refreshing = false;
      }
    }
    if (snapshot.value.standings?.stale && data.standings) { data.standings.stale = true; data.standings.refreshing = false; data.standings.at = snapshot.value.standings.at; }
    data.cacheSeconds = data.scheduleStale || data.games.some(g => g.stale) ? 10 : Math.max(1, Math.min(3600, Math.floor(roundCacheSeconds(snapshot.value, snapshot.at, now()) - (now() - snapshot.at) / 1000)));
    return data;
  };
  const load = async round => {
    const data = await loadRound(round);
    // Archival jobs keep the official historical table for each round intact.
    if (!archive) return data;
    const entries = Object.values(archive.seasons?.[season()]?.rounds || {});
    const current = lastStartedRound(entries.map(entry => entry.data), now()) || entries[0]?.data;
    const active = entries.some(entry => entry.data.games.some(g => g.state !== 'final' && Date.parse(g.date) <= now() + 7200000 && Date.parse(g.date) >= now() - 172800000));
    let latest;
    if (active && current && !(data.round === current.round && data.standings?.value?.some(g => g.teams.length) && !data.standings.stale && now() - data.standings.at < 60000)) {
      try {
        const table = await cached(key + ':' + season() + ':standings:' + current.round, 60, async () => {
          const official = await results(current.round);
          if (!official.standings.length) throw new Error('FEB current standings not published');
          return { round: current.round, standings: { value: [{ name: config.title, teams: official.standings }] }, standingsNote: 'Classificació oficial · Jornada ' + current.round };
        }, 1209600, { defer });
        latest = { ...table.value, standings: { ...table.value.standings, at: table.at, stale: table.stale, refreshing: table.refreshing } };
      } catch (error) { console.warn('FEB current standings:', competition, error.message); }
    }
    const candidates = entries.map(entry => ({ data: entry.data, at: entry.savedAt }));
    candidates.push({ data, at: data.standings?.at || now() });
    if (latest) candidates.push({ data: latest, at: latest.standings?.at || now() });
    const played = candidate => candidate.data.standings?.value?.reduce((sum, group) => sum + group.teams.reduce((n, t) => n + t.played, 0), 0) || 0;
    const selected = candidates.filter(c => c.data.standings?.value?.some(g => g.teams.length)).sort((a, b) => played(b) - played(a) || b.data.round - a.data.round || b.at - a.at)[0];
    if (selected) {
      data.standings = { ...structuredClone(selected.data.standings), at: selected.at };
      data.standingsNote = selected.data.standingsNote || 'Classificació oficial · Jornada ' + selected.data.round;
    }
    return data;
  };
  load.calendar = async () => {
    const { html } = await read('calendario');
    const previous = calendarSeed?.seasons?.[season()]?.calendar || [];
    return { season: season(), calendar: parser.calendarData(html, competition, year(), previous) };
  };
  return load;
}
module.exports = { createService };
