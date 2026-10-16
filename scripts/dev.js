const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

async function start() {
  const { GET: euroleague } = await import('../api/eurolliga.mjs');
  const { GET: eurocup } = await import('../api/eurocup.mjs');
  const { GET: acb } = await import('../api/acb.mjs');
  const { GET: female } = await import('../api/lf-endesa.mjs');
  http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1:8766');
    const handler = { '/eurolliga.html': euroleague, '/api/eurolliga': euroleague, '/eurocup.html': eurocup, '/api/eurocup': eurocup, '/acb.html': acb, '/api/acb': acb, '/lf-endesa.html': female, '/api/lf-endesa': female }[url.pathname];
    if (handler) {
      const response = await handler(new Request(url));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
      return;
    }
    const file = path.resolve('dist', '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(path.resolve('dist') + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end('No trobat'); return;
    }
    const type = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript' }[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(file).pipe(res);
  }).listen(8766, '127.0.0.1', () => console.log('http://127.0.0.1:8766'));
}
start();
