// Serves index.html over HTTP.
// Tests import serve(); `npm run serve` starts it on http://127.0.0.1:8080 for playing in a browser.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// transform(html) lets a test serve a modified copy of the page, for example with Supabase settings filled in.
export function serve({ transform, port = 0 } = {}){
  const server = http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://x');
    if (pathname !== '/' && pathname !== '/index.html'){ res.writeHead(404); res.end('Not found'); return; }
    let html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
    if (transform) html = transform(html);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html);
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => {
    const actual = server.address().port;
    resolve({
      url: `http://127.0.0.1:${actual}/`,
      close: () => new Promise(done => { server.closeAllConnections(); server.close(done); }),
    });
  }));
}

// Fills in the settings at the top of the page's script.
export function withSettings({ url = '', key = '', pollMs = 10000 } = {}){
  return html => {
    for (const s of ["const SUPABASE_URL = '';", "const SUPABASE_KEY = '';", 'const POLL_MS = 10000;']){
      if (!html.includes(s)) throw new Error(`index.html no longer contains "${s}"; update tests/helpers/serve.mjs`);
    }
    return html.replace("const SUPABASE_URL = '';", `const SUPABASE_URL = '${url}';`)
               .replace("const SUPABASE_KEY = '';", `const SUPABASE_KEY = '${key}';`)
               .replace('const POLL_MS = 10000;', `const POLL_MS = ${pollMs};`);
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href){
  const { url } = await serve({ port: Number(process.env.PORT) || 8080 });
  console.log(`Symbol Duel is running at ${url} (demo mode unless the Supabase settings are filled in). Ctrl+C stops it.`);
}
