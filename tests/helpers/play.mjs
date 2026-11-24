// Shared browser helpers: buttons, reading the cards on screen, and playing a duel the way a person would.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './serve.mjs';

export const OUTPUT = path.join(ROOT, 'tests', 'output');   // screenshots, for looking at the UI
fs.mkdirSync(OUTPUT, { recursive: true });
export const shot = name => path.join(OUTPUT, name);

export const btn = (page, name) => page.getByRole('button', { name, exact: true });

// The two cards on screen: symbol ids, their layout, and the one symbol they share.
export function readPair(page){
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('.stage .card')].map(card =>
      [...card.querySelectorAll('.sym')].map(s => ({ id: s.dataset.id, style: s.getAttribute('style') })));
    const shared = cards[0].filter(a => cards[1].some(b => b.id === a.id)).map(a => a.id);
    return { cards, shared };
  });
}

// Waits until pair k is on screen and ready for a tap.
export function waitForPair(page, k){
  return page.waitForFunction(n => document.querySelectorAll('.dots i.on').length === n
    && document.querySelectorAll('.stage .sym.hit').length === 0
    && document.querySelectorAll('.stage .card:not(.blank)').length === 2, k);
}

// Plays pairs from..stopAfter-1, optionally with one wrong tap on pair wrongAt.
// Returns a signature of every pair seen (symbols and their layout) to compare between players.
export async function playDuel(page, { from = 0, stopAfter = 10, wrongAt = -1 } = {}){
  const seen = [];
  for (let k = from; k < stopAfter; k++){
    await waitForPair(page, k);
    const pair = await readPair(page);
    assert.equal(pair.cards[0].length, 8);
    assert.equal(pair.cards[1].length, 8);
    assert.equal(pair.shared.length, 1, `pair ${k + 1} must share exactly one symbol`);
    seen.push(pair.cards.map(c => c.map(s => s.id + '@' + s.style).sort().join('|')).sort().join(' || '));
    if (k === wrongAt){
      const wrong = pair.cards[0].find(s => s.id !== pair.shared[0]).id;
      await page.locator('.stage .card').nth(0).locator(`.sym[data-id="${wrong}"]`).click();
    }
    await page.locator('.stage .card').nth(k % 2).locator(`.sym[data-id="${pair.shared[0]}"]`).click();
  }
  return seen;
}

// Number of finished results this browser is still holding because the scoreboard has not confirmed them.
export function unsavedCount(page){
  return page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('symbolduel:local:'))
    .reduce((n, [, v]) => n + Object.keys(JSON.parse(v).final).length, 0));
}

// Collects page errors so a test can fail on them.
export function watchErrors(page, errors, tag){
  page.on('pageerror', e => errors.push(`${tag}: ${e.message}`));
}
