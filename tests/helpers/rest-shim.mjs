// A stand-in for Supabase's API gateway + PostgREST, covering only what the game uses:
// POST /rest/v1/rpc/<function> with the key in the apikey header.
// Each call runs against the real Postgres as role "anon", the way PostgREST runs it, and errors come back
// with PostgREST's HTTP statuses and JSON shape. It is not PostgREST: verify against a real project too.
import http from 'node:http';
import pg from 'pg';

const STATUS_500_CLASSES = ['08', '09', '25', '2D', '38', '39', '3B', '40', '53', '54', '55', '57', '58', 'F0', 'HV', 'XX'];
function httpStatus(code){
  if (code === '42501') return 401;                          // insufficient privilege for an anonymous caller
  if (code === '42883') return 404;                          // undefined function
  if (code === '23505' || code === '23503') return 409;
  if (code === 'P0001') return 400;                          // raise exception
  if (STATUS_500_CLASSES.includes(String(code).slice(0, 2))) return 500;
  return 400;
}

// ctl.mode: 'ok' | 'paused' (answers 540 like a paused Supabase project) | 'missing' (functions not created yet)
export async function restShim({ pgConfig, key }){
  const pool = new pg.Pool({ ...pgConfig, max: 6 });
  const ctl = { mode: 'ok', calls: [] };
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'apikey, authorization, content-type, x-client-info',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  };
  const server = http.createServer((req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { ...cors, 'content-type': 'application/json' });
      res.end(body === undefined ? '' : JSON.stringify(body));
    };
    if (req.method === 'OPTIONS'){ res.writeHead(204, cors); res.end(); return; }
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', async () => {
      const m = req.url.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/);
      ctl.calls.push({ fn: m && m[1], at: Date.now(), authorization: req.headers.authorization || null });
      if (ctl.mode === 'paused') return send(540, { message: 'Project is paused' });
      if (req.headers.apikey !== key) return send(401, { message: 'Invalid API key' });
      if (!m || req.method !== 'POST') return send(404, { code: 'PGRST125', message: 'Invalid path' });
      let args;
      try { args = raw ? JSON.parse(raw) : {}; } catch { return send(400, { code: 'PGRST102', message: 'Empty or invalid json' }); }
      const client = await pool.connect();
      try {
        // Like PostgREST's schema cache: pick the function whose argument names match the JSON body.
        const { rows } = await client.query(
          `select p.proargnames as names, array(select format_type(t, null) from unnest(p.proargtypes) t) as types,
                  format_type(p.prorettype, null) as ret
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = $1`, [m[1]]);
        const fn = rows.find(r => (r.names || []).length === Object.keys(args).length && (r.names || []).every(n => n in args));
        if (ctl.mode === 'missing' || !fn){
          return send(404, { code: 'PGRST202', message: `Could not find the function public.${m[1]} in the schema cache` });
        }
        const values = fn.names.map((n, i) => {
          const v = args[n];
          return v === null ? null : (fn.types[i] === 'jsonb' || fn.types[i] === 'json') ? JSON.stringify(v) : String(v);
        });
        const call = `select public.${m[1]}(${fn.names.map((n, i) => `${n} := $${i + 1}::${fn.types[i]}`).join(', ')}) as result`;
        await client.query('begin');
        await client.query('set local role anon');
        const out = await client.query(call, values);
        await client.query('commit');
        return fn.ret === 'void' ? send(204) : send(200, out.rows[0].result);
      } catch (e){
        await client.query('rollback').catch(() => {});
        return send(httpStatus(e.code), { code: e.code, message: e.message, details: e.detail || null, hint: e.hint || null });
      } finally {
        client.release();
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    ctl,
    close: async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); await pool.end(); },
  };
}
