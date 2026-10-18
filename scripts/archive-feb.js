const fs = require('node:fs');
const path = require('node:path');
const { createService } = require('../lib/feb');
const { isClosed } = require('../lib/feb-archive');

async function updateArchive(archive, load, now = Date.now, report = console.log) {
  const { season, calendar } = await load.calendar();
  const previous = archive.seasons[season] || { rounds: {} };
  const rounds = { ...previous.rounds };
  const numbers = [...new Set(calendar.map(g => Number(g.matchday.slice(1))))].sort((a, b) => a - b);
  for (const round of numbers) {
    if (rounds[round]?.closed) { report('Jornada ' + round + ': arxivada; sense consulta.'); continue; }
    const data = await load(String(round));
    if (data.season !== season || data.round !== round || data.scheduleStale || data.games.some(g => g.stale) || !data.games.length) throw new Error('Invalid archival snapshot for round ' + round);
    delete data.cacheSeconds;
    delete data.currentRound;
    delete data.nextMatchAt;
    rounds[round] = { savedAt: now(), closed: Boolean(isClosed(data)), data };
    report('Jornada ' + round + ': ' + (rounds[round].closed ? 'tancada' : 'pendent'));
  }
  // The calendar page omits dates once it publishes a final score. Preserve
  // the actual dates/times from the round pages, including postponed fixtures.
  const games = new Map(Object.values(rounds).flatMap(entry => entry.data.games).map(g => [g.code, g]));
  const dateFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid' });
  const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const merged = calendar.map(raw => {
    const game = games.get(raw.idPartido);
    if (!game?.date) return raw;
    return { ...raw, fecha: dateFormat.format(new Date(game.date)), hora: game.timeUnknown ? '' : timeFormat.format(new Date(game.date)) };
  });
  return { ...archive, seasons: { ...archive.seasons, [season]: { updatedAt: now(), calendar: merged, rounds } } };
}

async function main(competition = 'TERCERA_EA') {
  const files = { TERCERA_EA: 'tercera-feb.json', LF: 'lf-endesa.json' };
  if (!files[competition]) throw new Error('Unknown archival competition');
  const file = path.join(__dirname, '..', 'data', files[competition]);
  const archive = JSON.parse(fs.readFileSync(file, 'utf8'));
  const source = createService({ competition, archive: false, calendarSeed: archive });
  async function retry(task) {
    for (let attempt = 0; ; attempt++) {
      try { return await task(); } catch (error) {
        if (attempt >= 2) throw error;
        console.log('La FEB no respon; nou intent.');
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  const load = round => retry(() => source(round));
  load.calendar = () => retry(() => source.calendar());
  const updated = await updateArchive(archive, load);
  // Atomic replacement only after a complete successful refresh. A failed
  // official source never destroys the last good archive.
  fs.writeFileSync(file + '.new', JSON.stringify(updated, null, 2) + '\n');
  fs.renameSync(file + '.new', file);
}

if (require.main === module) main(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { updateArchive };
