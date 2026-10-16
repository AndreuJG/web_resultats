const HOUR = 3600000;

// Re-evaluate against the current clock: an entry saved days ago must expire
// as soon as its next match approaches, even if nobody visited in between.
function roundCacheSeconds(data, savedAt, now) {
  if (data.currentRound && data.nextMatchAt && data.nextMatchAt <= now + 2 * HOUR) return 20;
  const unfinished = data.games.filter(game => game.state !== 'final');
  if (unfinished.some(game => game.state === 'live' || (Date.parse(game.date) <= now + 2 * HOUR && Date.parse(game.date) >= now - 6 * HOUR))) return 20;
  const starts = unfinished.map(game => Date.parse(game.date));
  if (data.nextMatchAt) starts.push(data.nextMatchAt);
  let seconds = unfinished.length ? 43200 : 86400;
  if (unfinished.some(game => Date.parse(game.date) < now)) seconds = 900;
  if (data.currentRound) seconds = Math.min(seconds, 21600);
  if (data.standings === null) seconds = Math.min(seconds, 60);
  for (const start of starts) {
    if (start > now) seconds = Math.min(seconds, Math.max(20, (start - 2 * HOUR - savedAt) / 1000));
  }
  return seconds;
}

module.exports = { roundCacheSeconds };
