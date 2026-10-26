/* Local preview of a built site, the way GitHub Pages serves it: node tools/serve.mjs [dist] [8480]
   /dir/ → /dir/index.html, /dir → redirect to /dir/, no extra headers (Pages sets none we control). */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'dist'), port = +(process.argv[3] || 8480);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    if (fs.statSync(f).isDirectory()) {
      if (!p.endsWith('/')) { res.writeHead(301, { Location: p + '/' }).end(); return; }
      f = path.join(f, 'index.html');
    }
    const body = fs.readFileSync(f);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'max-age=600' }).end(body);
  } catch (e) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404'); }
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
