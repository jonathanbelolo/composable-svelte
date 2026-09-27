/** Minimal static server for the built cache fixture: no HMR, no websocket, no cache-busting headers. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
export function serve(root) {
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://local').pathname);
    // Application routes (/app/...) are client-routed: serve the fixture document.
    const file = path.startsWith('/app/') ? 'cache.html' : normalize(path).replace(/^([/\\])+/, '');
    try {
      const body = await readFile(join(root, file));
      response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })));
}
