// Only verified season/phase rules belong here. An unknown table stays unmarked.
const sources = {
  E: 'https://mediacentre.euroleague.net/en/app/2/communication/communication/preview/24407',
  U: 'https://mediacentre.euroleague.net/en/app/2/communication/communication/preview/24408',
  ACB: 'https://www.acb.com/es/liga/clasificacion',
  ELW: 'https://www.fiba.basketball/en/events/euroleague-women-26-27/competition-system-explained',
  BCL: 'https://www.championsleague.basketball/en/competition-system',
  LF: 'https://www.feb.es/Documentos/Enlaces/%5B6536%5DBBCC%20LF%20ENDESA%2026-27%20-%20Versi%C3%B3n%20Web.pdf#page=14',
  TERCERA_EA: 'https://www.feb.es/Documentos/Enlaces/%5B6547%5DBBCC%20Tercera%20FEB%2026-27%20-%20Versi%C3%B3n%20Web.pdf#page=6',
  ESM: 'https://www.fiba.basketball/en/events/fiba-basketball-world-cup-2027-european-qualifiers/how-to-qualify-for-the-world-cup',
  ESW: 'https://www.fiba.basketball/en/events/fiba-womens-eurobasket-2027-qualifiers/how-to-qualify'
};
const zone = (from, to, code, label, style = 'advance') => ({ from, to, code, label, style });
// FEB's validated classic adapter and permanent archives contain Liga Regular
// only. Recognise old snapshots without rewriting the immutable archive files.
function regularCalendar(data, total) {
  return Array.isArray(data.rounds) && data.rounds.length === total
    && [...data.rounds].sort((a, b) => a - b).every((r, i) => r === i + 1)
    && [undefined, 'regular-season'].includes(data.standings?.phase);
}

function zonesFor(data, group) {
  const teams = group.teams;
  // Reject incomplete/duplicate rankings rather than painting a misleading cutoff.
  const ranks = teams.map(t => t.position).sort((a, b) => a - b);
  if (!ranks.length || ranks.some((rank, i) => rank !== i + 1)) return null;
  const phase = data.standings?.phase;
  let zones, note, assured;
  if (data.competition === 'E' && data.season === 'E2026' && teams.length === 20 && data.standings.round <= 38 && group.name === 'Regular Season') {
    zones = [zone(1, 6, 'PL', 'Playoff directe'), zone(7, 10, 'PI', 'Play-in', 'playin')];
  } else if (data.competition === 'U' && data.season === 'U2026' && teams.length === 8 && data.standings.round <= 14 && /^Grup [A-D]$/.test(group.name)) {
    zones = [zone(1, 4, 'OF', 'Octaus de final')];
  } else if (data.competition === 'ACB' && data.season === 'A2026' && phase === 'regular-season' && teams.length === 18) {
    zones = [zone(1, 8, 'PL', 'Playoff pel títol'), zone(17, 18, 'D', 'Descens a Primera FEB', 'relegation')];
  } else if (data.competition === 'LF' && data.season === 'F2026' && teams.length === 16 && group.name === 'Lliga Femenina Endesa' && regularCalendar(data, 30)) {
    // BBCC 2026-27, sections 3.2.2 and 3.3 (printed pages 13-14).
    zones = [zone(1, 8, 'PL', 'Playoff pel títol'), zone(15, 16, 'D', 'Descens a LF Challenge', 'relegation')];
  } else if (data.competition === 'TERCERA_EA' && data.season === 'F2026' && teams.length === 14 && group.name === 'Tercera FEB · Grup E-A' && regularCalendar(data, 26)) {
    // BBCC 2026-27, sections 1.2.2 and 1.3 (printed pages 5-6 and 10).
    // Rank 1 is not a direct promotion: it enters the group-winners tie.
    zones = [zone(1, 1, 'EP', 'Eliminatòria entre primers de grup'), zone(2, 4, 'PA', 'Eliminatòries d’accés a la fase d’ascens', 'playin'), zone(12, 14, 'D', 'Descens a Primera Divisió masculina', 'relegation')];
  } else if (data.competition === 'ELW' && data.season === 'F2026') {
    if (teams.length === 4 && ['Regular Season - First Round', 'First Round', '1st Round'].includes(phase)) {
      zones = [zone(1, 3, '2F', 'Segona fase'), zone(4, 4, 'EC', 'EuroCup femenina', 'transfer')];
    } else if (teams.length === 6 && ['Regular Season - Second Round', 'Second Round', '2nd Round'].includes(phase)) {
      zones = [zone(1, 2, 'SF', 'Play-in de semifinals · plaça en la Final Six'), zone(3, 4, 'QF', 'Play-in de quarts de final', 'playin')];
    }
  } else if (data.competition === 'BCL' && data.season === 'F2026' && teams.length === 4) {
    if (phase === 'Regular Season') zones = [zone(1, 1, '16', 'Top 16 directe'), zone(2, 3, 'PI', 'Play-in', 'playin')];
    else if (phase === 'Round of 16') zones = [zone(1, 2, 'QF', 'Quarts de final')];
  } else if (data.competition === 'ESM' && data.eventSeason === 2027 && data.nationalEvent === 'fiba-basketball-world-cup-2027-european-qualifiers') {
    if (['1st Round', 'First Round'].includes(phase) && teams.length === 4 && /^Grup [A-H]$/.test(group.name)) zones = [zone(1, 3, '2F', 'Segona fase')];
    else if (['2nd Round', 'Second Round'].includes(phase) && teams.length === 6 && /^Grup [I-L]$/.test(group.name)) zones = [zone(1, 3, 'M', 'Mundial 2027')];
  } else if (data.competition === 'ESW' && data.eventSeason === 2027 && data.nationalEvent === 'fiba-womens-eurobasket-2027-qualifiers') {
    if (['1st Round', 'First Round'].includes(phase) && [3, 4].includes(teams.length) && /^Grup [A-G]$/.test(group.name)) {
      zones = [zone(1, 2, '2F', 'Segona fase'), zone(3, 3, 'OP', 'Opció de segona fase: tres millors tercers', 'playin')];
      note = 'Els tercers es comparen sense els resultats contra els quarts; només en passen tres.';
    } else if (['2nd Round', 'Second Round'].includes(phase) && teams.length === 4 && /^Grup [I-N]$/.test(group.name)) zones = [zone(1, 2, 'EB', 'EuroBasket 2027')];
    else if (phase === 'Hosts' && group.name === 'Grup H' && teams.length === 4 && teams.every(t => ['BEL', 'FIN', 'LTU', 'SWE'].includes(t.code))) {
      zones = [zone(1, 4, 'A', 'Amfitriones · plaça assegurada')];
      assured = true;
    }
  }
  return zones ? { zones, source: sources[data.competition], note, assured } : null;
}

module.exports = { zonesFor };
