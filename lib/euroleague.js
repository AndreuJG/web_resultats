const { defaultRound, lastStartedRound, nextMatchAt } = require('./round-selection');
const { selectPhase, filterGroups } = require('./phase-navigation');
const API = 'https://api-live.euroleague.net';
const LIVE = 'https://live.euroleague.net/api/Header';

function seasonAt(now, competition = 'E') {
  const date = new Date(now);
  const year = date.getUTCFullYear() - (date.getUTCMonth() < 6 ? 1 : 0);
  return competition + year;
}

function validScore(value) {
  return /^(0|[1-9]\d{0,2})$/.test(String(value)) ? Number(value) : null;
}

function parseGames(body) {
  if (!Array.isArray(body.data) || !body.data.length || body.total > body.data.length) throw new Error('Incomplete schedule');
  return body.data.map(g => {
    if (!Number.isInteger(g.gameCode) || !Number.isInteger(g.round) || !g.local?.club?.code || !g.road?.club?.code || !Number.isFinite(Date.parse(g.utcDate))) throw new Error('Invalid game');
    const team = side => ({ code: side.club.code, name: side.club.abbreviatedName || side.club.name, score: validScore(side.score) });
    return { code: g.gameCode, round: g.round, group: g.group?.rawName || '', phase: g.phaseType?.code ? { code: g.phaseType.code, name: g.phaseType.name, groups: g.phaseType.isGroupPhase === true } : null, date: g.utcDate, played: g.played === true, status: g.gameStatus, home: team(g.local), away: team(g.road) };
  });
}

function parseStandings(body) {
  if (!Array.isArray(body) || !body.length) throw new Error('Invalid standings');
  return body.map(group => {
    if (!Array.isArray(group.standings) || !group.standings.length) throw new Error('Empty standings');
    return { name: /^[A-Z]$/.test(group.group?.rawName || '') ? 'Grup ' + group.group.rawName : group.group?.rawName || 'Classificació', order: group.group?.order || 0, teams: group.standings.map(row => {
      const d = row.data;
      if (!row.club?.name || !d || !['position', 'gamesPlayed', 'gamesWon', 'gamesLost'].every(k => Number.isInteger(d[k]) && d[k] >= 0) || d.gamesWon + d.gamesLost !== d.gamesPlayed) throw new Error('Invalid standing');
      return { name: row.club.abbreviatedName || row.club.name, code: row.club.code, country: row.club.country?.code || null, position: d.position, played: d.gamesPlayed, won: d.gamesWon, lost: d.gamesLost };
    }).sort((a, b) => a.position - b.position) };
  }).sort((a, b) => a.order - b.order);
}

function parseHeader(h, game) {
  if (!h || String(h.CodeTeamA).trim() !== game.home.code || String(h.CodeTeamB).trim() !== game.away.code || typeof h.Live !== 'boolean') throw new Error('Invalid live game identity');
  const home = validScore(h.ScoreA), away = validScore(h.ScoreB);
  if (home === null || away === null) throw new Error('Invalid live score');
  return { live: h.Live, home, away, quarter: String(h.Quarter || '').trim(), clock: /^\d{1,2}:\d{2}$/.test(h.RemainingPartialTime) ? h.RemainingPartialTime : '', elapsed: String(h.GameTime || '') };
}

function gameView(game, header, now) {
  const base = { ...game, state: 'scheduled', label: 'Pendent', score: null, stale: false, checkedAt: null };
  if (header) {
    const h = header.value;
    base.stale = header.stale || now - header.at > 120000;
    base.checkedAt = header.at;
    const ended = !h.live && /^\d+:\d{2}$/.test(h.elapsed) && Number(h.elapsed.split(':')[0]) >= 40 && h.clock === '00:00' && h.home !== h.away;
    if (h.live || ended) {
      base.state = h.live ? 'live' : 'final';
      base.score = [h.home, h.away];
      base.label = h.live ? ('En joc' + (h.quarter ? ' · ' + (Number(h.quarter) <= 4 ? h.quarter + 'Q' : 'Pròrroga ' + (Number(h.quarter) - 4)) : '') + (h.clock ? ' · ' + h.clock : '')) : 'Final';
      if (base.stale) base.label = 'Dades antigues · ' + base.label.replace('En joc', 'Últim marcador');
      return base;
    }
  }
  if (game.played && game.home.score !== null && game.away.score !== null) {
    return { ...base, state: 'final', label: 'Final', score: [game.home.score, game.away.score] };
  }
  if (/postpon|cancel|suspend/i.test(game.status)) return { ...base, state: 'unavailable', label: 'Ajornat o suspés' };
  if (Date.parse(game.date) <= now) return { ...base, state: 'unavailable', label: 'Marcador no disponible' };
  return base;
}

