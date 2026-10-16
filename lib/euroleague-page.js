const competitions = require('./competitions');
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateFormat = new Intl.DateTimeFormat('ca-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit' });
const timeFormat = new Intl.DateTimeFormat('ca-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
const stamp = new Intl.DateTimeFormat('ca-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit' });

function shell(body, competition = 'E') {
  const config = competitions[competition];
  return `<!doctype html><html lang="ca"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(config.title)} · Bàsquet al dia</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/style.css"><style>.live{color:#17643d}.live-dot{display:inline-block;width:9px;height:9px;margin-right:5px;border-radius:50%;background:#d11f2f;vertical-align:middle}.old{color:#96540a}.small{font-size:14px;color:#58635b}select{font:inherit;min-height:46px;max-width:100%}.match-day{font-size:13px;color:#58635b}.source-links{font-size:14px}</style></head><body><main><a class="back" href="/">← Totes les competicions</a><p class="eyebrow">BÀSQUET AL DIA</p><h1>${esc(config.title)}</h1>${body}<footer>Font: ${esc(config.source || 'Euroleague Basketball')}. Les dades poden arribar amb retard.<br>Horaris d’Europe/Madrid. HTML lleuger compatible amb Safari d’iOS 12.</footer></main><script src="/live-refresh.js" defer></script></body></html>`;
}

function render(data, auto = true) {
  const competition = data.competition || 'E';
  const config = competitions[competition];
  const base = config.path + '?jornada=' + data.round;
  const url = base + (auto ? '' : '&auto=0');
  const warning = data.scheduleStale || data.games.some(g => g.stale) || data.standings?.stale;
  const rows = data.games.map(g => {
    const d = new Date(g.date);
    const score = g.score ? g.score.join(' – ') : g.state === 'scheduled' ? timeFormat.format(d) : '—';
    const liveClass = g.stale ? 'old' : g.state === 'live' ? 'live' : '';
    return `<tr><td>${esc(g.home.name)}<div class="match-day">${esc(dateFormat.format(d))} · ${esc(timeFormat.format(d))}${competition === 'U' && g.group ? ' · ' + esc('Grup ' + g.group) : ''}</div></td><td class="score ${liveClass}">${esc(score)}<span class="state">${g.state === 'live' && !g.stale ? '<span class="live-dot" aria-hidden="true"></span>' : ''}${esc(g.label)}</span>${g.checkedAt ? `<span class="state">Consultat ${esc(stamp.format(g.checkedAt))}</span>` : ''}</td><td>${esc(g.away.name)}</td></tr>`;
  }).join('');
  const standings = data.standings ? `<p class="small">${data.standingsNote ? esc(data.standingsNote) + '. ' : ''}Consulta de classificació: ${esc(stamp.format(data.standings.at))}${data.standings.stale ? ' · Dades antigues' : ''}. Ordre oficial; els partits en joc poden no estar incorporats.</p>` + data.standings.value.map(group => `<table><caption>${esc(group.name)} · PJ: partits · V: victòries · D: derrotes</caption><thead><tr><th scope="col">Pos.</th><th scope="col">Equip</th><th scope="col" class="numeric">PJ</th><th scope="col" class="numeric">V</th><th scope="col" class="numeric">D</th></tr></thead><tbody>${group.teams.map(t => `<tr><td>${t.position}</td><td>${esc(t.name)}</td><td class="numeric">${t.played}</td><td class="numeric">${t.won}</td><td class="numeric">${t.lost}</td></tr>`).join('')}</tbody></table>`).join('') : '<p class="notice">La classificació oficial no està disponible en aquest moment. Els marcadors es poden consultar igualment.</p>';
  return shell(`<p>Temporada ${data.season.slice(1)}–${Number(data.season.slice(1)) + 1} · Jornada ${data.round}</p>${warning ? '<p class="notice">Algunes dades no s’han pogut renovar. Conservem l’última consulta vàlida i n’indiquem l’hora.</p>' : ''}<form method="get" action="${esc(config.path)}"><label for="jornada">Jornada </label><select id="jornada" name="jornada">${data.rounds.map(r => `<option value="${r}"${r === data.round ? ' selected' : ''}>${r}</option>`).join('')}</select>${!auto ? '<input type="hidden" name="auto" value="0">' : ''} <button type="submit">Mostra</button></form><p><a href="#resultats">Resultats</a> · <a href="#classificacio">Classificació</a></p><div class="tools"><a class="button" href="${esc(url)}">Actualitza ara</a><a class="button" href="${esc(base + (auto ? '&auto=0' : ''))}">${auto ? 'Pausa' : 'Activa'} l’actualització automàtica</a><p id="live-refresh-status" data-auto="${auto ? '1' : '0'}">${auto ? 'Actualització automàtica cada 30 segons amb JavaScript.' : 'Actualització automàtica pausada.'}</p><noscript><p>Pots actualitzar els marcadors amb «Actualitza ara».</p></noscript></div><h2 id="resultats">Resultats · Jornada ${data.round}</h2><table><caption>Marcadors oficials · pàgina consultada ${esc(stamp.format(data.generatedAt))}</caption><thead><tr><th scope="col">Local</th><th scope="col">Marcador</th><th scope="col">Visitant</th></tr></thead><tbody>${rows}</tbody></table><h2 id="classificacio">Classificació</h2>${standings}<p class="source-links"><a href="${esc(config.gamesUrl || `https://www.euroleaguebasketball.net/en/${config.site}/game-center/`)}">Resultats oficials</a> · <a href="${esc(config.standingsUrl || `https://www.euroleaguebasketball.net/en/${config.site}/standings/`)}">Classificació oficial</a></p>`, competition);
}

function renderError(message, competition = 'E') {
  const config = competitions[competition];
  return shell(`<p class="notice">${esc(message)}</p><p>No mostrem dades de demostració en aquesta competició.</p><a class="button" href="${esc(config.path)}">Torna-ho a provar</a>`, competition);
}

module.exports = { render, renderError };
