const { defaultRound } = require('./round-selection');

function selectPhase(sections, calendar, roundParam, phaseParam, now, competition) {
  const automatic = defaultRound(calendar, now, competition)?.round;
  const round = roundParam == null ? automatic : Number(roundParam);
  const section = phaseParam == null ? sections.find(s => s.rounds.includes(round)) : sections.find(s => s.id === Number(phaseParam));
  if (!section || roundParam != null && !section.rounds.includes(round)) throw Object.assign(new Error('Unknown phase or round'), { status: 400 });
  const chosen = phaseParam != null && roundParam == null
    ? defaultRound(calendar.filter(r => section.rounds.includes(r.round)), now, competition)?.round : round;
  return { phase: section.id, phaseLabel: section.label, phaseAutomatic: phaseParam == null && roundParam == null,
    phases: sections.map(s => s.id), phaseLabels: Object.fromEntries(sections.map(s => [s.id, s.label])),
    round: chosen, rounds: section.rounds, roundSections: undefined, selectionLabel: 'Jornada', currentRound: roundParam == null };
}

function filterGroups(data, phaseGames, groupParam) {
  const codes = [...new Set(phaseGames.map(g => g.group).filter(g => /^[A-Z]$/.test(g || '')))].sort();
  data.availableGroups = codes.map(code => ({ code }));
  data.selectedGroup = codes.includes(groupParam) ? groupParam : null;
  if (data.selectedGroup) {
    data.games = data.games.filter(g => g.group === data.selectedGroup);
    if (data.standings) data.standings = { ...data.standings, value: data.standings.value.filter(g => g.name === 'Grup ' + data.selectedGroup) };
  }
  return data;
}
module.exports = { selectPhase, filterGroups };
