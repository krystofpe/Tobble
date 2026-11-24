# Symbol Duel

An asynchronous, Dobble-style matching game for two (or a few) players who are rarely online at the same time.
Each duel is ten pairs of round cards; every pair shares exactly one symbol and the player taps it as fast as they can.
Both players get identical cards whenever they get round to it, and a shared Supabase scoreboard compares them.
The whole game is one self-contained `index.html`: no build step, no runtime dependencies, no CDN scripts.

## Status

- Playable now in **demo mode** (scores kept in the browser only), which is what you get while the Supabase settings are empty.
- The **Supabase scoreboard** is written and tested against real Postgres 17 behind a stand-in for Supabase's REST layer,
  but it has **never run against a real Supabase project**. That is the next step (see "Next steps").
- Not deployed anywhere yet.
- An earlier version used Firebase/Firestore; it was replaced by Supabase because the user already has a Supabase account.

## Commands

```bash
npm install
npx playwright install chromium   # once, for the browser tests
npm test                          # everything: cards, SQL, demo mode, two-device Supabase flow (about 2 minutes)
npm run test:cards | test:sql | test:demo | test:flow
npm run serve                     # play locally at http://127.0.0.1:8080 (PORT=... to change)
```

Postgres for the tests comes from npm (`embedded-postgres`, Postgres 17); nothing needs to be installed or running.
Browser tests write screenshots to `tests/output/` (gitignored); look at them after changing the UI.

## Files

```
index.html                   the game (HTML + CSS + JS in one file)
supabase/setup.sql           one-time setup for the Supabase SQL Editor; identical copy embedded in index.html
tests/cards.test.mjs         deck maths, using the exact functions from index.html
tests/sql.test.mjs           setup.sql on real Postgres as the API roles: 40 allowed/refused checks, two database flavours
tests/demo.test.mjs          demo mode in a browser: two players, penalties, reload/resume, time limit, phone, keyboard
tests/supabase-flow.test.mjs two browsers through the Supabase code path: live updates, offline finish, conflicts, error notes
tests/helpers/               serve (static server + settings injection), postgres (embedded, Supabase-shaped),
                             rest-shim (PostgREST stand-in), play (Playwright helpers)
```

## Game rules (decided with the user; keep them unless asked)

- **Asynchronous duel, challenges on demand.** Either player starts a duel at any time and plays it; the other finds it
  under "Your turn" next time they open the game. There are no notifications by design: the user has no way to notify the opponent.
- **Cards:** finite projective plane of order 7 → 57 cards, 8 symbols each, any two cards share exactly one symbol.
  A duel is a chain of 11 cards; pair k is card k with card k+1. A seeded PRNG (mulberry32) makes the cards, symbol pictures,
  positions, sizes and rotations identical for every player of the same duel.
- **Scoring:** fastest total time wins. A wrong tap adds 3 s. The clock cannot be paused and keeps running across reloads.
  A duel unfinished after 10 minutes counts as "out of time" (a loss).
- **Hidden times:** the opponent's time for a duel is not shown until you have played it. This is UI only; the API returns
  every result in the game, so it is not enforced against someone reading the network traffic. Acceptable for a friendly game.
- **Scoreboard:** counts duels that at least two players finished: won, lost, tied, average and best time.
- **Identity:** no accounts. A player is their name, normalised by `slug()`, so "Vanda" and " vanda " are the same player.
  A game is a 20-character random id in the URL hash (the invite link); anyone with the link can play and write scores.
- **Name and art:** "Symbol Duel" with emoji symbols, deliberately not "Dobble"/"Spot It!" or their artwork (Asmodee trademarks).
  Don't reintroduce those names or imitate the original cards.

## How index.html is organised

The script is one IIFE in numbered sections: 1 settings, 2 cards, 3 helpers, 4 storage backends, 5 app state,
6 start-up, 7 screens, 8 playing a duel.

- **Settings** at the top: `SUPABASE_URL`, `SUPABASE_KEY`, `POLL_MS` (10 s), `PAIRS`, `PENALTY_MS`, `TIME_LIMIT_MS`, `ORDER`.
  Both Supabase settings empty → demo mode; one filled and not the other, or a URL not starting with `https://`
  (or `http://localhost` / `http://127.0.0.1` for local Supabase) → an "incomplete settings" screen.
- **Backends** share one interface: `subscribe(room, { onData, onError, isActive })` returns `{ stop, now }`, plus
  `createDuel(room, duel)` and `saveResult(room, result)`.
  `localBackend` is demo mode (localStorage, room "demo"). `supabaseBackend` calls the three database functions with
  `fetch` to `/rest/v1/rpc/<name>`; there is no supabase-js.
