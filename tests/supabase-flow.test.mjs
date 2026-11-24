// Two browsers ("devices") play through the page's Supabase code path:
// page -> REST stand-in (tests/helpers/rest-shim.mjs) -> real Postgres running supabase/setup.sql as role anon.
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { serve, withSettings } from './helpers/serve.mjs';
import { startPostgres } from './helpers/postgres.mjs';
import { restShim } from './helpers/rest-shim.mjs';
import { btn, playDuel, readPair, shot, unsavedCount, waitForPair, watchErrors } from './helpers/play.mjs';

const KEY = 'sb_publishable_TestKey_1234abcd', POLL = 1500;
const pg = await startPostgres();
const admin = await pg.client('fresh', 'supa_admin');
const api = await restShim({ pgConfig: pg.config('fresh'), key: KEY });
const site = await serve({ transform: withSettings({ url: api.url, key: KEY, pollMs: POLL }) });
const browser = await chromium.launch();
const errors = [], extra = [];

// Taps all pairs but the last, drops the connection, then taps the last one.
async function finishOffline(ctx, page){
  await btn(page, 'New duel').click(); await btn(page, 'Start').click();
  await page.waitForSelector('.stage .card:not(.blank)');
  await playDuel(page, { stopAfter: 9 });
  await waitForPair(page, 9);
  await ctx.setOffline(true);
  const last = await readPair(page);
  await page.locator('.stage .card').nth(1).locator(`.sym[data-id="${last.shared[0]}"]`).click();
  await page.waitForSelector('text=Your result is not saved to the scoreboard yet');
  return page.locator('.result .bigtime').textContent();
}

