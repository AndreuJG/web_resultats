function createSourceCache(cache, now = Date.now) {
  const memory = new Map(), pending = new Map();
  return async function cached(key, seconds, load, keep = 21600, options = {}) {
    key = 'web-resultats:official:v1:' + key;
    let saved = memory.get(key);
    if (!saved && cache) { try { saved = await cache.get(key); } catch { /* Optional cache. */ } }
    const lifetime = saved && typeof seconds === 'function' ? seconds(saved.value, saved.at, now()) : seconds;
    if (saved && now() - saved.at < lifetime * 1000) return { ...saved, stale: false };
    const background = saved && now() - saved.at < keep * 1000 && options.defer;
    if (pending.has(key)) return background ? { ...saved, stale: true } : pending.get(key);
    // Schedule the loader after registering the promise, including synchronous failures.
    const task = Promise.resolve().then(async () => {
      try {
        const value = await load();
        const entry = { value, at: now() };
        memory.set(key, entry);
        if (cache) { try { await cache.set(key, entry, { ttl: keep, name: 'official-basketball' }); } catch { /* Keep memory fallback. */ } }
        return { ...entry, stale: false };
      } catch (error) {
        if (error.status !== 400 && saved && now() - saved.at < keep * 1000) return { ...saved, stale: true };
        throw error;
      }
    }).finally(() => pending.delete(key));
    pending.set(key, task);
    if (background) {
      options.defer(task.catch(() => undefined));
      return { ...saved, stale: true };
    }
    return task;
  };
}

async function getText(url, request = fetch) {
  const response = await request(url, { signal: AbortSignal.timeout(12000), headers: { Accept: 'text/html, application/json' } });
  if (!response.ok) throw new Error('Official source HTTP ' + response.status);
  return response.text();
}

function unwrapSnapshot(snapshot, now = Date.now()) {
  const data = structuredClone(snapshot.value);
  data.generatedAt = now;
  data.scheduleStale = snapshot.stale;
  for (const game of data.games) {
    game.checkedAt = snapshot.at;
    if (snapshot.stale) {
      game.stale = true;
      game.label = 'Dades antigues · ' + game.label.replace('En joc', 'Últim marcador');
    }
  }
  if (data.standings) { data.standings.at = snapshot.at; data.standings.stale = snapshot.stale; }
  return data;
}

module.exports = { createSourceCache, getText, unwrapSnapshot };
