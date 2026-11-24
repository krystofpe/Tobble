// Demo mode (no Supabase settings): two players on one browser, penalties, resuming after a reload,
// the 10-minute limit, the phone layout and keyboard play. Screenshots go to tests/output/.
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { serve } from './helpers/serve.mjs';
import { btn, playDuel, readPair, shot, watchErrors, waitForPair } from './helpers/play.mjs';

const site = await serve();
const browser = await chromium.launch();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  watchErrors(page, errors, 'desktop');
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(site.url);

  // player one, with one wrong tap
  await page.fill('#name', 'Vanda'); await page.click('button[type=submit]');
  await page.waitForSelector('text=Challenge your opponent');
  await page.screenshot({ path: shot('demo-lobby-empty.png') });
  await btn(page, 'New duel').click();
  await page.waitForSelector('.intro');
  await btn(page, 'Start').click();
  await page.waitForSelector('.stage .card:not(.blank)');
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot('demo-play.png') });
  const t0 = Date.now();
  const seq1 = await playDuel(page, { wrongAt: 2 });
  const wall = Date.now() - t0;
  await page.waitForSelector('.result .bigtime');
  const time1 = await page.locator('.result .bigtime').textContent();
  const ms = parseFloat(time1) * 1000;
  assert.ok(Math.abs(ms - (wall + 300 + 3000)) < 2000, `time ${time1} should be the playing time plus one 3 s penalty`);
  assert.match(await page.locator('.result').textContent(), /1 wrong tap, 3 seconds/);
  await btn(page, 'Back to all duels').click();
  await page.waitForSelector('text=Waiting for your opponent');

  // player two on the same browser: sees the duel, not the time, then gets exactly the same cards
  await btn(page, 'change').click();
  await page.fill('#name', 'Petr'); await page.click('button[type=submit]');
  await page.waitForSelector('text=One duel is waiting for you');
  assert.match(await page.locator('.duel.mine').textContent(), /Vanda already played/);
  assert.ok(!(await page.locator('#app').textContent()).includes(time1), "the opponent's time stays hidden until you play");
  await page.locator('.duel.mine').getByRole('button', { name: 'Play', exact: true }).click();
  await btn(page, 'Start').click();
  await page.waitForSelector('.stage .card:not(.blank)');
  assert.deepEqual(await playDuel(page), seq1, 'both players get identical cards and layouts');
  await page.waitForSelector('.result table');
  assert.match(await page.locator('.result').textContent(), /You win!/);
  await page.screenshot({ path: shot('demo-result.png'), fullPage: true });
  await btn(page, 'Back to all duels').click();
  const board = (await page.locator('section:has(h2:text("Scoreboard")) tbody').textContent()).replace(/\s+/g, ' ');
  assert.match(board, /Petr.*you.*1.*0/);
  console.log('two players on one browser: same cards, hidden time until played, scoreboard', board.trim());

  // the clock keeps running across a reload, and the duel resumes where it stopped
  await btn(page, 'New duel').click(); await btn(page, 'Start').click();
  await page.waitForSelector('.stage .card:not(.blank)');
  const started = Date.now();
  await playDuel(page, { stopAfter: 3, wrongAt: 1 });
  await page.waitForTimeout(500);
  page.once('dialog', d => d.accept());
  await page.reload();
  await page.locator('.duel.mine').getByRole('button', { name: 'Resume', exact: true }).click();
  await page.waitForSelector('text=is already running');
  await page.waitForTimeout(1200);
  await btn(page, 'Continue').click();
  await page.waitForSelector('.stage .card:not(.blank)');
  assert.equal(await page.locator('.dots i.on').count(), 3);
  assert.equal(await page.locator('.miss b').textContent(), '1');
  const clock = parseFloat(await page.locator('.clock').textContent());
  const expected = (Date.now() - started + 3000) / 1000;
  assert.ok(Math.abs(clock - expected) < 0.8, `clock ${clock} should be about ${expected.toFixed(1)}`);
  await playDuel(page, { from: 3 });
  await page.waitForSelector('.result .bigtime');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('tobble:demo')));
  const last = stored.results.at(-1);
  assert.equal(last.splits.length, 10);
  assert.equal(last.splits.reduce((a, b) => a + b, 0), last.finishedAt - last.startedAt);
  assert.equal(last.timeMs, last.finishedAt - last.startedAt + 3000);
  console.log('reload mid-duel: resumes at pair 4 with the clock still running');

  // a duel started more than 10 minutes ago is closed as "out of time"
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('tobble:demo'));
    d.duels.push({ id: 'oldduel', seed: 42, createdAt: Date.now() - 3600e3, createdBy: 'Vanda' });
    d.results.push({ id: 'oldduel_petr', duelId: 'oldduel', key: 'petr', name: 'Petr', startedAt: Date.now() - 1800e3 });
    localStorage.setItem('tobble:demo', JSON.stringify(d));
  });
  await page.reload();
  await page.waitForSelector('text=out of time');
  await page.screenshot({ path: shot('demo-lobby.png'), fullPage: true });

  // keyboard: Enter on a focused symbol counts as a tap
  await btn(page, 'New duel').click(); await btn(page, 'Start').click();
  await waitForPair(page, 0);
  const pair = await readPair(page);
  await page.locator('.stage .card').nth(0).locator(`.sym[data-id="${pair.shared[0]}"]`).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.dots i.on').length === 1);
  console.log('out-of-time closing and keyboard play work');

  // phone, portrait: both cards fit without scrolling and taps work
  const phone = await browser.newContext({ ...devices['iPhone 13'] });
  const m = await phone.newPage();
  watchErrors(m, errors, 'phone');
  await m.goto(site.url);
  await m.fill('#name', 'Vanda'); await m.click('button[type=submit]');
  await btn(m, 'New duel').tap(); await btn(m, 'Start').tap();
  await m.waitForSelector('.stage .card:not(.blank)');
  await m.waitForTimeout(300);
  await m.screenshot({ path: shot('demo-phone-play.png') });
  const fit = await m.evaluate(() => {
    const cards = [...document.querySelectorAll('.stage .card')].map(c => c.getBoundingClientRect());
    return { inside: cards.every(r => r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight),
             noScroll: document.documentElement.scrollHeight <= innerHeight,
             smallest: Math.min(...[...document.querySelectorAll('.stage .sym')].map(s => s.getBoundingClientRect().width)) };
  });
  assert.ok(fit.inside && fit.noScroll, 'cards fit the phone screen');
  assert.ok(fit.smallest >= 40, `smallest tap target ${fit.smallest}px`);
  const p = await readPair(m);
  await m.locator('.stage .card').nth(0).locator(`.sym[data-id="${p.shared[0]}"]`).tap();
  await m.waitForFunction(() => document.querySelectorAll('.dots i.on').length === 1);
  console.log(`phone: both cards fit, smallest tap target ${Math.round(fit.smallest)}px`);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('DEMO TESTS PASSED');
} finally {
  await browser.close();
  await site.close();
}
