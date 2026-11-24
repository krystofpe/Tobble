# Tobble

An asynchronous spot-the-match card game for friends who are rarely online at the same time.
Each duel is ten pairs of round cards; every pair shares exactly one picture and the player taps it as fast as they can.
Everyone gets identical cards whenever they get round to it, and a shared Supabase scoreboard compares them.
The game is one static `index.html` plus `assets/` (pictures, fonts): no build step, no runtime dependencies, no CDN.

History: the code started as the tested *Symbol Duel* prototype (gameplay, Supabase, tests) and was restyled to the
*Snug Spot* design (look, symbols, layouts, motion). Design doc: `docs/superpowers/specs/2026-11-24-tobble-design.md`.

## Status
- Playable in **demo mode** (scores in the browser only) while the Supabase settings in `index.html` are empty.
- The Supabase path is tested against real Postgres 17 behind a stand-in for Supabase's REST layer
  (`tests/helpers/rest-shim.mjs`); check it against the real project after any SQL change.
- Deployed by `.github/workflows/pages.yml` to GitHub Pages (tests first, then publish `index.html` + `assets/`).

## Commands
```bash
npm install
npx playwright install chromium   # once
npm test                          # cards, SQL, demo mode, two-device Supabase flow (about 2 minutes)
npm run test:cards | test:sql | test:demo | test:flow
npm run serve                     # http://127.0.0.1:8080 (PORT=... to change)
```
Browser tests write screenshots to `tests/output/` (gitignored); look at them after changing the UI.

## Files
```
index.html                   the game: CSS, then one script IIFE in numbered sections
assets/symbols/              26 SVG pictures + symbols.json (ids, labels) — the only illustrations
assets/fonts/                Fredoka + Nunito variable woff2 (latin, latin-ext), OFL.txt
supabase/setup.sql           one-time setup for the Supabase SQL Editor; identical copy embedded in index.html
docs/design/                 Snug Spot design reference: tokens.css, screens/*.dc.html, symbol sheet, spec
tests/cards.test.mjs         dealing maths and layouts, using the exact functions from index.html
tests/sql.test.mjs           setup.sql on real Postgres as the API roles, two database flavours
tests/demo.test.mjs          demo mode in a browser: two players, penalties, reload/resume, time limit, phone, 320 px
tests/supabase-flow.test.mjs two browsers through the Supabase path: live results, offline finish, conflicts, error notes
tests/helpers/               serve (static server + settings injection), postgres, rest-shim, play (Playwright helpers)
```

## Game rules (decided with the user; keep them unless asked)
- **Asynchronous duels on demand.** Anyone at the table deals a duel and plays it; the others find it under
  "Your turn". No notifications by design.
- **Cards:** 26 pictures, 8 per card. A duel is a seeded chain of 11 cards; pair k is card k with card k+1 and they
  share exactly one picture. Card k+1 keeps one picture of card k (never the previous answer) plus 7 it lacks.
  The same seed (mulberry32) gives everyone the same pictures, layouts, spins and tilts.
- **Scoring:** fastest total time wins; a wrong tap adds 3 s (no freeze); the clock can't be paused and keeps running
  across reloads; unfinished after 10 minutes = "out of time". The time includes the short animation between pairs,
  which is the same for everyone.
- **Hidden times:** others' times for a duel are hidden until you've played it (UI only, not enforced against someone
  reading network traffic; fine for friends).
- **Scoreboard:** counts duels at least two players finished: won, lost, tied, average, best.
- **Identity:** no accounts. A player is their name normalised by `slug()`, plus a token (robin, mushroom, acorn, moon,
  mitten, fish) stored on their results. A game is a 20-character random id in the URL hash (the invite link).
- **Name and art:** "Tobble" with the Snug Spot pictures. Don't use another game's name, logo or card art.

## Design rules
- `docs/design/screens/*.dc.html` are the visual source of truth (read `docs/design/screens/README.md`); copy sizes,
  colours, radii and shadows from them. Tokens in the `:root` block mirror `docs/design/tokens.css` — no new colours or fonts.
