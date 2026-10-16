const { unwrapSnapshot } = require('./source-cache');
const { roundCacheSeconds } = require('./feb-cache-policy');
const WEEK = 7 * 86400000;
const TWO_HOURS = 7200000;

function seasonKey(now) {
  const date = new Date(now);
  return 'F' + (date.getUTCFullYear() - (date.getUTCMonth() < 6 ? 1 : 0));
}

function isClosed(data) {
  return data.competition === 'TERCERA_EA' && !data.scheduleStale && data.standings && !data.standings.stale && data.games.length > 0 && data.games.every(g => g.state === 'final' && !g.stale && Array.isArray(g.score) && g.score.length === 2 && g.score.every(Number.isInteger));
}

function archivedRound(archive, roundParam, now) {
  const season = archive.seasons[seasonKey(now)];
  if (!season) return null;
  const rounds = Object.keys(season.rounds).map(Number).sort((a, b) => a - b);
  const allGames = Object.values(season.rounds).flatMap(entry => entry.data.games).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid' });
  const today = day.format(now);
  const next = allGames.find(g => g.state !== 'final' && Date.parse(g.date) > now);
  const current = allGames.find(g => day.format(new Date(g.date)) === today) || next;
  const round = roundParam === null ? Object.values(season.rounds).find(entry => entry.data.games.some(g => g.code === current?.code))?.data.round || rounds.at(-1) : Number(roundParam);
  const entry = season.rounds[round];
  if (!entry) return null;
  // Final scores are immutable. Pending fixtures are valid until the weekly
  // review or the first match approaches; then defer to the live adapter.
  if (!entry.closed && (now - entry.savedAt >= WEEK || entry.data.games.some(g => g.state !== 'final' && Date.parse(g.date) <= now + TWO_HOURS))) return null;
  if (entry.closed && !isClosed(entry.data)) return null;
  const data = unwrapSnapshot({ value: entry.data, at: entry.savedAt, stale: false }, now);
  data.rounds = rounds;
  data.currentRound = roundParam === null;
  data.nextMatchAt = data.currentRound && next ? Date.parse(next.date) : null;
  data.cacheSeconds = Math.max(1, Math.min(3600, Math.floor(roundCacheSeconds(data, now, now))));
  return data;
}

module.exports = { archivedRound, isClosed, seasonKey, WEEK };
