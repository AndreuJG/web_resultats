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
  return { ...archive, seasons: { ...archive.seasons, [season]: { updatedAt: now(), calendar, rounds } } };
}

async function main() {
  const file = path.join(__dirname, '..', 'data', 'tercera-feb.json');
  const archive = JSON.parse(fs.readFileSync(file, 'utf8'));
  const source = createService({ competition: 'TERCERA_EA', archive: false, calendarSeed: archive });
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

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { updateArchive };
