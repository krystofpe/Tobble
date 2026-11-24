# Tobble — design

Date: 2026-11-24 · Status: approved in chat (approach A, name "Tobble")

## Intent
A spot-the-match card game Kryštof can play with friends. **How it plays** comes from the
Symbol Duel package (`symbol-duel.zip`): asynchronous duels, identical cards for everyone,
fastest time wins, a shared Supabase scoreboard. **How it looks** comes from the Snug Spot
design package (`snug-spot-claude-code.zip`): dark pine felt, cream stitched cards, honey and
coral, Fredoka + Nunito, 26 original symbol illustrations, its card layouts and motion.

## Goals
- Friends play from their own phones whenever they like, via one invite link, and compare
  times on a shared scoreboard.
- Looks and feels like the Snug Spot screens (`docs/design/`).
- Keeps Symbol Duel's tested code: the storage backends, the Supabase SQL and its security
  model, local safety net for unsaved results, and the test suite.
- Free static hosting from the public GitHub repo (GitHub Pages).

## Non-goals
- Live real-time races (Snug Spot's Socket.IO rooms, lobby, rematch) — not built.
- Accounts, notifications, leaderboards across games.

## Anti-goals
- Using another game's name, logo or card art (the mechanic is generic; art is original).
- Emoji as symbols, or any colour/font outside `docs/design/tokens.css`.
- Losing a result because a connection dropped or a tab closed.

## Approaches considered
- **A. Reskin Symbol Duel (chosen).** Keep the single static page, plain JS, Supabase via three
  database functions, demo mode and tests; replace look, symbols, card dealing and layouts.
  No build step, already-tested backend.
- B. Rebuild in Vite + React + TypeScript on the same Supabase functions. Tidier to extend,
  but adds a build step and rewrites most tested logic. Rejected by the user.

## Decisions (from the user)
- Gameplay = Symbol Duel; look = Snug Spot; name = **Tobble**; keep Symbol Duel's tested code.

## Rules (unchanged from Symbol Duel)
- A duel is 10 pairs of round cards; each pair shares exactly one picture; tap it on either card.
- Fastest total time wins; each wrong tap adds 3 s; the clock can't be paused and survives
  reloads; unfinished after 10 minutes = "out of time".
- Any player starts a duel any time; the others find it under "Your turn".
- Others' times stay hidden until you've played that duel (UI-only, as before).
- Scoreboard counts duels at least two players finished: won, lost, tied, average, best.
- Identity = name (normalised by `slug()`), no accounts; a game = random id in the URL hash.
- Up to 10 players per duel, 5000 duels per game.

## Builder's calls (mine, correctable)
1. **Cards.** Symbol Duel's projective plane of order 7 needs 57 pictures; the art set has 26.
   A duel only ever compares card k with card k+1, so `buildDuel(seed)` deals a seeded chain:
   card 0 = 8 random symbols; card k+1 = one symbol of card k + 7 of the 18 it lacks. Players
   see exactly the same thing: 8 pictures per card, exactly one shared per pair, identical
   for everyone with the same seed.
2. **Card look.** Snug Spot's two layouts (1+7 and 3+5), random spin and per-symbol tilt from
   the same seeded RNG; symbol `<button>`s with the SVG `<img>` inside, tilted image, upright button.
3. **Motion = the chain.** Bottom card is "your card", top card is "the pile". On a match both
   copies get the honey ring, then the pile card slides down into your card's place and the
   next pile card deals in. Wrong tap: miss ring, card shake, "+3 s" toast; no freeze (Symbol
   Duel's penalty rule). Reduced motion: no travel, rings stay.
4. **Tokens.** Players pick a token (robin, mushroom, acorn, moon, mitten, fish) next to their
   name. Stored on each result (new optional `token` column) so friends see it. You = honey ring,
   others = coral ring, never swapped.
5. **Screens** (phone column, max 480 px, centred on felt on wider screens):
   - Welcome: Snug Spot hero, "Tobble" wordmark, Start a new game / Continue my last game,
     How to play sheet, sound toggle, token chip.
   - Who's playing: Join-screen form — name, token grid, known players at this table.
   - The table: invite panel (Copy link / Send invite via Web Share), Your turn, Waiting for
     friends, Finished (with pair-by-pair), Scoreboard, sticky "Deal a new duel" button.
   - Duel: top bar (leave · Duel #n · "n left"), friends row (tokens of who already played,
     their time hidden as "?"), the pile, toast line, your card, your row with the live clock.
   - Results: fanned cards + winner token, headline ("You win!", "Ema wins!", "A perfect tie!",
     "Done!", "Out of time"), time bars per player, Fastest pair / Wrong taps tiles,
     pair-by-pair table, New duel / Back to the table.
6. **Assets.** Symbols stay as files in `assets/symbols/`; Fredoka + Nunito are self-hosted
   woff2 in `assets/fonts/` (latin + latin-ext for Czech names). No third-party requests.
7. **Database names.** Everything renamed from `symbol_*` to `tobble_*`
   (`tobble_duels`, `tobble_results`, `tobble_room`, `tobble_new_duel`, `tobble_save_result`).
   Still idempotent and safe to run in an existing project.
8. **Sound and haptics.** Small WebAudio blips (deal, match, miss) behind the sound toggle;
   `navigator.vibrate` where available.
9. **Hosting.** GitHub Actions runs the tests, then publishes `index.html` + `assets/` to
   GitHub Pages. Supabase URL + publishable key go in `index.html` (the key is public by design).

## Needs from the user
- Enable GitHub Pages (Settings → Pages → Source: GitHub Actions).
- Run `supabase/setup.sql` in their Supabase project and share the URL + publishable key.
  Until then the site runs in demo mode (one browser only).

## Done means
`npm test` green (cards, SQL, demo flow, two-browser Supabase flow); a full duel playable at
390 × 844 and 320 px wide without horizontal scroll; deployed on GitHub Pages.
