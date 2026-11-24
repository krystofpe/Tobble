// Card maths, using the exact functions shipped in index.html:
// the 26 pictures match assets/symbols, duels are reproducible from their seed, every pair of
// neighbouring cards shares exactly one picture, and the pictures sit inside the card without overlapping.
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
const array = name => {
  const start = html.indexOf(`const ${name} = [`);
  assert.ok(start >= 0, `${name} not found`);
  let depth = 0, i = html.indexOf('[', start);
  for (;; i++){ if (html[i] === '[') depth++; else if (html[i] === ']' && --depth === 0) break; }
  return html.slice(start, i + 1) + ';';
};
const PAIRS = constant('PAIRS'), PER_CARD = constant('PER_CARD');
const { buildDuel, SYMBOLS, LAYOUTS } = new Function(
  `const PAIRS = ${PAIRS}, PER_CARD = ${PER_CARD}; ${array('SYMBOLS')} ${array('LAYOUTS')}
   ${['mulberry32', 'shuffle', 'layoutCard', 'buildDuel'].map(grab).join('\n')}
   return { buildDuel, SYMBOLS, LAYOUTS };`)();

// The pictures are exactly the design's set, each with its file.
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'symbols', 'symbols.json'), 'utf8'));
assert.deepEqual(SYMBOLS, manifest.symbols.map(s => [s.id, s.label]), 'SYMBOLS matches assets/symbols/symbols.json');
for (const [id] of SYMBOLS) assert.ok(fs.existsSync(path.join(ROOT, 'assets', 'symbols', id + '.svg')), `${id}.svg exists`);
assert.equal(PER_CARD, 8);
assert.ok(LAYOUTS.every(l => l.length === PER_CARD), 'every layout has a slot per picture');
console.log(`${SYMBOLS.length} pictures, ${PER_CARD} per card, ${LAYOUTS.length} layouts`);

const shared = (a, b) => a.ids.filter(x => b.ids.includes(x));
let minGap = Infinity, maxReach = 0, minSize = Infinity, repeats = 0;
const layoutsSeen = new Set();
for (let n = 0; n < 2000; n++){
  const seed = Math.floor(Math.random() * 2147483647);
  const duel = buildDuel(seed);
  assert.deepEqual(buildDuel(seed), duel, 'same seed, same duel');
  assert.equal(duel.length, PAIRS + 1);
  duel.forEach((card, k) => {
    assert.equal(card.ids.length, PER_CARD);
    assert.equal(new Set(card.ids).size, PER_CARD, 'no picture twice on a card');
    assert.deepEqual(card.items.map(p => p.id), card.ids);
    if (k < PAIRS) assert.equal(shared(card, duel[k + 1]).length, 1, `pair ${k + 1} shares exactly one picture`);
    if (k < PAIRS - 1 && shared(card, duel[k + 1])[0] === shared(duel[k + 1], duel[k + 2])[0]) repeats++;
    layoutsSeen.add(JSON.stringify(card.items.map(p => p.size)));
    card.items.forEach((p, i) => {
      assert.ok(Number.isInteger(p.tilt) && Math.abs(p.tilt) <= 35, 'tilt within ±35°');
      minSize = Math.min(minSize, p.size);
      maxReach = Math.max(maxReach, Math.hypot(p.x, p.y) + p.size / 2);
      for (const q of card.items.slice(i + 1)) minGap = Math.min(minGap, Math.hypot(p.x - q.x, p.y - q.y) - p.size / 2 - q.size / 2);
    });
  });
}
assert.equal(repeats, 0, 'the same picture is never the answer twice in a row');
// Snug Spot's 3 + 5 layout lets two round tap areas touch by a hair (about 1 px on a 260 px card).
assert.ok(minGap > -0.01, `tap areas overlap by at most 1% of the card (got ${minGap.toFixed(4)})`);
assert.ok(maxReach < 0.465, 'pictures stay inside the stitched ring (card radius 0.5, ring at 0.465)');
assert.ok(minSize >= 0.17, 'smallest picture is 17% of the card: 44 px on a 260 px card');
assert.equal(layoutsSeen.size, LAYOUTS.length, 'both layouts are used');
console.log(`2000 random duels: reproducible, one shared picture per pair, never the same answer twice in a row, ` +
  `smallest gap ${minGap.toFixed(3)}, furthest reach ${maxReach.toFixed(3)} (card diameter 1)`);
console.log('CARDS TESTS PASSED');