function createService(options = {}) {
  const competition = options.competition || 'E';
  if (!['E', 'U'].includes(competition)) throw new Error('Unknown competition');
  const request = options.fetch || fetch;
  const now = options.now || Date.now;
  const cache = options.cache;
  const memory = new Map();
  const pending = new Map();
  async function cached(key, freshSeconds, keepSeconds, url, parse) {
    const upgraded = competition === 'U' && key.endsWith(':games');
    const fullKey = 'web-resultats:euroliga:' + (upgraded ? 'v3:' : 'v2:') + key;
    let stored = memory.get(fullKey);
    if (!stored && cache) {
      try {
        stored = await cache.get(fullKey);
        if (!stored && upgraded) stored = await cache.get('web-resultats:euroliga:v2:' + key);
      } catch { /* Cache failure must not hide the source. */ }
    }
    const needsMetadata = upgraded && stored?.value.some(g => !Object.hasOwn(g, 'phase'));
    if (stored && !needsMetadata && now() - stored.at < freshSeconds * 1000) return { ...stored, stale: false };
    if (pending.has(fullKey)) return pending.get(fullKey);
    const operation = (async () => {
      try {
        const sourceUrl = url.startsWith(API + '/') ? url + (url.includes('?') ? '&' : '?') + 'format=json' : url;
        const response = await request(sourceUrl, { signal: AbortSignal.timeout(7000), headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Source HTTP ' + response.status);
        const value = parse(await response.json());
        const entry = { value, at: now() };
        memory.set(fullKey, entry);
        if (cache) { try { await cache.set(fullKey, entry, { ttl: keepSeconds, name: 'euroliga' }); } catch { /* In-memory fallback. */ } }
        return { ...entry, stale: false };
      } catch (error) {
        if (stored && now() - stored.at < keepSeconds * 1000) return { ...stored, stale: true };
        throw error;
      }
    })();
    pending.set(fullKey, operation);
    try { return await operation; } finally { pending.delete(fullKey); }
  }
  return async function load(roundParam, groupParam, phaseParam) {
    const season = seasonAt(now(), competition);
    const [schedule, clubs] = await Promise.all([
      cached(season + ':games', 300, 2592000, `${API}/v2/competitions/${competition}/seasons/${season}/games`, parseGames),
      cached(season + ':clubs', 3600, 2592000, `${API}/v2/competitions/${competition}/seasons/${season}/clubs`, body => {
        if (!Array.isArray(body.data) || !body.data.length || body.total > body.data.length) throw new Error('Invalid clubs');
        return Object.fromEntries(body.data.filter(c => c.code && c.country?.code).map(c => [c.code, c.country.code]));
      }).catch(() => null)
    ]);
    const rounds = [...new Set(schedule.value.map(g => g.round))].sort((a, b) => a - b);
    const calendar = rounds.map(round => ({ round, games: schedule.value.filter(g => g.round === round) }));
    const sections = new Map();
    if (competition === 'U') for (const game of [...schedule.value].sort((a, b) => a.round - b.round)) {
      const code = game.phase?.code || 'published';
      if (!sections.has(code)) sections.set(code, { id: game.round, label: ({ RS: 'Fase regular', PO: 'Playoffs', F4: 'Final Four', F: 'Final' })[code] || game.phase?.name || 'Fase publicada', rounds: [], groups: game.phase?.groups !== false });
      const section = sections.get(code);
      if (!section.rounds.includes(game.round)) section.rounds.push(game.round);
    }
    const navigation = competition === 'U' ? selectPhase([...sections.values()], calendar, roundParam, phaseParam, now(), competition) : null;
    const current = (lastStartedRound(calendar, now()) || calendar[0]).round;
    const round = navigation ? navigation.round : roundParam == null ? defaultRound(calendar, now(), competition).round : Number(roundParam);
    if (!rounds.includes(round)) { const error = new Error('Unknown round'); error.status = 400; throw error; }
    const phaseSection = navigation ? [...sections.values()].find(s => s.id === navigation.phase) : null;
    const phaseGames = navigation ? schedule.value.filter(g => phaseSection.rounds.includes(g.round)) : schedule.value;
    const selectedGroup = phaseSection?.groups && phaseGames.some(g => g.group === groupParam) ? groupParam : null;
    const selected = schedule.value.filter(g => g.round === round && (!selectedGroup || g.group === selectedGroup)).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    const latestStandings = async () => {
      if (phaseSection && !phaseSection.groups) return null;
      const tableRounds = phaseSection ? phaseSection.rounds : rounds;
      const phaseCurrent = phaseSection ? (lastStartedRound(calendar.filter(r => tableRounds.includes(r.round)), now()) || { round: tableRounds[0] }).round : current;
      for (const number of tableRounds.filter(r => r <= phaseCurrent).reverse().slice(0, 2)) {
        try {
          const result = await cached(season + ':standings:' + number, 60, 2592000, `${API}/v2/competitions/${competition}/seasons/${season}/rounds/${number}/standings`, parseStandings);
          if (number !== rounds[0] && !result.value.some(group => group.teams.some(t => t.played > 0))) continue;
          return { ...result, round: number };
        } catch { /* Earlier official tables remain usable when the latest is absent. */ }
      }
      return null;
    };
    const [standingsResult, ...games] = await Promise.all([
      latestStandings(),
      ...selected.map(async game => {
        let header = null;
        const distance = now() - Date.parse(game.date);
        if (!game.played && distance > -3600000 && distance < 86400000) {
          try { header = await cached(season + ':header:' + game.code, 15, 600, `${LIVE}?gamecode=${game.code}&seasoncode=${season}`, h => parseHeader(h, game)); } catch { /* Show unavailable, never an invented 0-0. */ }
        }
        const view = gameView(game, header, now());
        if (schedule.stale && !header) view.stale = true;
        return view;
      })
    ]);
    const countries = { ...(clubs?.value || {}) };
    for (const group of standingsResult?.value || []) {
      for (const team of group.teams) if (team.code && team.country) countries[team.code] = team.country;
    }
    for (const game of games) {
      for (const team of [game.home, game.away]) team.country = countries[team.code] || null;
    }
    const data = { competition, season, round, rounds, games, standings: standingsResult, standingsNote: standingsResult ? 'Classificació oficial actual · Jornada ' + standingsResult.round : undefined, scheduleStale: schedule.stale, currentRound: roundParam == null, nextMatchAt: roundParam == null ? nextMatchAt(phaseGames, now()) : null, generatedAt: now() };
    if (navigation) {
      Object.assign(data, navigation, { roundLabels: Object.fromEntries(phaseSection.rounds.map(r => [r, 'Jornada ' + r])), roundLabel: navigation.phaseLabel + ' · Jornada ' + round, standingsTitle: 'Classificació · ' + navigation.phaseLabel });
      if (!phaseSection.groups) {
        data.standingsMessage = 'Aquesta fase és eliminatòria i no té classificació de lliga.';
        const regular = [...sections.values()].find(s => s.groups);
        if (regular) data.currentStandingsRound = (lastStartedRound(calendar.filter(r => regular.rounds.includes(r.round)), now()) || { round: regular.rounds[0] }).round;
      }
      filterGroups(data, phaseSection.groups ? phaseGames : [], groupParam);
    }
    return data;
  };
}

module.exports = { createService, gameView, parseGames, parseHeader, parseStandings, seasonAt };