- You = honey, everyone else = coral, never swapped. No emoji anywhere.
- Phone column designed at 390 × 844; no sideways scroll from 320 to 480 px; ≥ 44 px tap targets where the screen allows;
  real `<button>`s; focus ring 3 px honey; `prefers-reduced-motion` removes travel and keeps the rings.
- Duel screen: tall screens show the friends row, "The pile" caption and your row with the clock; below 800 px tall
  those hide and the clock moves into the top bar; landscape phones show the cards side by side.

## How index.html is organised
Script sections: 1 settings, 2 cards, 3 helpers, 4 storage backends, 5 app state, 6 start-up, 7 screens, 8 playing a duel.
- **Settings:** `SUPABASE_URL`, `SUPABASE_KEY`, `POLL_MS`, `PAIRS`, `PENALTY_MS`, `TIME_LIMIT_MS`, `PER_CARD`, `TOKENS`,
  `SYMBOLS` (must equal `assets/symbols/symbols.json`), `LAYOUTS`. Both Supabase settings empty → demo mode; half-filled
  or a URL not starting with `https://` (or `http://localhost` / `127.0.0.1`) → a settings-problem screen.
- **Backends** share one interface: `subscribe(room, { onData, onError, isActive })` → `{ stop, now }`, plus
  `createDuel(room, duel)` and `saveResult(room, result)`. `localBackend` = demo (localStorage, room "demo");
  `supabaseBackend` calls the three functions with `fetch` to `/rest/v1/rpc/<name>` (no supabase-js).
- **Keys:** a publishable key (`sb_publishable_…`) goes in the `apikey` header only; a legacy anon JWT also as Bearer.
- **Polling:** every `POLL_MS` while the tab is visible; never while a duel is on screen; at once on `visibilitychange`,
  `online` and after a save. Screens redraw only when the data signature changes.
- **Nothing is lost locally:** an in-progress duel (`state.local.prog`) and an unconfirmed finished result
  (`state.local.final`) live in localStorage per game and player (`tobble:local:<room>:<key>`). `housekeeping()` re-sends
  unsaved results, closes duels past the time limit as "out of time", and drops the local copy only once the server lists it.
- **Untrusted data:** everything from storage goes through `cleanDuel` / `cleanResult`; all text is set with `textContent`
  via `h()`. Only fixed markup in the file (icons, the hero/fan drawings) uses `innerHTML`. Keep it that way.
- **Duel screen:** `.play[data-pair][data-ready]` tells tests which pair is tappable; `.card.pile` / `.card.you`; a match
  rings the picture for `HIT_MS`, then the pile card slides (measured offset) into your slot and the next pile card deals.

## Supabase design
- `supabase/setup.sql` and `SETUP_SQL` in index.html must stay byte-identical (`tests/helpers/postgres.mjs` checks).
- Tables `tobble_duels`, `tobble_results` have RLS on with **no policies** and all table privileges revoked from `anon`
  and `authenticated`. The only API: `tobble_room(p_room)`, `tobble_new_duel(p_room, p_id, p_seed, p_created_by)`,
  `tobble_save_result(p_room, p_result jsonb)` — `SECURITY DEFINER`, `search_path = ''`, execute granted explicitly to
  `anon, authenticated` (new Supabase projects no longer expose `public` objects automatically).
- Rules in SQL: game ids `^[a-z0-9]{16,40}$`; a result is final once it has `finished_at` (identical re-sends are no-ops);
  the start time can't change; tokens `^[a-z]{2,12}$` and kept when a later save omits them; ≤ 10 players per duel,
  ≤ 5000 duels per game.
- Raise errors with the default SQLSTATE (P0001 → HTTP 400 "refused"); 54xxx/55xxx would become 500 and be retried.
- Free projects pause after about a week of low activity; resuming keeps the data.

## Tests: what to know
- `rest-shim.mjs` imitates the gateway + PostgREST for RPC only; it is not PostgREST.
- `postgres.mjs` builds a `legacy` and a `fresh` database flavour and runs the setup twice in each.
- Timing assertions have generous margins; if one flakes on a slow machine, widen the margin rather than the logic.
- Keep `npm test` green before calling a change done, and add a check when adding a rule to the SQL or the game.
