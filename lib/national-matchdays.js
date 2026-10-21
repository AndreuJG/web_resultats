const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' });
function localDate(value) {
  if (!value) return null;
  const parts = Object.fromEntries(dateFormat.formatToParts(new Date(value)).map(p => [p.type, p.value]));
  return parts.year + '-' + parts.month + '-' + parts.day;
}
const displayDate = date => date.slice(8) + '/' + date.slice(5, 7) + '/' + date.slice(0, 4);

// FIBA's roundNumber is a phase. gameNumber counts fixtures within each group:
// two per matchday in groups of four, three in groups of six, one in groups of three.
// This keeps rescheduled games in their matchday instead of reassigning by date.
function matchdays(raw, games) {
  const groups = new Map(), numbers = new Map();
  for (const g of raw) {
    const key = g.groupPairingCode;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(g);
  }
  let numbered = groups.size > 0;
  for (const [group, fixtures] of groups) {
    const teams = new Set(fixtures.flatMap(g => [g.teamA?.teamId, g.teamB?.teamId]).filter(Boolean));
    const perDay = Math.floor(teams.size / 2), seen = new Set(), playing = new Map();
    if (!/^[A-Z]$/.test(group || '') || ![3, 4, 6].includes(teams.size)) numbered = false;
    for (const g of fixtures) {
      const number = Number(g.gameNumber), day = Math.ceil(number / perDay);
      if (!/^[1-9]\d*$/.test(String(g.gameNumber)) || day > 6 || seen.has(number) || !g.teamA?.teamId || !g.teamB?.teamId) numbered = false;
      seen.add(number);
      if (!playing.has(day)) playing.set(day, new Set());
      for (const team of [g.teamA?.teamId, g.teamB?.teamId]) {
        if (playing.get(day).has(team)) numbered = false;
        playing.get(day).add(team);
      }
      numbers.set(g.gameId, day);
    }
  }
  // If the official numbering is missing or unfamiliar, show dated batches,
  // explicitly labelled by date rather than inventing a matchday number.
  const buckets = new Map();
  for (const g of games) {
    const key = numbered ? numbers.get(g.code) : localDate(g.date) || 'pending';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(g);
  }
  return [...buckets].sort(([a], [b]) => numbered ? a - b : String(a).localeCompare(String(b))).map(([key, fixtures], i) => {
    const dates = [...new Set(fixtures.map(g => localDate(g.date)).filter(Boolean))].sort();
    const span = dates.length ? displayDate(dates[0]) + (dates.length > 1 ? ' – ' + displayDate(dates.at(-1)) : '') : 'Data per confirmar';
    return { round: numbered ? key : i + 1, label: numbered ? 'Jornada ' + key + ' · ' + span : span === 'Data per confirmar' ? span : 'Partits del ' + span, games: fixtures };
  });
}
module.exports = { matchdays };
