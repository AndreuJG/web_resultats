function refreshPolicy(data) {
  const now = data.generatedAt || Date.now();
  const games = data.games || [];
  const stale = data.scheduleStale || games.some(g => g.stale) || data.standings?.stale;
  if (!stale && games.length && games.every(g => g.state === 'final')) {
    if (data.currentRound && (data.nextMatchAt || data.hasMoreRounds)) {
      return { delay: data.nextMatchAt ? Math.min(900000, Math.max(1000, data.nextMatchAt - now)) : 900000, message: 'Última jornada disputada: comprovació de la pròxima jornada.' };
    }
    return { delay: 0, message: 'Jornada acabada. Actualització manual disponible.' };
  }
  if (!stale && games.some(g => g.state === 'live')) {
    return { delay: 30000, message: 'Partits en joc: actualització cada 30 segons.' };
  }
  const starts = games.filter(g => g.state !== 'final' && !g.timeUnknown && g.date).map(g => Date.parse(g.date)).filter(Number.isFinite);
  // Allow delayed starts without assuming that a scheduled fixture is live.
  if (stale || starts.some(t => t >= now - 6 * 3600000 && t <= now + 15 * 60000)) {
    return { delay: 60000, message: stale ? 'Dades pendents de renovar: nova consulta en un minut.' : 'Prop de l’hora d’un partit: actualització cada minut.' };
  }
  const upcoming = starts.filter(t => t > now + 15 * 60000).map(t => t - now - 15 * 60000);
  return { delay: Math.min(900000, ...upcoming), message: 'Sense partits en joc: comprovació com a màxim en 15 minuts; més prompte si s’acosta un partit.' };
}
module.exports = { refreshPolicy };
