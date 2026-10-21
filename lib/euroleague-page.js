const competitions = require('./competitions');
const { zonesFor } = require('./standings-zones');
const { refreshPolicy } = require('./refresh-policy');
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const weekdayFormat = new Intl.DateTimeFormat('ca-ES', { timeZone: 'Europe/Madrid', weekday: 'long' });
const teamName = team => team.country === 'ISR' ? 'HP ' + team.name : team.name;
const dateFormat = new Intl.DateTimeFormat('ca-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit' });
const timeFormat = new Intl.DateTimeFormat('ca-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
const stamp = new Intl.DateTimeFormat('ca-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

function shell(body, competition = 'E') {
  const config = competitions[competition];
  return `<!doctype html><html lang="ca"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(config.title)} · Bàsquet al dia</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/style.css"><style>.valencia-basket{color:#b24f00}.live{color:#17643d}.live-dot{display:inline-block;width:9px;height:9px;margin-right:5px;border-radius:50%;background:#d11f2f;vertical-align:middle}.old{color:#96540a}.small{font-size:14px;color:#58635b}select{font:inherit;min-height:46px;max-width:100%}.match-day{font-size:13px;color:#58635b}.source-links{font-size:14px}.zone{display:inline-block;min-width:24px;margin-left:5px;padding:1px 4px;border:1px solid #17643d;border-radius:2px;background:#e8f3e9;color:#17512e;font-size:12px;text-align:center;vertical-align:middle}.zone-playin{background:#fff1d1;color:#734b00;border-color:#9a6b00}.zone-relegation{background:#fce7e7;color:#92202d;border-color:#aa3540}.zone-transfer{background:#e5eefb;color:#224d80;border-color:#3f6697}.zones-legend{font-size:13px;color:#48544c;margin:8px 0 24px}.zone-key{display:inline-block;margin:0 10px 4px 0}.zones-legend .zone{margin:0 4px 0 0}</style></head><body><main><a class="back" href="/">← Totes les competicions</a><p class="eyebrow">BÀSQUET AL DIA</p><h1>${esc(config.title)}</h1>${body}<footer>Font: ${esc(config.source || 'Euroleague Basketball')} · Hora d’Europe/Madrid.</footer></main><script src="/live-refresh.js?v=3" defer></script></body></html>`;
}

function render(data, auto = true) {
  const competition = data.competition || 'E';
  const refresh = refreshPolicy(data);
  const config = competitions[competition];
  const teamHTML = team => {
    const bold = ['E', 'U', 'ELW', 'BCL', 'ESM', 'ESW'].includes(competition) && team.country === 'ESP'
      || competition === 'TERCERA_EA' && /\bTABERNES\s+BLANQUES\b/i.test(team.name);
    const name = esc(teamName(team));
    const html = bold ? '<strong>' + name + '</strong>' : name;
    const valencia = team.country === 'ESP' && /^VAL[EÈ]NCIA$/i.test(team.name.trim()) || /\bVAL[EÈ]NCIA\s+(?:BASKET\b|B\.?\s*C\.?(?:\s|$))/i.test(team.name);
    return valencia ? '<span class="valencia-basket">' + html + '</span>' : html;
  };
  const groupQuery = data.selectedGroup ? '&grup=' + data.selectedGroup : '';
  const base = config.path + '?jornada=' + data.round + groupQuery;
  const url = base + (auto ? '' : '&auto=0');
  const index = data.rounds.indexOf(data.round);
  const roundLink = (round, label) => `<a class="button" href="${esc(config.path + '?jornada=' + round + (auto ? '' : '&auto=0'))}">${label}</a>`;
  const navigation = `<nav aria-label="Navegació de jornades">${index > 0 ? roundLink(data.rounds[index - 1], '← Anterior') : ''}${index >= 0 && index < data.rounds.length - 1 ? roundLink(data.rounds[index + 1], 'Següent →') : ''}</nav>`;
  const roundOption = r => `<option value="${r}"${r === data.round ? ' selected' : ''}>${esc(data.roundLabels?.[r] || r)}</option>`;
  const roundOptions = data.roundSections
    ? data.roundSections.map(section => `<optgroup label="${esc(section.label)}">${section.rounds.map(roundOption).join('')}</optgroup>`).join('')
    : data.rounds.map(roundOption).join('');
  const currentStandingsLink = data.currentStandingsRound
    ? `<p><a href="${esc(config.path + '?jornada=' + data.currentStandingsRound + (auto ? '' : '&auto=0') + '#classificacio')}">Consulta la classificació actual</a></p>` : '';
  const groupNavigation = data.availableGroups?.length ? `<nav aria-label="Grups" class="small"><p>Grups: ${!data.selectedGroup ? '<strong>Tots</strong>' : `<a href="${esc(config.path + '?jornada=' + data.round + (auto ? '' : '&auto=0'))}">Tots</a>`} · ${data.availableGroups.map(g => {
    const label = esc(g.code + (g.spain ? ' (Espanya)' : ''));
    return g.code === data.selectedGroup ? `<strong>${label}</strong>` : `<a href="${esc(config.path + '?jornada=' + data.round + '&grup=' + g.code + (auto ? '' : '&auto=0'))}">${label}</a>`;
  }).join(' · ')}</p></nav>` : '';
  const warning = data.scheduleStale && !data.scheduleRefreshing || data.games.some(g => g.stale && !g.refreshing) || data.standings?.stale && !data.standings.refreshing;
  const rows = data.games.map(g => {
    const d = g.date ? new Date(g.date) : null;
    const when = d ? weekdayFormat.format(d) + ', ' + dateFormat.format(d) + ' · ' + (g.timeUnknown ? 'Hora per confirmar' : timeFormat.format(d)) : 'Data per confirmar';
    const score = g.score ? g.score.join(' – ') : g.state === 'scheduled' && d && !g.timeUnknown ? timeFormat.format(d) : '—';
    const liveClass = g.stale ? 'old' : g.state === 'live' ? 'live' : '';
    return `<tr><td>${teamHTML(g.home)}<div class="match-day">${esc(when)}${(competition === 'U' || config.fiba || config.national) && g.group ? ' · ' + esc('Grup ' + g.group) : ''}</div></td><td class="score ${liveClass}">${g.statsUrl ? `<a href="${esc(g.statsUrl + (!auto && g.statsUrl.startsWith('/') ? '&auto=0' : ''))}" aria-label="${esc('Estadístiques FEB: ' + g.home.name + ' - ' + g.away.name)}">${esc(score)}</a><a class="state" href="${esc(g.statsUrl + (!auto && g.statsUrl.startsWith('/') ? '&auto=0' : ''))}">Estadístiques FEB ↗</a>` : esc(score)}<span class="state">${g.state === 'live' && !g.stale ? '<span class="live-dot" aria-hidden="true"></span>' : ''}${esc(g.label)}</span>${g.checkedAt && g.stale ? `<span class="state">Consultat ${esc(stamp.format(g.checkedAt))}</span>` : ''}</td><td>${teamHTML(g.away)}</td></tr>`;
  }).join('');
  const standings = data.standings ? (data.standingsNote || data.standings.stale ? `<p class="small">${data.standingsNote ? esc(data.standingsNote) : ''}${data.standings.stale ? ' · Dades antigues · ' + esc(stamp.format(data.standings.at)) : ''}</p>` : '') + data.standings.value.map((group, index) => {
    const rule = zonesFor(data, group);
    const badge = z => `<span class="zone zone-${z.style}" title="${esc('Zona de ' + z.label)}" aria-label="${esc('Zona de ' + z.label)}">${esc(z.code)}</span>`;
    const legend = rule ? `<p class="zones-legend" id="zones-${index}">${rule.zones.map(z => `<span class="zone-key">${badge(z)}${z.from === z.to ? z.from : z.from + '–' + z.to}: ${esc(z.label)}</span>`).join('')}<br>${rule.assured ? 'Les quatre amfitriones tenen plaça assegurada.' : 'Zones segons la posició actual; no indiquen classificació assegurada.'}${rule.note ? ' ' + esc(rule.note) : ''} <a href="${esc(rule.source)}">Criteri oficial</a></p>` : '';
    const rows = group.teams.map(t => {
      const z = rule?.zones.find(z => t.position >= z.from && t.position <= z.to);
      return `<tr><td>${t.position}${z ? badge(z) : ''}</td><td>${teamHTML(t)}</td><td class="numeric">${t.played}</td><td class="numeric">${t.won}</td><td class="numeric">${t.lost}</td></tr>`;
    }).join('');
    return `<table${rule ? ` aria-describedby="zones-${index}"` : ''}><caption>${esc(group.name)} · PJ: partits · V: victòries · D: derrotes</caption><thead><tr><th scope="col">Pos.</th><th scope="col">Equip</th><th scope="col" class="numeric">PJ</th><th scope="col" class="numeric">V</th><th scope="col" class="numeric">D</th></tr></thead><tbody>${rows}</tbody></table>${legend}`;
  }).join('') : '<p class="notice">' + esc(data.standingsMessage || 'La classificació oficial no està disponible en aquest moment. Els marcadors es poden consultar igualment.') + '</p>';
  return shell(`<p>${esc(data.seasonLabel || 'Temporada ' + data.season.slice(1) + '–' + (Number(data.season.slice(1)) + 1))} · ${esc(data.roundLabel || 'Jornada ' + data.round)}</p>${warning ? '<p class="notice">Algunes dades no s’han pogut renovar. Conservem l’última consulta vàlida i n’indiquem l’hora.</p>' : ''}<form id="round-form" method="get" action="${esc(config.path)}"><label for="jornada">${esc(data.selectionLabel || 'Jornada')} </label><select id="jornada" name="jornada">${roundOptions}</select>${!auto ? '<input type="hidden" name="auto" value="0">' : ''} <button type="submit">Mostra</button></form>${navigation}${groupNavigation}<p><a href="#resultats">Resultats</a> · <a href="#classificacio">Classificació</a></p><div class="tools"><a class="button" href="${esc(url)}">Actualitza ara</a><a class="button" href="${esc(base + (auto ? '&auto=0' : ''))}">${auto ? 'Pausa' : 'Reprén'}</a><span id="live-refresh-status" data-auto="${auto ? '1' : '0'}" data-refresh-ms="${auto ? refresh.delay : 0}" hidden></span></div><h2 id="resultats">Resultats · ${esc(data.roundLabel || 'Jornada ' + data.round)}</h2><table><caption>Marcadors</caption><thead><tr><th scope="col">Local</th><th scope="col">Marcador</th><th scope="col">Visitant</th></tr></thead><tbody>${rows}</tbody></table><h2 id="classificacio">${esc(data.standingsTitle || 'Classificació')}</h2>${standings}${currentStandingsLink}<p class="source-links"><a href="${esc(data.gamesUrl || config.gamesUrl || `https://www.euroleaguebasketball.net/en/${config.site}/game-center/`)}">Resultats oficials</a> · <a href="${esc(data.standingsUrl || config.standingsUrl || `https://www.euroleaguebasketball.net/en/${config.site}/standings/`)}">Classificació oficial</a></p>`, competition);
}

function renderError(message, competition = 'E') {
  const config = competitions[competition];
  return shell(`<p class="notice">${esc(message)}</p><p>No mostrem dades de demostració en aquesta competició.</p><a class="button" href="${esc(config.path)}">Torna-ho a provar</a>`, competition);
}

module.exports = { render, renderError };
