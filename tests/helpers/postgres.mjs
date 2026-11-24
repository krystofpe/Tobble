// A throwaway Postgres 17 (the binaries come from npm, nothing to install) shaped like a Supabase project:
//   - API roles anon, authenticated and service_role
//   - "supa_admin", a non-superuser owner like the role the Supabase SQL Editor runs as
//   - "tester", a login that can switch to anon or authenticated, the way PostgREST does
// and two databases, both with supabase/setup.sql applied:
//   legacy  new objects in public are granted to the API roles automatically (Supabase projects before the 2026 change)
//   fresh   nothing is granted automatically (projects since the change)
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './serve.mjs';

const PASSWORDS = { postgres: 'postgres', supa_admin: 'admin', tester: 'tester' };
export const DATABASES = ['legacy', 'fresh'];

// supabase/setup.sql and the copy embedded in index.html (shown in the in-game setup guide) must stay identical.
export function checkSetupSqlInSync(){
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const marker = 'const SETUP_SQL = `';
  const start = html.indexOf(marker);
  if (start < 0) throw new Error('SETUP_SQL not found in index.html');
  const embedded = html.slice(start + marker.length, html.indexOf('`;', start));
  const file = fs.readFileSync(path.join(ROOT, 'supabase', 'setup.sql'), 'utf8');
  if (embedded !== file) throw new Error('supabase/setup.sql and SETUP_SQL in index.html differ: change both together.');
  return file;
}

function freePort(){
  return new Promise((resolve, reject) => {
    const probe = net.createServer().once('error', reject);
    probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
  });
}

export async function startPostgres(){
  const setupSql = checkSetupSqlInSync();
  const port = await freePort();
  const server = new EmbeddedPostgres({
    databaseDir: fs.mkdtempSync(path.join(os.tmpdir(), 'tobble-pg-')),
    user: 'postgres', password: PASSWORDS.postgres, port, persistent: false,
    // Postgres refuses to run as root; only relevant inside containers.
    createPostgresUser: typeof process.getuid === 'function' && process.getuid() === 0,
    onLog: () => {}, onError: () => {},
  });
  await server.initialise();
  await server.start();

  const config = (database, user = 'tester') => ({ host: '127.0.0.1', port, database, user, password: PASSWORDS[user] });
  const run = async (database, user, text) => {
    const client = new pg.Client(config(database, user));
    await client.connect();
    try { await client.query(text); } finally { await client.end(); }
  };

  await run('postgres', 'postgres', `
    create role anon nologin noinherit;
    create role authenticated nologin noinherit;
    create role service_role nologin noinherit bypassrls;
    create role supa_admin login password '${PASSWORDS.supa_admin}' createrole;
    create role tester login password '${PASSWORDS.tester}' noinherit;
    grant anon, authenticated to tester;`);
  for (const db of DATABASES){
    await run('postgres', 'postgres', `create database ${db} owner supa_admin`);
    await run(db, 'postgres', `grant all on schema public to supa_admin;
                               grant usage on schema public to anon, authenticated, service_role;`);
  }
  await run('legacy', 'postgres', `
    alter default privileges for role supa_admin in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges for role supa_admin in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges for role supa_admin in schema public grant all on sequences to anon, authenticated, service_role;`);
  for (const db of DATABASES){
    await run(db, 'supa_admin', setupSql);
    await run(db, 'supa_admin', setupSql);   // running the script a second time must also succeed
  }

  return {
    port,
    config,
    // A connected pg.Client; the caller ends it.
    async client(database, user = 'tester'){ const c = new pg.Client(config(database, user)); await c.connect(); return c; },
    async reset(database){ await run(database, 'supa_admin', 'truncate public.tobble_results, public.tobble_duels'); },
    stop: () => server.stop(),
  };
}
