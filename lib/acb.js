const { acbData } = require('./official-html');
const { createSourceCache, getText, unwrapSnapshot } = require('./source-cache');
const { resultCacheSeconds, attachStandings } = require('./result-cache-policy');
const { defaultRound, hasStarted, nextMatchAt } = require('./round-selection');
const BASE = 'https://www.acb.com/es/liga/';
const { createClient } = require('./acb-live');

function regresses(next, previous) {
  if (!previous || next.id !== previous.id || next.homeTeam?.shortName !== previous.homeTeam?.shortName || next.awayTeam?.shortName !== previous.awayTeam?.shortName) return false;
  if (previous.matchStatus === 'FINALIZED' && next.matchStatus !== 'FINALIZED') return true;
  if (/POSTPON|CANCEL|SUSPEND/i.test(next.matchStatus)) return false;
  if (!['FINALIZED', 'STARTED', 'LIVE', 'PLAYING', 'IN_PROGRESS'].includes(previous.matchStatus)) return false;
  if (!['FINALIZED', 'STARTED', 'LIVE', 'PLAYING', 'IN_PROGRESS'].includes(next.matchStatus)) return true;
  if (Number(next.currentQuarter) < Number(previous.currentQuarter)) return true;
  return Number.isInteger(previous.homeScore) && Number.isInteger(previous.awayScore)
    && (next.homeScore < previous.homeScore || next.awayScore < previous.awayScore);
}
function sameScore(a, b) {
  return a && b && a.id === b.id && a.homeTeam?.shortName === b.homeTeam?.shortName && a.awayTeam?.shortName === b.awayTeam?.shortName
    && a.homeScore === b.homeScore && a.awayScore === b.awayScore && a.matchStatus === b.matchStatus && a.currentQuarter === b.currentQuarter;
}

function acbGame(g, now = Date.now()) {
  if (!g.homeTeam?.shortName || !g.awayTeam?.shortName || !Number.isFinite(Date.parse(g.startDateTime))) throw new Error('Invalid ACB match');
  const state = g.matchStatus === 'FINALIZED' ? 'final' : ['IN_PROGRESS', 'LIVE', 'PLAYING', 'STARTED'].includes(g.matchStatus) ? 'live' : g.matchStatus === 'NOT_STARTED' && Date.parse(g.startDateTime) > now ? 'scheduled' : 'unavailable';
  const score = ['live', 'final'].includes(state) && [g.homeScore, g.awayScore].every(x => Number.isInteger(x) && x >= 0) ? [g.homeScore, g.awayScore] : null;
  if (['live', 'final'].includes(state) && !score) throw new Error('Invalid ACB score');
  return { code: g.id, date: g.startDateTime, home: { name: g.homeTeam.shortName }, away: { name: g.awayTeam.shortName }, score, state, postponed: /POSTPON|CANCEL|SUSPEND/i.test(g.matchStatus), stale: false, label: state === 'final' ? 'Final' : state === 'live' ? 'En joc' + (g.isOnHalfTime ? ' · Descans' : g.currentQuarter ? ' · ' + g.currentQuarter + 'Q' : '') : state === 'scheduled' ? 'Pendent' : 'Marcador no disponible' };
}

function normalize(matches, table, now = Date.now()) {
  const filters = matches.availableFilters;
  const roundInfo = filters.rounds.find(r => r.id === matches.selectedFilters.round);
  const season = filters.seasons.find(s => s.id === matches.selectedFilters.season);
  if (!roundInfo || !season || !matches.matches.length || table && table.selectedFilters.season !== season.id) throw new Error('Invalid ACB season/round');
  const teams = (table?.standings || []).map(t => {
    if (!t.team?.shortName || ![t.position, t.matchesPlayed, t.wins, t.losses].every(Number.isInteger) || t.wins + t.losses !== t.matchesPlayed) throw new Error('Invalid ACB standing');
    return { name: t.team.shortName, position: t.position, played: t.matchesPlayed, won: t.wins, lost: t.losses };
  });
  if (table && teams.length < 2) throw new Error('ACB standings missing');
  const tableRound = table?.availableFilters.rounds.find(r => r.id === table.selectedFilters.round)?.roundNumber;
  return { competition: 'ACB', season: 'A' + season.startYear, round: roundInfo.roundNumber, rounds: filters.rounds.filter(r => r.roundNumber > 0).map(r => r.roundNumber), games: matches.matches.map(g => acbGame(g, now)).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)), standingsNote: table ? 'Classificació oficial actual' + (tableRound ? ' · Jornada ' + tableRound : '') : undefined, standings: table ? { phase: table.totalRounds === 34 && tableRound >= 1 && tableRound <= 34 && table.availableFilters.rounds.find(r => r.id === table.selectedFilters.round)?.subphaseId == null ? 'regular-season' : undefined, value: [{ name: 'Lliga Endesa', teams: teams.sort((a, b) => a.position - b.position) }] } : null };
}

