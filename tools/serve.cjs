const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 8000);
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm','.md':'text/plain; charset=utf-8'};
http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  const parts = url.split('/').filter(Boolean);
  if (parts.some(p => p.startsWith('.') || p.includes('\\')) || ['api','tools'].includes(parts[0])) { res.writeHead(404).end(); return; }
  let file = path.resolve(root, '.' + url);
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end(); return; }
  try {
    if (fs.statSync(file).isDirectory()) {
      if (!url.endsWith('/')) { res.writeHead(301, {Location:url + '/'}).end(); return; }
      file = path.join(file, 'index.html');
    }
    const body = fs.readFileSync(file);
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
    res.end(body);
  } catch { res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}).end('Página não encontrada.'); }
}).listen(port, '127.0.0.1', () => console.log('Ink × Stella: http://127.0.0.1:' + port + '/'));

