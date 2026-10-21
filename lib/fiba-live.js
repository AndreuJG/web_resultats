const { createSourceCache } = require('./source-cache');

// Public JSON endpoint used by FIBA's own GameCard / useLiveGame client.
function parseLive(body, base) {
  const game = body?.game?.content;
  if (!game) return null;
  if (game.id !== base.gameId || base.gameName && game.technicalName !== base.gameName) throw new Error('FIBA live game identity mismatch');
  const a = base.teamA?.organisationId, b = base.teamB?.organisationId;
  const normal = game.teamA?.oId === a && game.teamB?.oId === b;
  const reversed = game.teamA?.oId === b && game.teamB?.oId === a;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a === b || !normal && !reversed) throw new Error('FIBA live team identity mismatch');
  const sides = normal ? [game.teamA, game.teamB] : [game.teamB, game.teamA];
  const score = sides.map(t => t.score);
  const final = [4, 5, 999].includes(game.status);
  const live = game.status === 3;
  if (live || final) {
    if (!score.every(n => Number.isInteger(n) && n >= 0 && n <= 999) || final && score[0] === score[1]) throw new Error('Invalid FIBA live score');
    const quarter = /^(?:Q[1-4]|OT\d*|E\d+)$/.test(game.quarter || '') ? game.quarter : '';
    const clock = /^\d{1,2}:\d{2}$/.test(game.remainingTime || '') ? game.remainingTime : '';
    const detail = [quarter, clock].filter(Boolean).join(' · ');
    return { state: final ? 'final' : 'live', score, label: final ? 'Final' : 'En joc' + (detail ? ' · ' + detail : '') };
  }
  if ([0, 1, 2].includes(game.status)) return { state: 'scheduled', score: null, label: game.status === 2 ? 'Calfament' : 'Pendent' };
  if ([6, 7, 8, 9, 10, 20].includes(game.status)) return { state: 'unavailable', score: null, label: game.status === 10 ? 'Interromput' : 'Ajornat o suspés' };
  throw new Error('Unknown FIBA live state');
}
function eligible(game, now) {
  if (!Number.isInteger(game.gameId) || !Number.isInteger(game.teamA?.organisationId) || !Number.isInteger(game.teamB?.organisationId) || game.isPostponed) return false;
  if (game.gameResultStatusCode === 'VALID' || [4, 5, 999].includes(game.liveGameStatus)) return false;
  const start = Date.parse(game.gameDateTimeUTC && (/[Zz]|[+-]\d\d:\d\d$/.test(game.gameDateTimeUTC) ? game.gameDateTimeUTC : game.gameDateTimeUTC + 'Z'));
  return game.isLive === true || game.hasTimeGameDateTime && start <= now + 1800000 && start >= now - 28800000;
}
function createClient({ request = fetch, cache, now = Date.now } = {}) {
  const cached = createSourceCache(cache, now);
  return async (base, gamesUrl) => {
    const origin = new URL(gamesUrl).origin;
    return cached('fiba:live:v1:' + origin + ':' + base.gameId + ':' + base.teamA.organisationId + ':' + base.teamB.organisationId, value => value?.state === 'final' ? 3600 : 15, async () => {
      const response = await request(origin + '/en/events/api/game-live-info/' + base.gameId + '/light', {
        cache: 'no-store', signal: AbortSignal.timeout(5000), headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error('FIBA live HTTP ' + response.status);
      const value = parseLive(await response.json(), base);
      if (!value) throw new Error('FIBA live feed not published');
      return value;
    }, 86400);
  };
}
module.exports = { createClient, parseLive, eligible };
