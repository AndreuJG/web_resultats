// Only verified season/phase rules belong here. An unknown table stays unmarked.
const sources = {
  E: 'https://mediacentre.euroleague.net/en/app/2/communication/communication/preview/24407',
  U: 'https://mediacentre.euroleague.net/en/app/2/communication/communication/preview/24408',
  ACB: 'https://www.acb.com/es/liga/clasificacion',
  ELW: 'https://www.fiba.basketball/en/events/euroleague-women-26-27/competition-system-explained',
  BCL: 'https://www.championsleague.basketball/en/competition-system'
};
const zone = (from, to, code, label, style = 'advance') => ({ from, to, code, label, style });

function zonesFor(data, group) {
  const teams = group.teams;
  // Reject incomplete/duplicate rankings rather than painting a misleading cutoff.
  const ranks = teams.map(t => t.position).sort((a, b) => a - b);
  if (!ranks.length || ranks.some((rank, i) => rank !== i + 1)) return null;
  const phase = data.standings?.phase;
  let zones;
  if (data.competition === 'E' && data.season === 'E2026' && teams.length === 20 && data.standings.round <= 38 && group.name === 'Regular Season') {
    zones = [zone(1, 6, 'PL', 'Playoff directe'), zone(7, 10, 'PI', 'Play-in', 'playin')];
  } else if (data.competition === 'U' && data.season === 'U2026' && teams.length === 8 && data.standings.round <= 14 && /^Grup [A-D]$/.test(group.name)) {
    zones = [zone(1, 4, 'OF', 'Octaus de final')];
  } else if (data.competition === 'ACB' && data.season === 'A2026' && phase === 'regular-season' && teams.length === 18) {
    zones = [zone(1, 8, 'PL', 'Playoff pel títol'), zone(17, 18, 'D', 'Descens a Primera FEB', 'relegation')];
  } else if (data.competition === 'ELW' && data.season === 'F2026') {
    if (teams.length === 4 && ['Regular Season - First Round', 'First Round', '1st Round'].includes(phase)) {
      zones = [zone(1, 3, '2F', 'Segona fase'), zone(4, 4, 'EC', 'EuroCup femenina', 'transfer')];
    } else if (teams.length === 6 && ['Regular Season - Second Round', 'Second Round', '2nd Round'].includes(phase)) {
      zones = [zone(1, 2, 'SF', 'Play-in de semifinals · plaça en la Final Six'), zone(3, 4, 'QF', 'Play-in de quarts de final', 'playin')];
    }
  } else if (data.competition === 'BCL' && data.season === 'F2026' && teams.length === 4) {
    if (phase === 'Regular Season') zones = [zone(1, 1, '16', 'Top 16 directe'), zone(2, 3, 'PI', 'Play-in', 'playin')];
    else if (phase === 'Round of 16') zones = [zone(1, 2, 'QF', 'Quarts de final')];
  }
  return zones ? { zones, source: sources[data.competition] } : null;
}

module.exports = { zonesFor };
