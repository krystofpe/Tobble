// Serves the game over HTTP: index.html and the files under assets/.
// Tests import serve(); `npm run serve` starts it on http://127.0.0.1:8080 for playing in a browser.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ASSETS = path.join(ROOT, 'assets');
const TYPES = { '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };

// index.html carries the live site's Supabase settings. Tests never use them: the page is served with both
// settings emptied (demo mode), and a test that needs a scoreboard fills in its own with withSettings().
export function demoSettings(html){
  for (const name of ['SUPABASE_URL', 'SUPABASE_KEY']){
    const line = new RegExp(`^const ${name} = '[^']*';`, 'gm');
    if ((html.match(line) || []).length !== 1) throw new Error(`index.html must have exactly one "const ${name} = '…';" line; update tests/helpers/serve.mjs`);
    html = html.replace(line, `const ${name} = '';`);
  }
  return html;
}

// transform(html) lets a test serve a modified copy of the page, for example with Supabase settings filled in.
// live: true serves index.html with its own settings (npm run serve:live).
export function serve({ transform, port = 0, live = false } = {}){
  const server = http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://x');
    if (pathname === '/' || pathname === '/index.html'){
      let html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
      if (!live) html = demoSettings(html);
      if (transform) html = transform(html);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(html);
      return;
    }
    const file = path.join(ROOT, decodeURIComponent(pathname));
    const type = TYPES[path.extname(file)];
    if (pathname.startsWith('/assets/') && file.startsWith(ASSETS + path.sep) && type){
      try {
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
        res.end(body);
        return;
      } catch {}
    }
    res.writeHead(404); res.end('Not found');
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
  const live = process.env.LIVE === '1';
  const { url } = await serve({ port: Number(process.env.PORT) || 8080, live });
  console.log(`Tobble is running at ${url} ${live ? 'with the real scoreboard from index.html' : 'in demo mode (LIVE=1 for the real scoreboard)'}. Ctrl+C stops it.`);
}
