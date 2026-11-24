// supabase/setup.sql on real Postgres 17, called as the API roles would call it.
// Runs in both database flavours (see tests/helpers/postgres.mjs) so it holds for old and new Supabase projects.
import assert from 'node:assert/strict';
import { startPostgres, DATABASES } from './helpers/postgres.mjs';

const ROOM = 'abcdefghjkmnpqrs2345', OTHER = 'zzzzzzzzzzzzzzzzzzzz', DUEL = 'duelaaaa1111';
const pg = await startPostgres();
let wrong = 0;

async function check(db){
  await pg.reset(db);
  const c = await pg.client(db);
  const as = async (role, sql, params = []) => {
    await c.query('begin'); await c.query(`set local role ${role}`);
    try { const r = await c.query(sql, params); await c.query('commit'); return { ok: true, rows: r.rows }; }
    catch (e){ await c.query('rollback'); return { ok: false, code: e.code, msg: e.message }; }
  };
  const room = (r = ROOM) => as('anon', 'select public.tobble_room($1::text) as v', [r]);
  const create = (id, seed = 123, by = 'Vanda', r = ROOM) =>
    as('anon', 'select public.tobble_new_duel(p_room := $1::text, p_id := $2::text, p_seed := $3::integer, p_created_by := $4::text)', [r, id, seed, by]);
  const save = (result, r = ROOM) =>
    as('anon', 'select public.tobble_save_result(p_room := $1::text, p_result := $2::jsonb)', [r, JSON.stringify(result)]);
  const expect = (label, outcome, allowed) => {
    const pass = outcome.ok === allowed;
    if (!pass) wrong++;
    console.log(`${pass ? 'ok   ' : 'WRONG'} [${db}] ${label} -> ${outcome.ok ? 'allowed' : `refused (${outcome.code}: ${String(outcome.msg).slice(0, 60)})`}`);
  };

  // normal play, including retries after a lost reply
  expect('read an empty game', await room(), true);
  expect('create a duel', await create(DUEL), true);
  expect('create the same duel again (retry)', await create(DUEL), true);
  const start = { duelId: DUEL, key: 'vanda', name: 'Vanda', startedAt: 1764000000000 };
  expect('store a started result', await save(start), true);
  expect('store the start again (retry)', await save(start), true);
  const fin = { ...start, finishedAt: 1764000009000, timeMs: 12000, mistakes: 1, splits: [900, 800, 1000, 700, 900, 800, 1000, 700, 900, 1300] };
  expect('finish it', await save(fin), true);
  expect('send the same finish again (lost reply)', await save(fin), true);
  expect('second player finishes in one go', await save({ duelId: DUEL, key: 'petr', name: 'Petr', startedAt: 5, finishedAt: 9005, timeMs: 9000, mistakes: 0, splits: [900] }), true);
  expect('out-of-time result (no time)', await save({ duelId: DUEL, key: 'eva', name: 'Eva', startedAt: 5, finishedAt: 600005, dnf: true }), true);
  expect('result with a token', await save({ duelId: DUEL, key: 'jan', name: 'Jan', startedAt: 7, token: 'robin' }), true);
  expect('finish it without repeating the token', await save({ duelId: DUEL, key: 'jan', name: 'Jan', startedAt: 7, finishedAt: 9007, timeMs: 9000 }), true);
  const data = (await room()).rows[0].v;
  assert.equal(data.duels.length, 1);
  assert.equal(data.results.length, 4);
  const v = data.results.find(r => r.key === 'vanda');
  assert.deepEqual([v.id, v.timeMs, v.mistakes, v.splits.length, v.dnf, v.token], [`${DUEL}_vanda`, 12000, 1, 10, false, null]);
  assert.equal(data.results.find(r => r.key === 'eva').dnf, true);
  assert.equal(data.results.find(r => r.key === 'jan').token, 'robin', 'the token is kept when the finish leaves it out');
  assert.ok(Math.abs(data.duels[0].createdAt - Date.now()) < 60000, 'createdAt is server time in ms');

  // what must be refused
  expect('change a finished time', await save({ ...fin, finishedAt: 1764000001000, timeMs: 1 }), false);
  expect("overwrite the opponent's result", await save({ duelId: DUEL, key: 'petr', name: 'Petr', startedAt: 5, finishedAt: 6, timeMs: 999999 }), false);
  await save({ duelId: DUEL, key: 'new1', name: 'New', startedAt: 10 });
  expect('restart the clock on an unfinished result', await save({ duelId: DUEL, key: 'new1', name: 'New', startedAt: 99999 }), false);
  expect('result for a duel of another game', await save(start, OTHER), false);
  expect('result for a duel that does not exist', await save({ ...start, duelId: 'nope00000000' }), false);
  expect('result without a start time', await save({ duelId: DUEL, key: 'x', name: 'X' }), false);
  expect('finished result without a time', await save({ duelId: DUEL, key: 'x', name: 'X', startedAt: 1, finishedAt: 2 }), false);
  expect('5,000-character name', await save({ duelId: DUEL, key: 'x', name: 'Z'.repeat(5000), startedAt: 1 }), false);
  expect('empty name', await save({ duelId: DUEL, key: 'x', name: '   ', startedAt: 1 }), false);
  expect('20 splits', await save({ duelId: DUEL, key: 'x', name: 'X', startedAt: 1, splits: Array(20).fill(1) }), false);
  expect('text in splits', await save({ duelId: DUEL, key: 'x', name: 'X', startedAt: 1, splits: ['<b>'] }), false);
  expect('negative time', await save({ duelId: DUEL, key: 'x', name: 'X', startedAt: 1, finishedAt: 2, timeMs: -5 }), false);
  expect('markup as a token', await save({ duelId: DUEL, key: 'x', name: 'X', startedAt: 1, token: '<b>' }), false);
  expect('very long token', await save({ duelId: DUEL, key: 'x', name: 'X', startedAt: 1, token: 'a'.repeat(40) }), false);
  expect('result that is not an object', await as('anon', `select public.tobble_save_result('${ROOM}', '[1,2]'::jsonb)`), false);
  expect('duel with a bad id', await create('<script>'), false);
  expect('duel with a negative seed', await create('duelbbbb2222', -4), false);
  expect('duel with a 100-character creator name', await create('duelcccc3333', 1, 'Q'.repeat(100)), false);
  expect('duel in a short, guessable game id', await create('dueldddd4444', 1, 'X', 'abc'), false);
  expect('duel id already used by another game', await create(DUEL, 1, 'X', OTHER), false);
  expect('read a short, guessable game id', await room('abc'), false);
  expect('read another game: sees nothing of this one', { ok: (await room(OTHER)).rows[0].v.duels.length === 0 }, true);
  for (const role of ['anon', 'authenticated']){
    expect(`${role}: read the results table directly`, await as(role, 'select * from public.tobble_results'), false);
    expect(`${role}: read the duels table directly`, await as(role, 'select * from public.tobble_duels'), false);
    expect(`${role}: insert into the results table directly`, await as(role, `insert into public.tobble_results (duel_id, player_key, room, name, started_at) values ('${DUEL}','h','${ROOM}','H',1)`), false);
    expect(`${role}: update the results table directly`, await as(role, 'update public.tobble_results set time_ms = 1'), false);
    expect(`${role}: delete from the duels table directly`, await as(role, 'delete from public.tobble_duels'), false);
  }
  const accepted = [];
  for (let i = 0; i < 12; i++) accepted.push((await save({ duelId: DUEL, key: 'p' + i, name: 'P' + i, startedAt: 1 })).ok);
  expect('more than 10 players in one duel', { ok: accepted.every(Boolean), code: 'limit', msg: `${accepted.filter(Boolean).length} of 12 accepted` }, false);

  const after = (await room()).rows[0].v;
  assert.equal(after.results.find(r => r.key === 'vanda').timeMs, 12000, 'finished time unchanged');
  assert.equal(after.results.find(r => r.key === 'petr').timeMs, 9000, "opponent's time unchanged");
  await c.end();
}

try {
  for (const db of DATABASES) await check(db);
  assert.equal(wrong, 0, `${wrong} checks went the wrong way`);
  console.log('SQL TESTS PASSED');
} finally {
  await pg.stop();
}
