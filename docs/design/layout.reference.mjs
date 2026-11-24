// Snug Spot — where the 8 symbols sit on a round card (from the prototype).
//
// Each slot is { r, a, s }: distance from the centre and size as a fraction of the
// card diameter, and angle in degrees. A card picks one of the two layouts, a random
// spin and a random tilt per symbol. Seed the RNG with the server's cardId so the
// pile card looks identical on both phones.

import { createRng } from './dealer.mjs';

export const LAYOUTS = [
  // 1 centre + 7 around
  [
    { r: 0, a: 0, s: 0.25 },
    { r: 0.315, a: 0, s: 0.2 },
    { r: 0.315, a: 51.43, s: 0.17 },
    { r: 0.315, a: 102.86, s: 0.21 },
    { r: 0.315, a: 154.29, s: 0.18 },
    { r: 0.315, a: 205.71, s: 0.2 },
    { r: 0.315, a: 257.14, s: 0.17 },
    { r: 0.315, a: 308.57, s: 0.19 }
  ],
  // 3 inner + 5 outer
  [
    { r: 0.145, a: 0, s: 0.19 },
    { r: 0.145, a: 120, s: 0.17 },
    { r: 0.145, a: 240, s: 0.2 },
    { r: 0.335, a: 36, s: 0.19 },
    { r: 0.335, a: 108, s: 0.21 },
    { r: 0.335, a: 180, s: 0.17 },
    { r: 0.335, a: 252, s: 0.2 },
    { r: 0.335, a: 324, s: 0.18 }
  ]
];

/** Visual dressing for a card, derived only from its id so every client agrees. */
export function dressCard(cardId, symbolIds) {
  const rng = createRng(hash(cardId));
  return {
    layout: rng() < 0.5 ? 0 : 1,
    spin: Math.floor(rng() * 360),
    tilts: symbolIds.map(() => Math.round(rng() * 70 - 35))
  };
}

/**
 * Absolute positions in px for a card of `diameter` px.
 * At 260 px the smallest symbol is 44 px — keep that as the minimum tap target.
 */
export function placeSymbols(symbolIds, dressing, diameter) {
  const slots = LAYOUTS[dressing.layout];
  return symbolIds.map((id, i) => {
    const L = slots[i];
    const ang = ((L.a + dressing.spin) * Math.PI) / 180;
    const size = Math.round(L.s * diameter);
    const cx = diameter / 2 + L.r * diameter * Math.cos(ang);
    const cy = diameter / 2 + L.r * diameter * Math.sin(ang);
    return { id: id, left: Math.round(cx - size / 2), top: Math.round(cy - size / 2), size: size, tilt: dressing.tilts[i] };
  });
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