- **Keys:** a publishable key (`sb_publishable_…`) goes in the `apikey` header only, as Supabase's docs require.
  A legacy anon key (a JWT starting `eyJ`) is also sent as `Authorization: Bearer`.
- **Updates by polling:** every `POLL_MS` while the tab is visible; never while a duel is on screen (`isActive`); at once on
  `visibilitychange`, `online` and after a result is saved. The page redraws only when the data's signature changes,
  so polling doesn't disturb text selection or open panels.
- **Nothing is lost locally:** an in-progress duel (`state.local.prog`) and a finished result the server has not confirmed
  (`state.local.final`) live in localStorage per game and player. `housekeeping()` runs after every poll: it re-sends unsaved
  results, closes duels past the time limit as "out of time", and drops the local copy only once the server lists the
  finished result. On a conflict the stored result wins.
- **Untrusted data:** everything from storage goes through `cleanDuel` / `cleanResult`, and all text is set with
  `textContent` via the `h()` element helper. Keep it that way; never build HTML strings from stored values.
- **Error notes** map responses to plain advice: 540 paused project, 404 setup not run, 401/403 wrong key, 402 restricted,
  5xx or network → unreachable (mentions pausing), other 4xx → refused with the server's message.

## Supabase design

- `supabase/setup.sql` and `SETUP_SQL` in index.html must stay byte-identical (the in-game guide shows it with a Copy button).
  Change both together; `tests/helpers/postgres.mjs` fails if they differ.
- Tables `symbol_duels` and `symbol_results` have row level security on with **no policies** and all table privileges
  revoked from `anon` and `authenticated`, so the Data API cannot reach them at all.
- The only API is three `SECURITY DEFINER` functions with `search_path = ''` and fully qualified names:
  `symbol_duel_room(p_room)` (everything in one game, as JSON), `symbol_duel_create(p_room, p_id, p_seed, p_created_by)`
  and `symbol_duel_save_result(p_room, p_result jsonb)`. Execute is revoked from PUBLIC and granted explicitly to
  `anon, authenticated`. Explicit grants are required now that Supabase no longer exposes new objects in `public`
  automatically (default for new projects since 2026-05-30, all projects since 2026-10-30).
- Rules enforced in SQL: game ids `^[a-z0-9]{16,40}$`; a result is final once it has `finished_at` (re-sending the identical
  result is a no-op so lost replies can be retried); the start time cannot change; at most 10 players per duel and 5000
  duels per game; lengths and shapes checked. Duels are never changed or deleted.
- Raise errors with the default SQLSTATE (P0001). PostgREST turns it into HTTP 400, which the page treats as "refused".
  Classes such as 54xxx or 55xxx become HTTP 500, which the page would keep retrying as "unavailable".
- The script is idempotent and everything is named `symbol_*`, so it can run again and can share an existing project.
- Free Supabase projects pause after about a week of low activity. Resuming in the dashboard keeps the data.

## Tests: what to know

- `tests/helpers/rest-shim.mjs` imitates the gateway + PostgREST for RPC only: it checks the `apikey` header, picks the
  function by argument names, runs it as role `anon` on real Postgres, and answers with PostgREST's status codes and
  JSON error shape. It is not PostgREST, which is why a real-project check is still needed.
- `tests/helpers/postgres.mjs` builds two databases: `legacy` (new objects auto-granted to the API roles, like older
  projects) and `fresh` (nothing auto-granted, like newer ones). The setup script runs twice in each to prove it is re-runnable.
- Timing assertions (clock, polling) have generous margins. If one flakes on a slow machine, widen the margin rather
  than changing the logic it checks.
- Keep `npm test` green before calling any change done, and add a check when adding a rule to the SQL or the game.

## Next steps

1. **Verify against real Supabase.** Either the user's project (run `supabase/setup.sql` in the SQL Editor, fill in
   `SUPABASE_URL` and the publishable key from the project's Connect dialog, `npm run serve`, play from two browsers),
   or a local stack with the Supabase CLI (`supabase init`, `supabase start`, which needs Docker; API at
   `http://127.0.0.1:54321`, keys from `supabase status`; the user has a `~/.supabase` folder, so the CLI may already be set up).
   A useful addition: let `tests/supabase-flow.test.mjs` take a real URL and key from environment variables instead of the stand-in.
2. **Deploy.** Any static host. The quickest is Netlify Drop: put the file alone in a folder as `index.html`, drag the
   folder onto app.netlify.com/drop and claim the site (unclaimed sites are password-protected and deleted within an hour).
   Never commit or publish a copy with a secret key; the publishable key is meant to be public.
3. **Ideas not done:** Supabase Realtime broadcast instead of polling; a keep-alive against free-plan pausing;
   rematch or best-of-N; server-side checks on times (the client measures time, so a determined player could cheat).