try {
  const player = async tag => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    watchErrors(page, errors, tag);
    return { ctx, page };
  };
  const A = await player('A'), B = await player('B');
  const roomChecks = [];
  A.page.on('request', r => { if (r.url().endsWith('/rpc/symbol_duel_room')) roomChecks.push(Date.now()); });

  // A creates a game; B joins with the invite link
  await A.page.goto(site.url);
  await btn(A.page, 'Create a new game').click();
  await A.page.fill('#name', 'Vanda'); await A.page.click('button[type=submit]');
  await A.page.waitForSelector('text=Challenge your opponent');
  assert.equal(await A.page.locator('text=Demo mode').count(), 0);
  const link = await A.page.locator('input[aria-label="Invite link"]').inputValue();
  const room = link.split('#')[1];
  assert.match(room, /^[a-z0-9]{20}$/);
  await B.page.goto(link);
  await B.page.fill('#name', 'Petr'); await B.page.click('button[type=submit]');
  await B.page.waitForSelector('text=Challenge your opponent');

  // A plays; nothing is fetched while the duel is on screen
  await btn(A.page, 'New duel').click(); await btn(A.page, 'Start').click();
  await A.page.waitForSelector('.stage .card:not(.blank)');
  const playStart = Date.now();
  await B.page.waitForSelector('text=One duel is waiting for you');
  assert.match(await B.page.locator('.duel.mine').textContent(), /Nobody has played it yet/);
  await A.page.waitForTimeout(2 * POLL + 200);
  const seqA = await playDuel(A.page);
  assert.equal(roomChecks.filter(t => t > playStart + 300 && t < Date.now()).length, 0, 'no polling during play');
  await A.page.waitForSelector('.result .bigtime');
  const timeA = await A.page.locator('.result .bigtime').textContent();
  await A.page.waitForFunction(() => !/Saving your result|not saved/.test(document.querySelector('.result').textContent));
  await B.page.waitForFunction(() => document.querySelector('.duel.mine').textContent.includes('Vanda already played'));
  assert.ok(!(await B.page.locator('#app').textContent()).includes(timeA), "A's time hidden from B before B plays");

  // B plays the same cards; A's result screen fills in by itself
  await B.page.locator('.duel.mine').getByRole('button', { name: 'Play', exact: true }).click();
  await btn(B.page, 'Start').click();
  await B.page.waitForSelector('.stage .card:not(.blank)');
  assert.deepEqual(await playDuel(B.page), seqA, 'same cards on both devices');
  await B.page.waitForSelector('.result table');
  const timeB = await B.page.locator('.result .bigtime').textContent();
  assert.ok((await B.page.locator('.result').textContent()).includes(timeA));
  await A.page.waitForSelector('.result table', { timeout: 4 * POLL });
  assert.ok((await A.page.locator('.result').textContent()).includes(timeB));
  await btn(A.page, 'Back to all duels').click(); await btn(B.page, 'Back to all duels').click();
  await A.page.locator('section:has(h2:text("Scoreboard")) tbody tr').nth(1).waitFor();
  await A.page.screenshot({ path: shot('supabase-lobby.png'), fullPage: true });
  const rows = (await admin.query('select player_key, time_ms, cardinality(splits) as n, dnf, finished_at is not null as done from public.symbol_results where room = $1', [room])).rows;
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => r.done && r.n === 10 && !r.dnf));
  assert.ok(Math.abs(rows.find(r => r.player_key === 'vanda').time_ms - parseFloat(timeA) * 1000) <= 5, 'stored time matches the screen');
  console.log(`two devices: same cards, live result, stored in Postgres (${timeA} vs ${timeB})`);

  // polling stops while the tab is hidden and resumes at once when it is shown
  const setHidden = hidden => A.page.evaluate(h => {
    Object.defineProperty(document, 'hidden', { value: h, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await setHidden(true); await A.page.waitForTimeout(400);
  const before = roomChecks.length;
  await A.page.waitForTimeout(2 * POLL + 500);
  assert.equal(roomChecks.length - before, 0, 'no polling while hidden');
  await setHidden(false); await A.page.waitForTimeout(400);
  assert.ok(roomChecks.length - before >= 1, 'checks straight away when shown again');
  console.log('hidden tab: no polling; shown again: checks at once');

  // the connection drops before the last tap: the result is sent by itself when it returns
  await finishOffline(A.ctx, A.page);
  await A.page.screenshot({ path: shot('supabase-unsaved.png') });
  await btn(A.page, 'Back to all duels').click();
  await A.page.waitForSelector('text=Not saved to the scoreboard yet');
  await A.page.waitForSelector('text=Scoreboard problem');
  await A.ctx.setOffline(false);
  await A.page.waitForSelector('text=Waiting for your opponent to play it.', { timeout: 8000 });
  await A.page.waitForFunction(() => !document.querySelector('.note.warn'));
  assert.equal(await unsavedCount(A.page), 0, 'local copy dropped once stored');
  await B.page.waitForSelector('text=One duel is waiting for you');
  console.log('offline finish: sent automatically when the connection came back');

  // the same, but the tab is closed while offline and opened again later
  const lostTime = await finishOffline(A.ctx, A.page);
  await A.page.close();
  await A.ctx.setOffline(false);
  const A2 = await A.ctx.newPage();
  watchErrors(A2, errors, 'A2');
  await A2.goto(link);
  await A2.waitForFunction(t => document.querySelector('#app').textContent.includes(t), lostTime);
  await A2.waitForFunction(() => Object.entries(localStorage).filter(([k]) => k.startsWith('symbolduel:local:'))
    .every(([, v]) => Object.keys(JSON.parse(v).final).length === 0));
  await B.page.waitForSelector('text=2 duels are waiting for you');
  console.log('closed tab while offline: delivered after reopening');

  // an abandoned duel is closed as "out of time" once its 10 minutes are over
  await btn(A2, 'New duel').click(); await btn(A2, 'Start').click();
  await A2.waitForSelector('.stage .card:not(.blank)');
  await playDuel(A2, { stopAfter: 2 });
  await A2.waitForTimeout(500);
  const shiftMs = 11 * 60 * 1000;   // pretend it started 11 minutes ago, in the browser and in the database
  await A2.evaluate(shift => {
    for (const [k, v] of Object.entries(localStorage)) if (k.startsWith('symbolduel:local:')){
      const d = JSON.parse(v); for (const p of Object.values(d.prog)) p.startedAt -= shift; localStorage.setItem(k, JSON.stringify(d));
    }
  }, shiftMs);
  await admin.query('update public.symbol_results set started_at = started_at - $2 where room = $1 and finished_at is null', [room, shiftMs]);
  A2.once('dialog', d => d.accept());
  await A2.reload();
  await A2.waitForSelector('text=out of time', { timeout: 8000 });
  await A2.waitForFunction(() => Object.entries(localStorage).filter(([k]) => k.startsWith('symbolduel:local:'))
    .every(([, v]) => Object.keys(JSON.parse(v).final).length === 0), null, { timeout: 8000 });
  const dnf = (await admin.query('select time_ms, finished_at - started_at as took from public.symbol_results where room = $1 and dnf', [room])).rows;
  assert.equal(dnf.length, 1); assert.equal(dnf[0].time_ms, null); assert.equal(Number(dnf[0].took), 600000);
  console.log('abandoned duel: stored as out of time after 10 minutes');

  // another device already stored a different result: the stored one wins and the local copy is dropped
  await finishOffline(A.ctx, A2);
  const { duel_id } = (await admin.query("select duel_id from public.symbol_results where room = $1 and player_key = 'vanda' and finished_at is null", [room])).rows[0];
  await admin.query("update public.symbol_results set finished_at = started_at + 7777, time_ms = 7777, splits = '{777}' where duel_id = $1 and player_key = 'vanda'", [duel_id]);
  await A.ctx.setOffline(false);
  await A2.waitForFunction(() => Object.entries(localStorage).filter(([k]) => k.startsWith('symbolduel:local:'))
    .every(([, v]) => Object.keys(JSON.parse(v).final).length === 0), null, { timeout: 10000 });
  await btn(A2, 'Back to all duels').click();
  await A2.waitForSelector('text=7.78 s');
  console.log('conflict with another device: the stored result is kept');

  // problems are explained on screen, and the note goes away when they are fixed
  for (const [mode, text] of [['paused', 'is paused because nobody played'], ['missing', 'not set up yet']]){
    api.ctl.mode = mode;
    await A2.waitForSelector(`text=${text}`, { timeout: 4 * POLL });
  }
  api.ctl.mode = 'ok';
  await A2.waitForFunction(() => !document.querySelector('.note.warn'), null, { timeout: 4 * POLL });

  // a wrong key is reported, even on the name screen of a first-time visitor
  extra.push(await serve({ transform: withSettings({ url: api.url, key: 'sb_publishable_wrong', pollMs: POLL }) }));
  const W = await A.ctx.newPage();
  watchErrors(W, errors, 'wrong key');
  await W.goto(extra.at(-1).url + '#' + room);
  await W.waitForSelector('text=publishable key');

  // half-filled settings are caught before anything is sent
  extra.push(await serve({ transform: html => html.replace("const SUPABASE_URL = '';", "const SUPABASE_URL = 'abcd.supabase.co';") }));
  await W.goto(extra.at(-1).url);
  await W.waitForSelector('text=settings are incomplete');

  // a legacy anon key (a JWT) is also sent as a bearer token; a publishable key never is
  const legacyKey = 'eyJhbGciOiJIUzI1NiJ9.legacy.anon';
  const legacy = await restShim({ pgConfig: pg.config('fresh'), key: legacyKey });
  extra.push(legacy);
  extra.push(await serve({ transform: withSettings({ url: legacy.url + '/', key: legacyKey, pollMs: POLL }) }));
  const phone = await browser.newPage({ ...devices['iPhone 13'] });
  watchErrors(phone, errors, 'phone');
  await phone.goto(extra.at(-1).url + '#' + room);
  await phone.waitForSelector('#name');
  await phone.waitForTimeout(800);
  assert.ok(legacy.ctl.calls.length >= 1 && legacy.ctl.calls.every(c => c.authorization === 'Bearer ' + legacyKey));
  assert.equal(api.ctl.calls.filter(c => c.authorization).length, 0, 'publishable key never sent as a bearer token');
  console.log('error notes (paused, not set up, wrong key, incomplete settings) and both key types work');

  const used = [...new Set(api.ctl.calls.map(c => c.fn))].sort();
  assert.deepEqual(used, ['symbol_duel_create', 'symbol_duel_room', 'symbol_duel_save_result']);
  assert.deepEqual(errors, [], 'no page errors');
  console.log(`requests to the scoreboard: ${api.ctl.calls.length}, only the three setup functions`);
  console.log('SUPABASE FLOW TESTS PASSED');
} finally {
  await browser.close();
  for (const x of extra) await x.close();
  await site.close();
  await api.close();
  await admin.end();
  await pg.stop();
}
