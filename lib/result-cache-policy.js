// This governs source reads, not the browser reload timer. A full calendar
// must consider every pending match, even when the visitor chose an old week.
function resultCacheSeconds(games, savedAt, now, maximum = 3600) {
  if (!games.length) return 20;
  if (games.some(g => g.state === 'live')) return 20;
  const pending = games.filter(g => g.state !== 'final');
  if (!pending.length) return maximum;
  let seconds = Math.min(maximum, 3600);
  for (const game of pending) {
    const start = Date.parse(game.date);
    if (game.timeUnknown || !Number.isFinite(start)) { seconds = Math.min(seconds, 300); continue; }
    if (start <= now + 7200000 && start >= now - 21600000) return 20;
    if (start < now) seconds = Math.min(seconds, 60);
    else seconds = Math.min(seconds, Math.max(20, (start - 7200000 - savedAt) / 1000));
  }
  return seconds;
}

// Keep the timestamps and fallback states of results and standings independent.
function attachStandings(data, snapshot, now) {
  data.generatedAt = now;
  if (data.standings) {
    data.standings.at = snapshot.at;
    data.standings.stale = snapshot.stale;
    data.standings.refreshing = snapshot.refreshing === true;
  }
  return data;
}

module.exports = { resultCacheSeconds, attachStandings };
