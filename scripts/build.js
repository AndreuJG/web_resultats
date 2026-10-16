const fs = require('node:fs');
const path = require('node:path');

const competitions = [
  ['seleccio-masculina', 'Selecció masculina', 'Espanya · FIBA'],
  ['seleccio-femenina', 'Selecció femenina', 'Espanya · FIBA'],
  ['acb', 'Lliga Endesa masculina', 'ACB'],
  ['lf-endesa', 'Lliga Femenina Endesa', 'FEB'],
  ['eurolliga', 'Eurolliga masculina', 'Euroleague Basketball'],
  ['eurolliga-femenina', 'Eurolliga femenina', 'FIBA'],
  ['eurocup', 'EuroCup masculina', 'Euroleague Basketball'],
  ['champions', 'Basketball Champions League', 'BCL / FIBA'],
  ['tercera-feb-ea', 'Tercera FEB · Grup E-A', 'FEB · antiga Lliga EBA']
];

const css = `*{box-sizing:border-box}body{margin:0;background:#f4f3ef;color:#202923;font:18px/1.5 Arial,Helvetica,sans-serif}main{max-width:850px;margin:0 auto;padding:24px 20px 44px}a{color:#17573d;text-decoration:underline}a:focus,button:focus{outline:3px solid #b86516;outline-offset:3px}.eyebrow{font-size:14px;font-weight:bold;letter-spacing:2px;color:#46604e;margin:0 0 8px}h1{font-size:36px;line-height:1.15;margin:0 0 16px}h2{font-size:24px;margin:28px 0 12px}.intro{max-width:650px;color:#48544c}.notice{background:#fff3d9;border-left:4px solid #ba751d;padding:12px 16px;margin:24px 0;font-size:16px}.menu{list-style:none;padding:0;margin:24px 0}.menu li{border-top:1px solid #cbd2ca}.menu li:last-child{border-bottom:1px solid #cbd2ca}.menu a{display:block;padding:15px 10px;text-decoration:none;font-weight:bold;background:#fff}.menu a:hover{background:#e8eee6}.menu .tv-link{background:#e7ede4}.source{display:block;font-size:14px;font-weight:normal;color:#58635b}.back{display:inline-block;padding:8px 0;margin-bottom:20px}table{border-collapse:collapse;width:100%;background:#fff;font-size:17px}caption{text-align:left;color:#58635b;font-size:15px;margin-bottom:8px}th,td{padding:12px 8px;text-align:left;border-bottom:1px solid #d6dcd3}th{background:#e7ede4;font-size:14px}td.score{font-size:21px;font-weight:bold;white-space:nowrap}.numeric{text-align:right}.state{display:block;font-size:13px;font-weight:normal;color:#58635b}.tools{margin-top:24px}.button,button{display:inline-block;background:transparent;color:#17573d;border:1px solid #cbd2ca;border-radius:3px;padding:8px 10px;min-height:44px;font:inherit;font-size:16px;text-decoration:none;cursor:pointer;margin:0 6px 6px 0}button.secondary{background:#e0e6dc;color:#203828}footer{border-top:1px solid #cbd2ca;margin-top:32px;padding-top:16px;font-size:14px;color:#58635b}#refresh-status{font-size:15px} @media(max-width:480px){main{padding:20px 12px}h1{font-size:29px}th,td{padding:10px 5px}table{font-size:15px}td.score{font-size:18px}}`;

function page(title, content) {
  return `<!doctype html>\n<html lang="ca"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Resultats i classificacions de bàsquet. Versió lleugera per a iPad."><meta name="color-scheme" content="light"><title>${title} · Bàsquet al dia</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/style.css"></head><body><main>${content}</main></body></html>\n`;
}

const out = path.join(__dirname, '..', 'dist');
fs.mkdirSync(out, { recursive: true });
for (const file of competitions.map(c => c[0] + '.html').concat('refresh.js')) {
  if (fs.existsSync(path.join(out, file))) fs.unlinkSync(path.join(out, file));
}
fs.copyFileSync(path.join(__dirname, '..', 'public', 'live-refresh.js'), path.join(out, 'live-refresh.js'));
fs.writeFileSync(path.join(out, 'style.css'), css);
fs.writeFileSync(path.join(out, 'index.html'), page('Inici', `<p class="eyebrow">BÀSQUET AL DIA</p><h1>Resultats i classificacions</h1><nav aria-label="Competicions"><ul class="menu"><li><a class="tv-link" href="/televisio.html">Bàsquet per TV<span class="source">Pròxims 7 dies</span></a></li>${competitions.map(([slug, name, source]) => `<li><a href="/${slug}.html">${name}<span class="source">${source}</span></a></li>`).join('')}</ul></nav>`));

const files = fs.readdirSync(out);
for (const file of files) {
  const bytes = fs.statSync(path.join(out, file)).size;
  if (bytes > 50000) throw new Error(file + ' supera el pressupost de 50 KB');
  console.log(file + ': ' + bytes + ' bytes');
}
