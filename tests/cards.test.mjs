// Card maths, using the exact functions shipped in index.html:
// 57 cards with 8 symbols, any two cards share exactly one symbol, duels are reproducible from their seed,
// and symbols on a card never overlap.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers/serve.mjs';

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const grab = name => {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} not found in index.html`);
  let depth = 0, i = html.indexOf('{', start);
  for (;; i++){ if (html[i] === '{') depth++; else if (html[i] === '}' && --depth === 0) break; }
  return html.slice(start, i + 1);
};
const constant = name => { const m = html.match(new RegExp(`const ${name} = (\\d+);`)); assert.ok(m, `${name} not found`); return Number(m[1]); };
const symbolsStart = html.indexOf('const SYMBOLS = [');
const symbolsSrc = html.slice(symbolsStart, html.indexOf('];', symbolsStart) + 2);
const PAIRS = constant('PAIRS'), ORDER = constant('ORDER');
const { buildDeck, buildDuel, SYMBOLS } = new Function(
  `const PAIRS = ${PAIRS}, ORDER = ${ORDER}; ${symbolsSrc}
   ${['mulberry32', 'shuffle', 'buildDeck', 'layoutCard', 'buildDuel'].map(grab).join('\n')}
   return { buildDeck, buildDuel, SYMBOLS };`)();

const deck = buildDeck(ORDER);
const perCard = ORDER + 1, cardCount = ORDER * ORDER + ORDER + 1;
assert.equal(deck.length, cardCount);
assert.ok(deck.every(c => new Set(c).size === perCard));
assert.equal(new Set(deck.flat()).size, cardCount, 'every symbol is used');
for (let a = 0; a < deck.length; a++) for (let b = a + 1; b < deck.length; b++){
  assert.equal(deck[a].filter(x => deck[b].includes(x)).length, 1, `cards ${a} and ${b} must share exactly one symbol`);
}
console.log(`deck: ${deck.length} cards, ${perCard} symbols each, every pair of cards shares exactly one symbol`);

assert.ok(SYMBOLS.length >= cardCount, 'enough pictures for every symbol');
assert.equal(new Set(SYMBOLS.map(s => s[0])).size, SYMBOLS.length, 'no duplicate pictures');
assert.equal(new Set(SYMBOLS.map(s => s[1])).size, SYMBOLS.length, 'no duplicate labels');

let minGap = Infinity, maxReach = 0;
for (let n = 0; n < 2000; n++){
  const seed = Math.floor(Math.random() * 2147483647);
  const duel = buildDuel(seed);
  assert.deepEqual(buildDuel(seed), duel, 'same seed, same duel');
  assert.equal(duel.length, PAIRS + 1);
  duel.forEach((card, k) => {
    assert.equal(new Set(card.ids).size, perCard);
    if (k < PAIRS) assert.equal(card.ids.filter(x => duel[k + 1].ids.includes(x)).length, 1);
    card.items.forEach((p, i) => {
      maxReach = Math.max(maxReach, Math.hypot(p.x, p.y) + p.size / 2);
      for (const q of card.items.slice(i + 1)) minGap = Math.min(minGap, Math.hypot(p.x - q.x, p.y - q.y) - p.size / 2 - q.size / 2);
    });
  });
}
assert.ok(minGap > 0, 'tap areas never overlap');
assert.ok(maxReach < 0.95, 'symbols stay inside the card');
console.log(`2000 random duels: reproducible, one shared symbol per pair, smallest gap between tap areas ${minGap.toFixed(3)}, furthest reach ${maxReach.toFixed(3)} (card radius 1)`);
console.log('CARDS TESTS PASSED');
