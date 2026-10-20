// Choosing a round by its start time never assigns a live state or a score.
function hasStarted(game, now) {
  if (game.state === 'live' || game.state === 'final' || game.played === true) return true;
  if (game.timeUnknown || game.postponed || /ajornat|postpon|cancel|suspend/i.test(game.label || game.status || '')) return false;
  const start = Date.parse(game.date);
  return Number.isFinite(start) && start <= now;
}
function lastStartedRound(rounds, now) {
  const ordered = [...rounds].sort((a, b) => a.round - b.round);
  return ordered.filter(r => r.games.some(g => g.state === 'live')).at(-1)
    || ordered.filter(r => r.games.some(g => hasStarted(g, now))).at(-1);
}
const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' });
function dayNumber(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(localDay.formatToParts(date).map(p => [p.type, p.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86400000;
}
function defaultRound(rounds, now, competition) {
  const ordered = [...rounds].sort((a, b) => a.round - b.round);
  const current = lastStartedRound(ordered, now);
  if (!current) return ordered[0];
  if (current.games.some(g => g.state === 'live')) return current;
  const next = ordered.find(r => r.round > current.round);
  if (!next) return current;
  const nextDays = next.games.map(g => g.date ? dayNumber(g.date) : null).filter(d => d !== null);
  const firstNext = nextDays.length ? Math.min(...nextDays) : Infinity;
  // A pending fixture moved beyond the next round must not hold the home page
  // on an otherwise completed weekend for weeks. It stays in its own round.
  const dates = current.games.filter(g => !g.postponed && !/ajornat|postpon|cancel|suspend/i.test(g.label || g.status || '') && (g.state === 'final' || g.played || !g.date || dayNumber(g.date) < firstNext)).map(g => g.date ? dayNumber(g.date) : null).filter(d => d !== null);
  if (!dates.length) return current;
  const last = Math.max(...dates), today = dayNumber(now);
  if (today > last + 1) return next;
  // A Wednesday -> Thursday EuroLeague double round advances on Thursday,
  // before tip-off. The previous round's results are still available manually.
  if (competition === 'E' && nextDays.length && Math.min(...nextDays) <= today && Math.min(...nextDays) <= last + 1) return next;
  return current;
}
function nextMatchAt(games, now) {
  const starts = games.filter(g => g.state !== 'final' && !g.played && !g.timeUnknown).map(g => Date.parse(g.date)).filter(t => Number.isFinite(t) && t > now);
  return starts.length ? Math.min(...starts) : null;
}
module.exports = { defaultRound, lastStartedRound, hasStarted, nextMatchAt };
