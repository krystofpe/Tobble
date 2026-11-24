# Tobble

A cozy spot-the-match card game for friends, played from your phones whenever you like.

Every duel is 10 pairs of round cards. The two cards of a pair always share exactly one
picture: tap it, on either card, as fast as you can. A wrong tap adds 3 seconds. Your friends
get exactly the same cards whenever they have time, and the fastest total time wins.
A shared scoreboard keeps count of who won what.

- One static page (`index.html`) plus `assets/` (26 pictures, two fonts). No build step, no
  runtime dependencies, nothing loaded from other sites.
- Scores live in a free Supabase project, reached only through three locked-down database
  functions (`supabase/setup.sql`). Without Supabase settings the game runs in demo mode,
  where scores stay in one browser.
- Hosted on GitHub Pages: every push to `main` runs the tests and publishes the site.

## Play with friends

1. Open the site, tap **Start a new game**, type your name and pick a token.
2. Tap **Send invite** (or **Copy link**) and send the link to your friends. Everyone who opens it
   sits at the same table and shares its scoreboard.
3. **Deal a new duel** and play it. Your friends find it under "Your turn" next time they open the
   link; your time stays hidden from them until they've played it.

## Setting it up

### 1. The scoreboard (Supabase, free, about 10 minutes)
1. In the [Supabase dashboard](https://supabase.com/dashboard) create a project on the free plan,
   or use one you already have: everything the setup creates is named `tobble_…`.
2. Open the **SQL Editor**, paste [`supabase/setup.sql`](supabase/setup.sql) and click **Run**.
   It should end with "Success. No rows returned". Running it again does no harm.
3. Click **Connect** and copy the project URL and the **publishable** key (`sb_publishable_…`).
   Never use the secret key.
4. Put them in `index.html`, near the top of the script:
   ```js
   const SUPABASE_URL = 'https://<your-project>.supabase.co';
   const SUPABASE_KEY = 'sb_publishable_…';
   ```
   The publishable key is meant to be public; the database only accepts the three game functions.

Free Supabase projects pause after about a week without activity. Resume the project in the
dashboard and the scores are still there.

### 2. Hosting (GitHub Pages)
In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**. After
that every push to `main` runs the tests and publishes `index.html` and `assets/`
(see [`.github/workflows/pages.yml`](.github/workflows/pages.yml)).

## Development

```bash
npm install
npx playwright install chromium   # once, for the browser tests
npm test                          # cards, SQL on real Postgres, demo mode, two-browser Supabase flow (~2 min)
npm run serve                     # play locally at http://127.0.0.1:8080 (demo mode)
```

Postgres for the tests comes from npm (`embedded-postgres`); nothing needs to be installed.
Browser tests save screenshots to `tests/output/`.

## Credits

- Game logic, scoreboard and tests start from the *Symbol Duel* prototype; the look, the 26
  pictures and the card layouts come from the *Snug Spot* design (reference in `docs/design/`).
- Fonts: [Fredoka](https://github.com/hafontia/Fredoka-One) and
  [Nunito](https://github.com/googlefonts/nunito), SIL Open Font License (`assets/fonts/OFL.txt`).
- The "find the one matching picture" mechanic is a classic; Tobble's name and art are its own.
