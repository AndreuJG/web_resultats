function createSourceCache(cache, now = Date.now) {
  const memory = new Map(), pending = new Map(), failures = new Set();
  return async function cached(key, seconds, load, keep = 21600, options = {}) {
    key = 'web-resultats:official:v1:' + key;
    let saved = memory.get(key);
    let lifetime = saved && typeof seconds === 'function' ? seconds(saved.value, saved.at, now()) : seconds;
    if (cache && (!saved || now() - saved.at >= lifetime * 1000)) {
      try {
        const shared = await cache.get(key);
        if (shared && (!saved || shared.at > saved.at)) { saved = shared; memory.set(key, shared); failures.delete(key); }
      } catch { /* Optional cache. */ }
      lifetime = saved && typeof seconds === 'function' ? seconds(saved.value, saved.at, now()) : seconds;
    }
    if (saved && !saved.stale && now() - saved.at < lifetime * 1000) return { ...saved, stale: false };
    const background = saved && now() - saved.at < keep * 1000 && options.defer;
    if (pending.has(key)) return background ? { ...saved, stale: true, refreshing: !failures.has(key) } : pending.get(key);
    // Schedule the loader after registering the promise, including synchronous failures.
    const task = Promise.resolve().then(async () => {
      try {
        const value = await load();
        let entry = { value, at: now() };
        if (options.reconcile) {
          // Another instance may have published while this source was loading.
          let previous = saved;
          if (cache) { try {
            const shared = await cache.get(key);
            if (shared && (!previous || shared.at > previous.at)) previous = shared;
          } catch { /* The in-memory copy remains usable. */ } }
          if (previous && (!saved || previous.at > saved.at)) { saved = previous; memory.set(key, previous); }
          entry = await options.reconcile(entry, previous);
          // Reconciliation can itself await a second official route. Recheck
          // afterwards, otherwise its old witness could overwrite a new final.
          for (let attempt = 0; cache && attempt < 3; attempt++) {
            let shared;
            try { shared = await cache.get(key); } catch { break; }
            if (!shared || previous && shared.at <= previous.at) break;
            previous = shared;
            saved = shared;
            memory.set(key, shared);
            if (attempt === 2) { entry = { ...shared, stale: true }; break; }
            entry = await options.reconcile(entry, shared);
          }
          if (entry.stale) {
            failures.add(key);
            // A cold ACB load can retain its context as the only known baseline.
            // Preserve it across instances without restarting its age/retention.
            if ((!saved || entry.at > saved.at) && now() - entry.at < keep * 1000) {
              memory.set(key, entry);
              if (cache) { try { await cache.set(key, entry, { ttl: Math.max(1, Math.ceil(keep - (now() - entry.at) / 1000)), name: 'official-basketball' }); } catch { /* Keep the local baseline. */ } }
            }
            return entry; // Keep the original age; retry instead of caching it as new.
          }
        }
        memory.set(key, entry);
        failures.delete(key);
        if (cache) { try { await cache.set(key, entry, { ttl: keep, name: 'official-basketball' }); } catch { /* Keep memory fallback. */ } }
        return { ...entry, stale: false };
      } catch (error) {
        failures.add(key);
        console.warn('Official source refresh failed:', key, error.message, error.cause?.code || '');
        if (error.status !== 400 && saved && now() - saved.at < keep * 1000) return { ...saved, stale: true };
        throw error;
      }
    }).finally(() => pending.delete(key));
    pending.set(key, task);
    if (background) {
      options.defer(task.catch(() => undefined));
      // Most sources finish quickly: prefer their fresh answer, but bound the
      // visitor's wait when an upstream stalls. waitUntil keeps the task alive.
      let timer;
      try {
        return await Promise.race([task, new Promise(resolve => {
          timer = setTimeout(() => resolve({ ...saved, stale: true, refreshing: !failures.has(key) }), 1500);
        })]);
      } finally { clearTimeout(timer); }
    }
    return task;
  };
}

async function getText(url, request = fetch) {
  const start = Date.now();
  try {
    const response = await request(url, { signal: AbortSignal.timeout(12000), headers: { Accept: 'text/html, application/json' } });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.text();
  } catch (error) {
    throw new Error(new URL(url).hostname + ': ' + error.message + ' (' + (Date.now() - start) + 'ms' + (error.cause?.code ? ', ' + error.cause.code : '') + ')');
  }
}

function unwrapSnapshot(snapshot, now = Date.now()) {
  const data = structuredClone(snapshot.value);
  data.generatedAt = now;
  data.scheduleStale = snapshot.stale;
  data.scheduleRefreshing = snapshot.refreshing === true;
  for (const game of data.games) {
    game.checkedAt = snapshot.at;
    if (snapshot.stale) {
      game.stale = true;
      game.refreshing = snapshot.refreshing === true;
      game.label = 'Dades antigues · ' + game.label.replace('En joc', 'Últim marcador');
    }
  }
  if (data.standings) { data.standings.at = snapshot.at; data.standings.stale = snapshot.stale; data.standings.refreshing = snapshot.refreshing === true; }
  return data;
}

module.exports = { createSourceCache, getText, unwrapSnapshot };
