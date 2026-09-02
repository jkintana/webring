/** Tiny static server for dist/, so you can see the embed pages locally. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { ROOT } from './lib.mjs';

const DIST = join(ROOT, 'dist');
const TYPES = { '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.js': 'text/javascript' };
const PORT = Number(process.env.PORT) || 4444;

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  if (!extname(path)) path += '/index.html';
  try {
    const body = await readFile(join(DIST, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
}).listen(PORT, () => console.log(`serving dist/ at http://localhost:${PORT}`));
