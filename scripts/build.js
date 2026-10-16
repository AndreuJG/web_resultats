const fs = require('node:fs');
const path = require('node:path');

const competitions = [
  ['acb', 'Lliga Endesa masculina', 'ACB'],
  ['lf-endesa', 'Lliga Femenina Endesa', 'FEB'],
  ['eurolliga', 'Eurolliga masculina', 'Euroleague Basketball'],
  ['eurolliga-femenina', 'Eurolliga femenina', 'FIBA'],
  ['eurocup', 'EuroCup masculina', 'Euroleague Basketball'],
  ['champions', 'Basketball Champions League', 'BCL / FIBA'],
  ['tercera-feb-ea', 'Tercera FEB · Grup E-A', 'FEB · antiga Lliga EBA']
];

const css = `*{box-sizing:border-box}body{margin:0;background:#f4f3ef;color:#202923;font:18px/1.5 Arial,Helvetica,sans-serif}main{max-width:850px;margin:0 auto;padding:24px 20px 44px}a{color:#17573d;text-decoration:underline}a:focus,button:focus{outline:3px solid #b86516;outline-offset:3px}.eyebrow{font-size:14px;font-weight:bold;letter-spacing:2px;color:#46604e;margin:0 0 8px}h1{font-size:36px;line-height:1.15;margin:0 0 16px}h2{font-size:24px;margin:28px 0 12px}.intro{max-width:650px;color:#48544c}.notice{background:#fff3d9;border-left:4px solid #ba751d;padding:12px 16px;margin:24px 0;font-size:16px}.menu{list-style:none;padding:0;margin:24px 0}.menu li{border-top:1px solid #cbd2ca}.menu li:last-child{border-bottom:1px solid #cbd2ca}.menu a{display:block;padding:15px 10px;text-decoration:none;font-weight:bold;background:#fff}.menu a:hover{background:#e8eee6}.source{display:block;font-size:14px;font-weight:normal;color:#58635b}.back{display:inline-block;padding:8px 0;margin-bottom:20px}table{border-collapse:collapse;width:100%;background:#fff;font-size:17px}caption{text-align:left;color:#58635b;font-size:15px;margin-bottom:8px}th,td{padding:12px 8px;text-align:left;border-bottom:1px solid #d6dcd3}th{background:#e7ede4;font-size:14px}td.score{font-size:21px;font-weight:bold;white-space:nowrap}.numeric{text-align:right}.state{display:block;font-size:13px;font-weight:normal;color:#58635b}.tools{margin-top:24px}.button,button{display:inline-block;background:#17573d;color:#fff;border:0;border-radius:3px;padding:12px 18px;min-height:46px;font:inherit;text-decoration:none;cursor:pointer;margin:0 10px 10px 0}button.secondary{background:#e0e6dc;color:#203828}footer{border-top:1px solid #cbd2ca;margin-top:32px;padding-top:16px;font-size:14px;color:#58635b}#refresh-status{font-size:15px} @media(max-width:480px){main{padding:20px 12px}h1{font-size:29px}th,td{padding:10px 5px}table{font-size:15px}td.score{font-size:18px}}`;

// Browser script deliberately uses ES5 syntax and basic DOM APIs for old Safari.
const js = `(function(){var button=document.getElementById('auto-refresh');var status=document.getElementById('refresh-status');var timer=null;if(!button||!status){return;}button.style.display='inline-block';button.onclick=function(){if(timer!==null){window.clearTimeout(timer);timer=null;button.setAttribute('aria-pressed','false');button.innerHTML='Activa la recàrrega cada 60 s';status.innerHTML='Recàrrega automàtica desactivada.';}else{button.setAttribute('aria-pressed','true');button.innerHTML='Desactiva la recàrrega';status.innerHTML='La pàgina es recarregarà una vegada en 60 segons. Les dades continuen sent exemples.';timer=window.setTimeout(function(){window.location.reload();},60000);}};}());`;