function createService({ cache, fetch: request = fetch, now = Date.now, defer } = {}) {
  const cached = createSourceCache(cache, now);
  const live = createClient({ cache, request, now });
  const page = async (url, type) => acbData(await getText(url, request), type);
  return async roundParam => {
    const initial = await cached('acb:v2:context', 300, () => page(BASE + 'partidos', 'matches'), 2592000, { defer });
    const season = initial.value.selectedFilters.season;
    const filters = initial.value.availableFilters.rounds.filter(r => r.roundNumber > 0).sort((a, b) => a.roundNumber - b.roundNumber);
    const table = await cached('acb:v2:standings:' + season, 60, async () => {
      const value = await page(BASE + 'clasificacion', 'standings');
      normalize(initial.value, value, now());
      return value;
    }, 2592000, { defer }).catch(() => null);
    const official = filters.find(r => r.id === initial.value.selectedFilters.round);
    let chosen = roundParam == null ? official : filters.find(r => r.roundNumber === Number(roundParam));
    if (!chosen) throw Object.assign(new Error('Unknown ACB round'), { status: 400 });
    const witnesses = new Map();
    const gamesFor = selected => cached('acb:v2:games:' + season + ':' + selected.id,
      (value, at, time) => resultCacheSeconds(value.matches.map(g => acbGame(g, time)), at, time, 86400),
      async () => {
        // Context is for season/round discovery, never a second live-score cache.
        // Reuse it only for completed or distant fixtures.
        const quiet = !initial.value.matches.some(g => {
          const view = acbGame(g, now()), start = Date.parse(view.date);
          return view.state === 'live' || view.state !== 'final' && start <= now() + 7200000 && start >= now() - 28800000;
        });
        const active = selected.id === official.id && !quiet;
        const general = active ? getText(BASE + 'partidos', (url, options) => request(url, { ...options, signal: AbortSignal.timeout(2500) }))
          .then(h => acbData(h, 'matches')).catch(() => null) : Promise.resolve(null);
        let value;
        try { value = quiet && selected.id === official.id && !initial.stale && now() - initial.at < 20000 ? initial.value : await page(BASE + 'partidos?jornada=' + selected.id, 'matches'); }
        catch (error) { value = await general; if (!value) throw error; }
        const witness = await general;
        if (value.selectedFilters.season !== season || value.selectedFilters.round !== selected.id || !value.matches.length) throw new Error('ACB selection ignored');
        value.matches.forEach(g => acbGame(g, now()));
        if (witness?.selectedFilters.season === season && witness.selectedFilters.round === selected.id && witness.matches.length === value.matches.length) {
          try {
            witness.matches.forEach(g => acbGame(g, now()));
            witnesses.set(selected.id, witness);
            // Select a complete official observation, never independently take
            // maximum points or combine scores from different observations.
            if (value.matches.every(g => witness.matches.some(w => w.id === g.id && !regresses(w, g)))
              && value.matches.some(g => regresses(g, witness.matches.find(w => w.id === g.id)))) value = witness;
          } catch { /* A malformed auxiliary source cannot hide the valid round. */ }
        }
        return value;
      }, 2592000, { defer, reconcile: async (next, previous) => {
        if (!previous && initial.value.selectedFilters.round === selected.id) previous = initial;
        if (!previous || !next.value.matches.some(g => regresses(g, previous.value.matches.find(p => p.id === g.id)))) return next;
        // A lower score may be a genuine correction. Keep the last observation
        // marked old until progress catches up or two routes confirm a final.
        let witness;
        try {
          witness = witnesses.get(selected.id) || await page(BASE + 'partidos', 'matches');
          if (witness.selectedFilters.season !== season || witness.selectedFilters.round !== selected.id) witness = null;
          if (witness) witness.matches.forEach(g => acbGame(g, now()));
        } catch { witness = null; /* Preserve the last valid snapshot with its original timestamp. */ }
        if (witness && witness.matches.length === next.value.matches.length
          && previous.value.matches.every(old => witness.matches.some(g => g.id === old.id && !regresses(g, old)))) return { value: witness, at: now() };
        const safe = next.value.matches.every(g => {
          const old = previous.value.matches.find(p => p.id === g.id);
          if (!regresses(g, old)) return true;
          if (old.matchStatus === 'FINALIZED' && g.matchStatus !== 'FINALIZED' || Number(g.currentQuarter) < Number(old.currentQuarter)) return false;
          return g.matchStatus === 'FINALIZED' && sameScore(g, witness?.matches.find(p => p.id === g.id));
        });
        if (safe) return next;
        console.warn('ACB: inconsistent score/period; retaining last validated round', selected.id);
        return { ...previous, stale: true };
      } });
    let matches = await gamesFor(chosen);
    // Official ACB defaults advance to next weekend before any game has begun.
    // Walk back to the last started round; standings remain independent.
    while (roundParam == null && !matches.value.matches.some(g => hasStarted(acbGame(g, now()), now())) && filters.indexOf(chosen) > 0) {
      chosen = filters[filters.indexOf(chosen) - 1];
      matches = await gamesFor(chosen);
    }
    let upcoming;
    const following = filters[filters.indexOf(chosen) + 1];
    if (roundParam == null && following) {
      try {
        upcoming = await gamesFor(following);
        const calendar = [
          { round: chosen.roundNumber, games: matches.value.matches.map(g => acbGame(g, now())) },
          { round: following.roundNumber, games: upcoming.value.matches.map(g => acbGame(g, now())) }
        ];
        if (defaultRound(calendar, now(), 'ACB').round === following.roundNumber) { chosen = following; matches = upcoming; }
      } catch (error) { console.warn('ACB next round:', error.message); }
    }
    const data = unwrapSnapshot({ value: normalize(matches.value, table?.value, now()), at: matches.at, stale: matches.stale, refreshing: matches.refreshing }, now());
    await Promise.all(data.games.map(async game => {
      const base = matches.value.matches.find(g => g.id === game.code);
      const distance = now() - Date.parse(game.date);
      if (!Number.isInteger(base?.homeTeam?.id) || !Number.isInteger(base?.awayTeam?.id) || game.state === 'final' || distance < -1800000 || distance > 28800000) return;
      try {
        const detail = await live(base, season);
        const behind = game.state === 'live' && (detail.value.state === 'scheduled'
          || detail.value.state === 'live' && game.score && (detail.value.score.some((n, i) => n < game.score[i])
            || detail.value.period != null && detail.value.period < base.currentQuarter));
        if (behind) {
          game.stale = true; game.refreshing = false;
          game.label = 'Dades antigues · ' + game.label.replace('En joc', 'Últim marcador');
          return; // Keep the complete calendar observation and its original age.
        }
        Object.assign(game, detail.value, { checkedAt: detail.at, stale: detail.stale, refreshing: false });
        if (detail.stale) game.label = 'Dades antigues · ' + game.label.replace('En joc', 'Últim marcador');
        return;
      } catch (error) { console.warn('ACB live:', game.code, error.message); }
      if (game.state === 'live') { game.stale = true; game.refreshing = false; game.label = 'Dades antigues · ' + game.label.replace('En joc', 'Últim marcador'); }
    }));
    data.currentRound = roundParam == null;
    data.nextMatchAt = data.currentRound ? nextMatchAt(initial.value.matches.concat(upcoming?.value.matches || []).map(g => acbGame(g, now())), now()) : null;
    data.hasMoreRounds = chosen.roundNumber < filters.at(-1).roundNumber;
    return table ? attachStandings(data, table, now()) : data;
  };
}

module.exports = { createService, normalize, acbGame };