function page(title, content) {
  return `<!doctype html>\n<html lang="ca"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Resultats i classificacions de bàsquet. Versió lleugera de prova per a iPad."><meta name="color-scheme" content="light"><title>${title} · Bàsquet al dia</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/style.css"></head><body><main>${content}<footer>Versió 0.1 · Prova de compatibilitat amb Safari d’iOS 12.<br>Sense imatges, fonts externes ni biblioteques. Totes les dades són de demostració.</footer></main><script src="/refresh.js" defer></script></body></html>\n`;
}

const notice = '<p class="notice"><strong>Web de prova.</strong> Les dades són fictícies. Encara no hi ha resultats reals ni connexió en directe.</p>';
const out = path.join(__dirname, '..', 'dist');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'style.css'), css);
fs.writeFileSync(path.join(out, 'refresh.js'), js);
fs.writeFileSync(path.join(out, 'index.html'), page('Inici', `<p class="eyebrow">BÀSQUET AL DIA</p><h1>Resultats i classificacions</h1><p class="intro">Tot el bàsquet, amb una pàgina senzilla. Tria una competició per a provar els resultats i la classificació.</p>${notice}<nav aria-label="Competicions"><ul class="menu">${competitions.map(([slug, name, source]) => `<li><a href="/${slug}.html">${name}<span class="source">${source}</span></a></li>`).join('')}</ul></nav><h2>Prova en el teu iPad</h2><p>Obri una competició, comprova que pots llegir les taules i torna a l’inici. Prova també el botó «Recarrega la pàgina».</p>`));

for (const [slug, name, source] of competitions) {
  fs.writeFileSync(path.join(out, slug + '.html'), page(name, `<a class="back" href="/">← Totes les competicions</a><p class="eyebrow">BÀSQUET AL DIA</p><h1>${name}</h1><p class="intro">Font prevista: ${source}.</p>${notice}<p><a href="#resultats">Resultats</a> &nbsp;·&nbsp; <a href="#classificacio">Classificació</a></p><h2 id="resultats">Resultats</h2><table><caption>Jornada de demostració · marcadors ficticis</caption><thead><tr><th scope="col">Local</th><th scope="col">Marcador</th><th scope="col">Visitant</th></tr></thead><tbody><tr><td>Equip A</td><td class="score">82 – 76<span class="state">Final · exemple</span></td><td>Equip B</td></tr><tr><td>Equip C</td><td class="score">18:30<span class="state">Pendent · exemple</span></td><td>Equip D</td></tr></tbody></table><h2 id="classificacio">Classificació</h2><table><caption>Taula de demostració · PJ: partits · V: victòries · D: derrotes</caption><thead><tr><th scope="col">Pos.</th><th scope="col">Equip</th><th scope="col" class="numeric">PJ</th><th scope="col" class="numeric">V</th><th scope="col" class="numeric">D</th></tr></thead><tbody><tr><td>1</td><td>Equip A</td><td class="numeric">1</td><td class="numeric">1</td><td class="numeric">0</td></tr><tr><td>2</td><td>Equip B</td><td class="numeric">1</td><td class="numeric">0</td><td class="numeric">1</td></tr></tbody></table><div class="tools"><a class="button" href="/${slug}.html">Recarrega la pàgina</a><button class="secondary" id="auto-refresh" type="button" aria-pressed="false" style="display:none">Activa la recàrrega cada 60 s</button><p id="refresh-status" role="status">Recàrrega automàtica desactivada.</p><noscript><p>JavaScript està desactivat. Pots consultar totes les taules i recarregar amb el botó anterior.</p></noscript></div>`));
}

const files = fs.readdirSync(out);
for (const file of files) {
  const bytes = fs.statSync(path.join(out, file)).size;
  if (bytes > 50000) throw new Error(file + ' supera el pressupost de 50 KB');
  console.log(file + ': ' + bytes + ' bytes');
}
